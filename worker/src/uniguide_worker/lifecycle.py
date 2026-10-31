"""Welcome, weekly digest, journey and re-engagement emails. Runs as the notifier role, next to the deadline reminders.

A student whose journey was computed in the last 8 days gets the journey digest (stage, top steps and deadlines,
led by a nudge when they have stalled) instead of the plain deadline digest, and one email when they reach stage
4, 6 or 7 (journey M4, J4.3).

Each email is logged in lifecycle_log, so a repeated run sends nothing twice. Every message ends with a link that
unsubscribes from it. Deadline reminders are separate and never go through here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from . import journey
from .db import Connection
from .mailer import Mailer, Message
from .notify import NotifyReport, local_date

WELCOME_DAYS = {"welcome_1": 0, "welcome_2": 3, "welcome_3": 7}
WELCOME_WINDOW_DAYS = 14  # accounts older than this never get the welcome series, so a launch does not email everyone
DIGEST_HORIZON_DAYS = 30
REENGAGE_AFTER_DAYS = 14
STAGE_EMAIL_STAGES = (4, 6, 7)
STAGE_EMAIL_WINDOW_DAYS = 7  # switching stage emails on never sends old news

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
        select p.title as program, i.name as institution, d.due_at, d.timezone, d.precision, d.status::text as status
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
        # A deadline that isn't verified says so, as it does on the site.
        check = "" if r["status"] == "verified" else " (not yet verified, check the official page)"
        when = local_date(r["due_at"], r["timezone"], r["precision"])
        items.append(f"- {r['program']}, {r['institution']}: {when}{check}")
    return items


def journey_digest(state: dict[str, Any], deadlines: list[str], site_url: str) -> tuple[str, str] | None:
    """Subject and body of the weekly journey digest, or None when there is nothing to say."""
    steps = state["steps"][:3]
    if not steps and not deadlines:
        return None
    name = journey.stage_name(state["stage"])
    lines: list[str] = []
    if state["stalled"] and steps:
        # Step titles are shortened with an ellipsis to fit a card; don't follow one with a full stop.
        first = steps[0]["title"]
        lines += [
            "You haven't checked in for a while.",
            f"The most urgent step: {first}{'' if first.endswith('…') else '.'}",
            "",
        ]
    lines.append(f"You're in stage {state['stage']} of 7: {name}. {journey.STAGES[str(state['stage'])]['forText']}")
    if steps:
        lines += ["", "Your next steps:", *[f"- {s['title']}" for s in steps]]
    if deadlines:
        lines += ["", "Deadlines in the next 30 days:", *deadlines]
    lines += ["", f"{site_url}/app"]
    stalled = state["stalled"] and steps
    subject = "You haven't checked in for a while" if stalled else f"This week: stage {state['stage']}, {name}"
    return subject, "\n".join(lines)


def stage_email(stage: int, site_url: str) -> tuple[str, str]:
    s = journey.STAGES[str(stage)]
    return (
        f"You've reached stage {stage} of 7: {s['name']}",
        f"This stage is for: {s['forText']}\nYou're done when: {s['doneWhen']}\nIt usually takes {s['usuallyTakes']}."
        f"\n\nYour next steps are on your home page:\n{site_url}/app",
    )


def due_lifecycle(conn: Connection, site_url: str, now: datetime) -> list[LifecycleMessage]:
    """Messages due now that have not been sent."""
    sent = {
        (r["user_id"], r["kind"], r["period_key"])
        for r in conn.execute("select user_id, kind, period_key from lifecycle_log")
    }
    out: list[LifecycleMessage] = []
    states = {
        r["user_id"]: r
        for r in conn.execute("select user_id, stage, steps, stalled, computed_at from journey_state").fetchall()
    }
    # Reaching stage 4, 6 or 7 recently. A student's first journey also logs the stage it starts in; that isn't
    # reaching a stage, so only an entry after an earlier one counts.
    entered: dict[Any, list[dict[str, Any]]] = {}
    for e in conn.execute(
        """
        select e.id, e.user_id, e.stage from journey_events e
        where e.kind = 'stage_entered' and e.stage = any(%s) and e.created_at > %s and e.created_at <= %s
          and exists (select 1 from journey_events p
                      where p.user_id = e.user_id and p.kind = 'stage_entered' and p.created_at < e.created_at)
        order by e.created_at
        """,
        (list(STAGE_EMAIL_STAGES), now - timedelta(days=STAGE_EMAIL_WINDOW_DAYS), now),
    ).fetchall():
        entered.setdefault(e["user_id"], []).append(e)
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

        if r["tips"]:
            for e in entered.get(uid, []):
                add("stage_change", str(e["id"]), *stage_email(e["stage"], site_url))

        state = states.get(uid)
        if r["digest"] and now.weekday() == 0 and state is not None and journey.is_fresh(state["computed_at"], now):
            digest = journey_digest(state, _digest_items(conn, uid, now), site_url)
            if digest:
                add("journey_digest", iso_week(now), *digest)
        elif r["digest"] and now.weekday() == 0:
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
    """Claim each message in the log, send it, and release the claim if the send fails.

    Claiming first means two overlapping runs cannot both send, and a crash or a provider outage never loses the
    record of what was already sent: each claim is committed on its own.
    """
    now = now or datetime.now(UTC)
    report = NotifyReport(dry_run=mailer.dry_run)
    for m in due_lifecycle(conn, site_url, now):
        claimed = conn.execute(
            "insert into lifecycle_log (user_id, kind, period_key) values (%s, %s, %s) "
            "on conflict do nothing returning user_id",
            (m.user_id, m.kind, m.period_key),
        ).fetchone()
        conn.commit()
        if not claimed:
            continue  # another run already took it
        try:
            sent = mailer.send(Message(to=m.email, subject=m.subject, text=m.body))
        except Exception as exc:  # a provider error must not stop the rest of the run
            sent = False
            report.notes.append(f"{m.kind} to {m.user_id}: {exc}")
        if sent:
            report.updates += 1
        else:
            conn.execute(
                "delete from lifecycle_log where user_id = %s and kind = %s and period_key = %s",
                (m.user_id, m.kind, m.period_key),
            )
            conn.commit()
            report.failures += 1
    return report
