"""Deadline reminders, update emails and the weekly parent email. Runs as the notifier role
(NOTIFIER_DATABASE_URL).

A reminder goes out when a deadline on a student's active application is exactly one of their
chosen day offsets away (in whole days, rounded up). reminder_log makes each send happen once.
Parents linked to a student get one summary per ISO week (parent_digest_log), with no grades,
scores or writing in it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .db import Connection
from .mailer import Mailer, Message

ACTIVE = ("shortlisted", "preparing", "submitted")


@dataclass
class NotifyReport:
    reminders: int = 0
    updates: int = 0
    parent_digests: int = 0
    failures: int = 0
    dry_run: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__


def days_until(due: datetime, now: datetime) -> int:
    return math.ceil((due - now).total_seconds() / 86_400)


def local_date(due: datetime, tz: str, precision: str) -> str:
    local = due.astimezone(ZoneInfo(tz))
    text = f"{local.day} {local:%B %Y}"
    return f"{text}, {local:%H:%M %Z}" if precision == "exact_time" else text


def send_reminders(conn: Connection, mailer: Mailer, site_url: str, now: datetime | None = None) -> NotifyReport:
    now = now or datetime.now(UTC)
    report = NotifyReport(dry_run=mailer.dry_run)
    recipients = {r["user_id"]: r for r in conn.execute("select * from public.notifier_recipients()")}

    rows = conn.execute(
        """
        select a.id as application_id, a.user_id, ci.title as step, d.due_at, d.timezone, d.precision, d.status,
               p.slug, p.title as program, i.name as institution
        from applications a
        join checklist_items ci on ci.application_id = a.id and not ci.done and ci.deadline_id is not null
        join deadlines d on d.id = ci.deadline_id
        join program_cycles c on c.id = a.cycle_id
        join programs p on p.id = c.program_id
        join institutions i on i.id = p.institution_id
        where a.status = any(%s) and d.due_at > %s
        -- Several steps can point at one deadline; the deadline step itself names the email.
        order by a.id, d.due_at, (ci.kind = 'deadline') desc
        """,
        (list(ACTIVE), now),
    ).fetchall()

    for row in rows:
        recipient = recipients.get(row["user_id"])
        if recipient is None:
            continue
        days = days_until(row["due_at"], now)
        if days not in (recipient["reminder_days"] or []):
            continue
        already = conn.execute(
            "select 1 from reminder_log where application_id = %s and due_at = %s and days_before = %s",
            (row["application_id"], row["due_at"], days),
        ).fetchone()
        if already:
            continue
        when = local_date(row["due_at"], row["timezone"], row["precision"])
        caution = "" if row["status"] == "verified" else "\nThis date has not been verified by a person yet."
        ok = mailer.send(
            Message(
                to=recipient["email"],
                subject=f"{days} day{'s' if days != 1 else ''} left: {row['program']}, {row['institution']}",
                text=(
                    f"{row['step']} for {row['program']} at {row['institution']} is due {when}.{caution}\n\n"
                    f"Confirm the date on the official page: {site_url}/courses/{row['slug']}\n"
                    f"Your tracker: {site_url}/app/tracker/{row['application_id']}\n\n"
                    f"Change reminders on your profile: {site_url}/app/profile"
                ),
            )
        )
        if ok:
            conn.execute(
                "insert into reminder_log (user_id, application_id, due_at, days_before) values (%s, %s, %s, %s)",
                (row["user_id"], row["application_id"], row["due_at"], days),
            )
            report.reminders += 1
        else:
            report.failures += 1
    conn.commit()

    pending = conn.execute(
        """
        select id, user_id, title, body from notifications
        where emailed_at is null and kind <> 'reminder'
        order by created_at
        """
    ).fetchall()
    by_user: dict[Any, list[dict[str, Any]]] = {}
    for n in pending:
        if n["user_id"] in recipients:
            by_user.setdefault(n["user_id"], []).append(n)
    for user_id, items in by_user.items():
        body = "\n\n".join(f"{n['title']}\n{n['body'] or ''}".strip() for n in items)
        ok = mailer.send(
            Message(
                to=recipients[user_id]["email"],
                subject=items[0]["title"] if len(items) == 1 else f"{len(items)} updates on your courses",
                text=f"{body}\n\nSee all updates: {site_url}/app/notifications",
            )
        )
        if ok:
            conn.execute("update notifications set emailed_at = now() where id = any(%s)", ([n["id"] for n in items],))
            report.updates += len(items)
        else:
            report.failures += 1
    conn.commit()
    return report


def week_start(now: datetime) -> date:
    """Monday of the ISO week, the key that makes the parent email weekly."""
    return (now - timedelta(days=now.weekday())).date()


def parent_digest_text(student: str, apps: list[dict[str, Any]], now: datetime, site_url: str) -> str:
    lines = [f"{student} is tracking {len(apps)} application{'s' if len(apps) != 1 else ''}.", ""]
    for a in apps:
        status = (a["decision"] or a["status"]).replace("_", " ").capitalize()
        line = f"- {a['program']}, {a['institution']}: {status}, {a['done']} of {a['total']} steps done"
        if a["next_due"] is not None:
            when = local_date(a["next_due"], a["next_tz"], a["next_precision"])
            days = days_until(a["next_due"], now)
            line += f". Next: {a['next_step']}, {when} ({days} day{'s' if days != 1 else ''})"
        lines.append(line)
    lines += [
        "",
        f"See their progress: {site_url}/parent",
        f"You get this weekly because {student} invited you. Turn it off on the same page.",
    ]
    return "\n".join(lines)


def send_parent_digests(conn: Connection, mailer: Mailer, site_url: str, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    week = week_start(now)
    sent = 0
    for r in conn.execute("select * from public.parent_digest_recipients()").fetchall():
        if conn.execute(
            "select 1 from parent_digest_log where parent_id = %s and student_id = %s and week_start = %s",
            (r["parent_id"], r["student_id"], week),
        ).fetchone():
            continue
        apps = conn.execute(
            """
            select a.status::text as status, a.decision::text as decision, p.title as program, i.name as institution,
                   count(ci.id) filter (where ci.done) as done, count(ci.id) as total,
                   nx.title as next_step, nx.due_at as next_due, nx.timezone as next_tz,
                   nx.precision::text as next_precision
            from applications a
            join program_cycles c on c.id = a.cycle_id
            join programs p on p.id = c.program_id
            join institutions i on i.id = p.institution_id
            left join checklist_items ci on ci.application_id = a.id
            left join lateral (
              select ci2.title, d.due_at, d.timezone, d.precision
              from checklist_items ci2 join deadlines d on d.id = ci2.deadline_id
              where ci2.application_id = a.id and not ci2.done and d.due_at > %s
              order by d.due_at limit 1
            ) nx on true
            where a.user_id = %s and a.status <> 'withdrawn'
            group by a.id, p.title, i.name, nx.title, nx.due_at, nx.timezone, nx.precision
            order by nx.due_at nulls last, p.title
            """,
            (now, r["student_id"]),
        ).fetchall()
        if not apps:
            continue  # nothing to report yet; no empty emails
        ok = mailer.send(
            Message(
                to=r["email"],
                subject=f"This week: {r['student_name']}'s applications",
                text=parent_digest_text(r["student_name"], apps, now, site_url),
            )
        )
        if ok:
            conn.execute(
                "insert into parent_digest_log (parent_id, student_id, week_start) values (%s, %s, %s)",
                (r["parent_id"], r["student_id"], week),
            )
            sent += 1
    conn.commit()
    return sent
