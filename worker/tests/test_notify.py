"""Reminder sending against the local database, with a recording mailer."""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest

from uniguide_worker.db import Connection, connect
from uniguide_worker.mailer import Mailer
from uniguide_worker.notify import days_until, local_date, send_reminders

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
