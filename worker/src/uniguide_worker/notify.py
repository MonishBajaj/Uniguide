"""Deadline reminders and update emails. Runs as the notifier role (NOTIFIER_DATABASE_URL).

A reminder goes out when a deadline on a student's active application is exactly one of their
chosen day offsets away (in whole days, rounded up). reminder_log makes each send happen once.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from .db import Connection
from .mailer import Mailer, Message

ACTIVE = ("shortlisted", "preparing", "submitted")


@dataclass
class NotifyReport:
    reminders: int = 0
    updates: int = 0
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
