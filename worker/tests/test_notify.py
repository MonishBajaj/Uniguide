"""Reminder sending against the local database, with a recording mailer."""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest

from uniguide_worker.db import Connection, connect
from uniguide_worker.mailer import Mailer
from uniguide_worker.notify import (
    days_until,
    local_date,
    send_letter_nudges,
    send_parent_digests,
    send_reminders,
    week_start,
)

LOCAL_NOTIFIER = "postgresql://notifier:notifier_local@127.0.0.1:54322/postgres"


def test_days_until_rounds_up() -> None:
    now = datetime(2027, 1, 1, 12, tzinfo=UTC)
    assert days_until(now + timedelta(days=7), now) == 7
    assert days_until(now + timedelta(days=6, hours=1), now) == 7
    assert days_until(now + timedelta(hours=2), now) == 1


def test_local_date_uses_institution_zone() -> None:
    due = datetime(2027, 1, 16, 4, 59, tzinfo=UTC)
    assert local_date(due, "America/New_York", "exact_time").startswith("15 January 2027, 23:59")
    assert local_date(datetime(2027, 6, 29, 23, tzinfo=UTC), "Europe/London", "date") == "30 June 2027"


@pytest.fixture
def notifier(operator_url: str) -> Iterator[Connection]:
    url = os.environ.get("NOTIFIER_DATABASE_URL", LOCAL_NOTIFIER)
    try:
        conn = connect(url)
    except psycopg.Error:
        pytest.skip("notifier login not configured")
    with conn:
        yield conn


@pytest.fixture
def scenario(operator: Connection) -> Iterator[dict[str, Any]]:
    """A student with reminders at 7 and 1 days and an application whose deadline is 7 days away."""
    tag = uuid.uuid4().hex[:8]
    user = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1995-01", "residence_country": "IN"}')
        returning id
        """,
        (f"notify-{tag}@example.com",),
    ).fetchone()
    assert user
    uid = user["id"]
    operator.execute("update profiles set reminder_days = '{7,1}' where user_id = %s", (uid,))
    inst = operator.execute(
        "insert into institutions (name, country) values ('Notify U', 'GB') returning id"
    ).fetchone()
    assert inst
    prog = operator.execute(
        "insert into programs (institution_id, slug, title, level, published) values (%s, %s, 'MSc N', 'master', true) returning id",
        (inst["id"], f"notify-{tag}"),
    ).fetchone()
    assert prog
    cycle = operator.execute(
        "insert into program_cycles (program_id, label, intake_year, intake_term) values (%s, '2027-autumn', 2027, 'autumn') returning id",
        (prog["id"],),
    ).fetchone()
    assert cycle
    due = datetime.now(UTC) + timedelta(days=6, hours=20)
    deadline = operator.execute(
        """
        insert into deadlines (cycle_id, due_at, timezone, precision, status, published)
        values (%s, %s, 'Europe/London', 'date', 'verified', true) returning id
        """,
        (cycle["id"], due),
    ).fetchone()
    assert deadline
    app = operator.execute(
        "insert into applications (user_id, cycle_id) values (%s, %s) returning id", (uid, cycle["id"])
    ).fetchone()
    assert app
    operator.execute(
        "insert into checklist_items (application_id, user_id, title, kind, deadline_id, due_at) values (%s, %s, 'Submit the application', 'deadline', %s, %s)",
        (app["id"], uid, deadline["id"], due),
    )
    operator.execute(
        "insert into notifications (user_id, kind, title, body) values (%s, 'fact_changed', 'Tuition changed', 'Now £32,000')",
        (uid,),
    )
    operator.commit()
    yield {"uid": uid, "email": f"notify-{tag}@example.com"}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.execute("delete from auth.users where id = %s", (uid,))
    operator.commit()


def test_reminder_sent_once_and_updates_emailed(notifier: Connection, scenario: dict[str, Any]) -> None:
    mailer = Mailer()
    send_reminders(notifier, mailer, "https://uniguide.example")
    mine = [m for m in mailer.sent if m.to == scenario["email"]]
    assert [m.subject for m in mine] == ["7 days left: MSc N, Notify U", "Tuition changed"]
    assert "due" in mine[0].text and "/app/tracker/" in mine[0].text

    again = Mailer()
    send_reminders(notifier, again, "https://uniguide.example")
    assert [m for m in again.sent if m.to == scenario["email"]] == []


def test_notifier_cannot_read_profiles_or_scores(notifier: Connection) -> None:
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        notifier.execute("select * from test_scores")
    notifier.rollback()
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        notifier.execute("select email from auth.users")
    notifier.rollback()


def test_week_start_is_monday() -> None:
    assert str(week_start(datetime(2027, 1, 7, 15, tzinfo=UTC))) == "2027-01-04"
    assert str(week_start(datetime(2027, 1, 4, 0, 1, tzinfo=UTC))) == "2027-01-04"


@pytest.fixture
def parent(operator: Connection, scenario: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """A parent linked to the scenario student."""
    email = f"parent-{uuid.uuid4().hex[:8]}@example.com"
    row = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1970-01", "residence_country": "IN"}')
        returning id
        """,
        (email,),
    ).fetchone()
    assert row
    operator.execute(
        "insert into parent_links (parent_id, student_id, student_name, parent_name) values (%s, %s, 'Asha', 'Dad')",
        (row["id"], scenario["uid"]),
    )
    operator.commit()
    yield {"id": row["id"], "email": email}
    operator.execute("delete from auth.users where id = %s", (row["id"],))
    operator.commit()


def test_parent_gets_one_summary_a_week(notifier: Connection, operator: Connection, parent: dict[str, Any]) -> None:
    mailer = Mailer()
    send_parent_digests(notifier, mailer, "https://uniguide.example")
    mine = [m for m in mailer.sent if m.to == parent["email"]]
    assert [m.subject for m in mine] == ["This week: Asha's applications"]
    text = mine[0].text
    assert "MSc N, Notify U: Shortlisted, 0 of 1 steps done. Next: Submit the application" in text
    assert "https://uniguide.example/parent" in text
    assert "score" not in text.lower() and "grade" not in text.lower()

    again = Mailer()
    send_parent_digests(notifier, again, "https://uniguide.example")
    assert [m for m in again.sent if m.to == parent["email"]] == []

    # Next week, with the email turned off, nothing is sent.
    operator.execute("update parent_links set digest_enabled = false where parent_id = %s", (parent["id"],))
    operator.commit()
    later = Mailer()
    send_parent_digests(notifier, later, "https://uniguide.example", now=datetime.now(UTC) + timedelta(days=7))
    assert [m for m in later.sent if m.to == parent["email"]] == []


def test_letter_nudge_reaches_the_student_once(
    notifier: Connection, operator: Connection, scenario: dict[str, Any]
) -> None:
    app = operator.execute("select id from applications where user_id = %s", (scenario["uid"],)).fetchone()
    assert app
    rec = operator.execute(
        "insert into recommenders (user_id, name) values (%s, 'Dr Mehta') returning id", (scenario["uid"],)
    ).fetchone()
    assert rec
    due = (datetime.now(UTC) + timedelta(days=14)).date()
    operator.execute(
        "insert into recommendation_requests (user_id, recommender_id, application_id, status, due_on) "
        "values (%s, %s, %s, 'agreed', %s)",
        (scenario["uid"], rec["id"], app["id"], due),
    )
    operator.commit()

    mailer = Mailer()
    send_letter_nudges(notifier, mailer, "https://uniguide.example")
    mine = [m for m in mailer.sent if m.to == scenario["email"]]
    assert [m.subject for m in mine] == ["Letter due in 14 days: Dr Mehta for MSc N"]
    assert "has agreed to write" in mine[0].text and "/app/recommenders" in mine[0].text

    again = Mailer()
    send_letter_nudges(notifier, again, "https://uniguide.example")
    assert [m for m in again.sent if m.to == scenario["email"]] == []

    # Not due in 14 or 3 days: nothing.
    later = Mailer()
    send_letter_nudges(notifier, later, "https://uniguide.example", now=datetime.now(UTC) + timedelta(days=2))
    assert [m for m in later.sent if m.to == scenario["email"]] == []


def test_own_applications_get_letter_nudges_but_never_deadline_reminders(
    notifier: Connection, operator: Connection, scenario: dict[str, Any]
) -> None:
    """J3.3: an own application's dates are the student's. Letter due dates are theirs anyway; deadline
    reminders quote published deadlines, which an own application never has."""
    app = operator.execute(
        "insert into applications (user_id, status, own_institution, own_title, own_country, own_due_at) "
        "values (%s, 'preparing', 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL', %s) returning id",
        (scenario["uid"], datetime.now(UTC) + timedelta(days=7)),
    ).fetchone()
    assert app
    operator.execute(
        "insert into checklist_items (application_id, user_id, title, kind, due_at) values (%s, %s, 'Portfolio', 'custom', %s)",
        (app["id"], scenario["uid"], datetime.now(UTC) + timedelta(days=7)),
    )
    rec = operator.execute(
        "insert into recommenders (user_id, name) values (%s, 'Dr Rao') returning id", (scenario["uid"],)
    ).fetchone()
    assert rec
    operator.execute(
        "insert into recommendation_requests (user_id, recommender_id, application_id, status, due_on) "
        "values (%s, %s, %s, 'asked', %s)",
        (scenario["uid"], rec["id"], app["id"], (datetime.now(UTC) + timedelta(days=3)).date()),
    )
    operator.commit()

    mailer = Mailer()
    send_letter_nudges(notifier, mailer, "https://uniguide.example")
    assert [m.subject for m in mailer.sent if m.to == scenario["email"]] == [
        "Letter due in 3 days: Dr Rao for MSc Urban Planning"
    ]

    reminders = Mailer()
    send_reminders(notifier, reminders, "https://uniguide.example")
    assert all("Urban Planning" not in m.subject + m.text for m in reminders.sent)


def test_parent_digest_leads_with_the_journey_in_parent_safe_terms(
    notifier: Connection, operator: Connection, parent: dict[str, Any], scenario: dict[str, Any]
) -> None:
    """J4.3: stage, progress, the parent note and parent titles; never a step's own title."""
    operator.execute(
        "insert into journey_state (user_id, stage, stage_progress, steps, engine_version, computed_at) values "
        "(%s, 4, '{\"label\": \"0 of 1 application ready\"}', %s, 'journey-0.3.0', now())",
        (
            scenario["uid"],
            json.dumps(
                [
                    {"title": "Draft your statement for MSc N", "reason": "Your essay."},
                    {"title": "Send your IELTS score", "reason": "Your score 7.5."},
                    {"title": "Work through the MSc N checklist", "parentTitle": "Working through the MSc N checklist"},
                ]
            ),
        ),
    )
    operator.commit()
    mailer = Mailer()
    send_parent_digests(notifier, mailer, "https://uniguide.example")
    [m] = [m for m in mailer.sent if m.to == parent["email"]]
    assert m.subject == "This week: Asha is in stage 4, Prepare"
    assert m.text.startswith("Stage 4 of 7: Prepare. 0 of 1 application ready.")
    assert "How you can help right now:\nHelp gather documents like transcripts and certificates." in m.text
    assert "The essays are Asha's to write" in m.text
    assert "What Asha is working on:\n- Working through the MSc N checklist" in m.text
    assert "MSc N, Notify U: Shortlisted" in m.text
    for private in ("statement", "IELTS", "7.5", "Work through the MSc N checklist"):
        assert private not in m.text
