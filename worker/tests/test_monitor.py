"""Monitor against the local database: unchanged pages are skipped, changed ones notify watchers."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.extract.extractor import Extractor
from uniguide_worker.fetch.fetcher import FetchResult, content_hash
from uniguide_worker.monitor import MonitorReport, check_source

from .conftest import FakeAnthropic, FakeResponse
from .test_proposals import PAGE, extraction


class PageFetcher:
    def __init__(self, text: str) -> None:
        self.text = text

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        return FetchResult(url, url, 200, self.text, content_hash(self.text), '"e1"', None, False)


@pytest.fixture
def watched(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    user = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1995-01", "residence_country": "IN"}') returning id
        """,
        (f"watch-{tag}@example.com",),
    ).fetchone()
    inst = operator.execute(
        "insert into institutions (name, country) values ('Monitor U', 'GB') returning id"
    ).fetchone()
    assert user and inst
    prog = operator.execute(
        "insert into programs (institution_id, slug, title, level, published) values (%s, %s, 'MSc M', 'master', true) returning id",
        (inst["id"], f"monitor-{tag}"),
    ).fetchone()
    assert prog
    operator.execute(
        "insert into program_cycles (program_id, label, intake_year, intake_term, starts_on) values (%s, '2027-autumn', 2027, 'autumn', '2027-09-20')",
        (prog["id"],),
    )
    source = operator.execute(
        "insert into program_sources (program_id, kind, url) values (%s, 'admissions', %s) returning id",
        (prog["id"], f"https://monitor-{tag}.example.org/apply"),
    ).fetchone()
    operator.execute("insert into shortlists (user_id, program_id) values (%s, %s)", (user["id"], prog["id"]))
    operator.commit()
    yield {"user": user["id"], "program": prog["id"], "source": source["id"] if source else None}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.execute("delete from auth.users where id = %s", (user["id"],))
    operator.commit()


def source_row(conn: Connection, source_id: Any) -> dict[str, Any]:
    row = conn.execute("select * from program_sources where id = %s", (source_id,)).fetchone()
    assert row
    return row


def test_unchanged_page_is_skipped_and_change_notifies(
    worker: Connection, operator: Connection, watched: dict[str, Any]
) -> None:
    report = MonitorReport()
    first = Extractor(client=FakeAnthropic(FakeResponse(extraction())))  # type: ignore[arg-type]
    check_source(worker, PageFetcher(PAGE), first, source_row(worker, watched["source"]), report)  # type: ignore[arg-type]
    assert report.extracted == 1 and report.notified == 0

    check_source(worker, PageFetcher(PAGE), first, source_row(worker, watched["source"]), report)  # type: ignore[arg-type]
    assert report.unchanged == 1

    moved = PAGE.replace("30 June 2027", "15 July 2027")
    later = extraction()
    later.deadlines[0].date = "2027-07-15"
    later.deadlines[0].quote = "International applicants should apply by 15 July 2027."
    second = Extractor(client=FakeAnthropic(FakeResponse(later)))  # type: ignore[arg-type]
    check_source(worker, PageFetcher(moved), second, source_row(worker, watched["source"]), report)  # type: ignore[arg-type]
    assert report.notified == 1
    note = operator.execute("select title, body from notifications where user_id = %s", (watched["user"],)).fetchone()
    assert note and note["title"].startswith("Information changed: MSc M") and "due_at" in note["body"]
