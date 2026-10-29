"""Welcome, digest and re-engagement emails against the local database, with a recording mailer."""

# ruff: noqa: F811  (pytest fixtures are redefined as test parameters)
from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.lifecycle import send_lifecycle
from uniguide_worker.mailer import Mailer

from .test_notify import notifier  # noqa: F401  (pytest fixture)

MONDAY = datetime(2026, 11, 2, 12, tzinfo=UTC)
TUESDAY = MONDAY + timedelta(days=1)

Make = Callable[..., dict[str, Any]]


@pytest.fixture
def make_student(operator: Connection) -> Iterator[Make]:
    created: list[Any] = []
    institutions: list[Any] = []

    def make(
        *,
        age_days: int = 100,
        last_seen_days: int | None = 1,
        deadline_in_days: int | None = None,
        shortlist: bool = False,
        digest: bool = True,
        tips: bool = True,
        consent: str = "not_required",
    ) -> dict[str, Any]:
        tag = uuid.uuid4().hex[:8]
        email = f"life-{tag}@example.com"
        user = operator.execute(
            """
            insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, last_sign_in_at)
            values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                    '{"birth_month": "1995-01", "residence_country": "IN"}', %s, %s)
            returning id
            """,
            (
                email,
                MONDAY - timedelta(days=age_days),
                None if last_seen_days is None else MONDAY - timedelta(days=last_seen_days),
            ),
        ).fetchone()
        assert user
        uid = user["id"]
        created.append(uid)
        operator.execute("update profiles set consent_state = %s where user_id = %s", (consent, uid))
        operator.execute("update email_preferences set digest = %s, tips = %s where user_id = %s", (digest, tips, uid))
        if deadline_in_days is not None or shortlist:
            inst = operator.execute(
                "insert into institutions (name, country) values ('Life U', 'GB') returning id"
            ).fetchone()
            assert inst
            institutions.append(inst["id"])
            prog = operator.execute(
                "insert into programs (institution_id, slug, title, level, published) values (%s, %s, 'MSc Life', 'master', true) returning id",
                (inst["id"], f"life-{tag}"),
            ).fetchone()
            assert prog
            cycle = operator.execute(
                "insert into program_cycles (program_id, label, intake_year, intake_term) values (%s, '2027-autumn', 2027, 'autumn') returning id",
                (prog["id"],),
            ).fetchone()
            assert cycle
            if shortlist:
                operator.execute(
                    "insert into shortlists (user_id, program_id, cycle_id) values (%s, %s, %s)",
                    (uid, prog["id"], cycle["id"]),
                )
            if deadline_in_days is not None:
                due = MONDAY + timedelta(days=deadline_in_days)
                dl = operator.execute(
                    "insert into deadlines (cycle_id, due_at, timezone, precision, status, published) values (%s, %s, 'Europe/London', 'date', 'verified', true) returning id",
                    (cycle["id"], due),
                ).fetchone()
                assert dl
                app = operator.execute(
                    "insert into applications (user_id, cycle_id) values (%s, %s) returning id", (uid, cycle["id"])
                ).fetchone()
                assert app
                operator.execute(
                    "insert into checklist_items (application_id, user_id, title, kind, deadline_id, due_at) values (%s, %s, 'Submit', 'deadline', %s, %s)",
                    (app["id"], uid, dl["id"], due),
                )
        operator.commit()
        return {"uid": uid, "email": email}

    yield make
    for uid in created:
        operator.execute("delete from lifecycle_log where user_id = %s", (uid,))
        operator.execute("delete from auth.users where id = %s", (uid,))
    for inst_id in institutions:
        operator.execute("delete from institutions where id = %s", (inst_id,))
    operator.commit()


def run(conn: Connection, now: datetime, email: str) -> list[str]:
    mailer = Mailer()
    send_lifecycle(conn, mailer, "https://uniguide.example", now)
    return [m.subject for m in mailer.sent if m.to == email]


def test_welcome_emails_follow_the_signup_day(notifier: Connection, make_student: Make) -> None:
    s = make_student(age_days=4)
    first = run(notifier, MONDAY, s["email"])
    assert len(first) == 2  # day 0 and day 3, not yet day 7
    assert run(notifier, MONDAY, s["email"]) == []  # each goes out once


def test_old_accounts_get_no_welcome_series(notifier: Connection, make_student: Make) -> None:
    s = make_student(age_days=100)
    assert run(notifier, MONDAY, s["email"]) == []


def test_unsubscribed_students_get_reminders_not_digests(notifier: Connection, make_student: Make) -> None:
    s = make_student(deadline_in_days=10, digest=False)
    assert run(notifier, MONDAY, s["email"]) == []


def test_digest_lists_deadlines_and_links_the_unsubscribe(notifier: Connection, make_student: Make) -> None:
    s = make_student(deadline_in_days=10)
    mailer = Mailer()
    send_lifecycle(notifier, mailer, "https://uniguide.example", MONDAY)
    mine = [m for m in mailer.sent if m.to == s["email"]]
    assert len(mine) == 1
    assert "MSc Life" in mine[0].text and "/unsubscribe/" in mine[0].text


def test_one_digest_per_student_per_week(notifier: Connection, make_student: Make) -> None:
    s = make_student(deadline_in_days=10)
    assert len(run(notifier, MONDAY, s["email"])) == 1
    assert run(notifier, MONDAY, s["email"]) == []


def test_digest_only_on_mondays(notifier: Connection, make_student: Make) -> None:
    s = make_student(deadline_in_days=10)
    assert run(notifier, TUESDAY, s["email"]) == []


def test_empty_digest_is_not_sent(notifier: Connection, make_student: Make) -> None:
    s = make_student(deadline_in_days=None, shortlist=False)
    assert run(notifier, MONDAY, s["email"]) == []


def test_pending_parental_consent_gets_nothing(notifier: Connection, make_student: Make) -> None:
    s = make_student(age_days=1, deadline_in_days=10, consent="pending_parental")
    assert run(notifier, MONDAY, s["email"]) == []


def test_reengagement_goes_out_once(notifier: Connection, make_student: Make) -> None:
    s = make_student(last_seen_days=20, shortlist=True, digest=False)
    assert len(run(notifier, TUESDAY, s["email"])) == 1
    assert run(notifier, TUESDAY, s["email"]) == []


def test_no_reengagement_without_a_shortlist_or_with_tips_off(notifier: Connection, make_student: Make) -> None:
    a = make_student(last_seen_days=20, shortlist=False)
    b = make_student(last_seen_days=20, shortlist=True, tips=False)
    assert run(notifier, TUESDAY, a["email"]) == []
    assert run(notifier, TUESDAY, b["email"]) == []


class FlakyMailer(Mailer):
    """Raises for one recipient, as a network error from the mail provider would."""

    def __init__(self, fail_for: str) -> None:
        super().__init__()
        self.fail_for = fail_for

    def send(self, message: Any) -> bool:
        if message.to == self.fail_for:
            raise ConnectionError("mail provider unreachable")
        return super().send(message)


def test_a_failed_send_is_retried_and_does_not_repeat_the_others(notifier: Connection, make_student: Make) -> None:
    ok = make_student(age_days=0)
    bad = make_student(age_days=0)
    flaky = FlakyMailer(bad["email"])
    report = send_lifecycle(notifier, flaky, "https://uniguide.example", MONDAY)
    assert report.failures >= 1
    assert [m for m in flaky.sent if m.to == ok["email"]] != []

    # The next run retries the failed one and does not repeat what was already sent.
    again = Mailer()
    send_lifecycle(notifier, again, "https://uniguide.example", MONDAY)
    assert [m for m in again.sent if m.to == ok["email"]] == []
    assert [m for m in again.sent if m.to == bad["email"]] != []


def test_a_message_claimed_by_another_run_is_not_sent_twice(
    notifier: Connection, make_student: Make, operator: Connection
) -> None:
    s = make_student(age_days=0)
    operator.execute(
        "insert into lifecycle_log (user_id, kind, period_key) values (%s, 'welcome_1', 'welcome_1')", (s["uid"],)
    )
    operator.commit()
    assert run(notifier, MONDAY, s["email"]) == []
