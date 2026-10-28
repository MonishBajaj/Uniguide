"""Welcome, weekly digest and re-engagement emails. Runs as the notifier role, next to the deadline reminders.

Each email is logged in lifecycle_log, so a repeated run sends nothing twice. Every message ends with a link that
unsubscribes from it. Deadline reminders are separate and never go through here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from .db import Connection
from .mailer import Mailer, Message
from .notify import NotifyReport, local_date

WELCOME_DAYS = {"welcome_1": 0, "welcome_2": 3, "welcome_3": 7}
WELCOME_WINDOW_DAYS = 14  # accounts older than this never get the welcome series, so a launch does not email everyone
DIGEST_HORIZON_DAYS = 30
REENGAGE_AFTER_DAYS = 14

WELCOME_COPY = {
    "welcome_1": (
        "Welcome to Uniguide",
        "Uniguide shows requirements, fees and deadlines with the official page beside every fact.\n\n"
        "Start by telling us your qualification, budget and the countries you are considering. Courses you cannot "
        "apply to are set aside with the reason.\n\n{site}/app/profile",
    ),
    "welcome_2": (
        "How matching works",
        "Each course shows which published requirements you meet and which we cannot check yet, a low, base and "
        "high cost, and the next deadline. We never show an admission percentage.\n\n{site}/app/match",
    ),
    "welcome_3": (
        "Shortlist courses and get reminded",
        "Shortlist a course and its checklist appears in your tracker, with reminders before each deadline and a "
        "calendar file you can import.\n\n{site}/app/tracker",
    ),
}


@dataclass(frozen=True)
class LifecycleMessage:
    user_id: Any
    email: str
    kind: str
    period_key: str
    subject: str
    body: str


def iso_week(now: datetime) -> str:
    year, week, _ = now.isocalendar()
    return f"{year}-W{week:02d}"


def _footer(site_url: str, token: str) -> str:
    return f"\n\n--\nStop these emails: {site_url}/unsubscribe/{token}"


def _digest_items(conn: Connection, user_id: Any, now: datetime) -> list[str]:
    rows = conn.execute(
        """
        select p.title as program, i.name as institution, d.due_at, d.timezone, d.precision
        from applications a
        join checklist_items ci on ci.application_id = a.id and not ci.done and ci.deadline_id is not null
        join deadlines d on d.id = ci.deadline_id
        join program_cycles c on c.id = a.cycle_id
        join programs p on p.id = c.program_id
        join institutions i on i.id = p.institution_id
        where a.user_id = %s and a.status in ('shortlisted', 'preparing', 'submitted')
          and d.due_at > %s and d.due_at <= %s
        order by d.due_at
        """,
        (user_id, now, now + timedelta(days=DIGEST_HORIZON_DAYS)),
    ).fetchall()
    seen: set[tuple[Any, ...]] = set()
    items = []
    for r in rows:
        key = (r["program"], r["due_at"])
        if key in seen:
            continue
        seen.add(key)
        items.append(f"- {r['program']}, {r['institution']}: {local_date(r['due_at'], r['timezone'], r['precision'])}")
    return items


def due_lifecycle(conn: Connection, site_url: str, now: datetime) -> list[LifecycleMessage]:
    """Messages due now that have not been sent."""
    sent = {
        (r["user_id"], r["kind"], r["period_key"])
        for r in conn.execute("select user_id, kind, period_key from lifecycle_log")
    }
    out: list[LifecycleMessage] = []
    for r in conn.execute("select * from public.notifier_lifecycle_recipients()").fetchall():
        uid, token = r["user_id"], r["unsubscribe_token"]
        age = (now - r["created_at"]).days

        def add(
            kind: str, period: str, subject: str, body: str, uid: Any = uid, email: str = r["email"], token: str = token
        ) -> None:
            if (uid, kind, period) not in sent:
                out.append(LifecycleMessage(uid, email, kind, period, subject, body + _footer(site_url, token)))

        if r["tips"] and 0 <= age <= WELCOME_WINDOW_DAYS:
            for kind, day in WELCOME_DAYS.items():
                subject, body = WELCOME_COPY[kind]
                if age >= day:
                    add(kind, kind, subject, body.format(site=site_url))

        if r["digest"] and now.weekday() == 0:
            items = _digest_items(conn, uid, now)
            if items:
                add(
                    "digest",
                    iso_week(now),
                    "Your deadlines in the next 30 days",
                    "Upcoming deadlines for your shortlist:\n\n" + "\n".join(items) + f"\n\n{site_url}/app/tracker",
                )

        last_seen = r["last_sign_in_at"]
        if r["tips"] and r["has_shortlist"] and last_seen is not None and (now - last_seen).days >= REENGAGE_AFTER_DAYS:
            add(
                "reengage",
                "once",
                "Your shortlist is waiting",
                "You have not visited for a while. Your shortlist and checklists are where you left them."
                f"\n\n{site_url}/app/shortlist",
            )
    return out


def send_lifecycle(conn: Connection, mailer: Mailer, site_url: str, now: datetime | None = None) -> NotifyReport:
    now = now or datetime.now(UTC)
    report = NotifyReport(dry_run=mailer.dry_run)
    for m in due_lifecycle(conn, site_url, now):
        if mailer.send(Message(to=m.email, subject=m.subject, text=m.body)):
            conn.execute(
                "insert into lifecycle_log (user_id, kind, period_key) values (%s, %s, %s) on conflict do nothing",
                (m.user_id, m.kind, m.period_key),
            )
            report.updates += 1
        else:
            report.failures += 1
    conn.commit()
    return report
