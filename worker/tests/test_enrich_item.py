"""Per-course enrichment against the local database: freshness, dedup, missing cycles, failures."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich.jobs import ensure_current_cycle, is_fresh, process_item
from uniguide_worker.enrich.sources import discover_sources
from uniguide_worker.extract.extractor import Extractor
from uniguide_worker.fetch.fetcher import FetchRefused, FetchResult, content_hash

from .conftest import FakeAnthropic, FakeResponse
from .test_proposals import PAGE, extraction

HOST = "https://enrich.example.org"


class PageFetcher:
    def __init__(self, text: str = PAGE, status: int = 200, links: tuple[tuple[str, str], ...] = ()) -> None:
        self.text, self.status, self.links = text, status, links
        self.calls: list[str] = []

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        self.calls.append(url)
        text = self.text if self.status < 400 else ""
        return FetchResult(
            url, url, self.status, text, content_hash(text + url) if text else "", None, None, False, self.links
        )


class RefusingFetcher:
    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        raise FetchRefused(f"Disallowed by robots.txt: {url}")


@pytest.fixture
def course(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    user = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1995-01", "residence_country": "IN"}') returning id
        """,
        (f"enrich-{tag}@example.com",),
    ).fetchone()
    inst = operator.execute(
        "insert into institutions (name, country, official_domain) values ('Enrich U', 'DE', 'enrich.example.org') returning id"
    ).fetchone()
    prog = operator.execute(
        """
        insert into programs (institution_id, slug, title, level, published, official_url)
        values (%s, %s, 'MSc Enrich', 'master', true, %s) returning id
        """,
        (inst["id"], f"enrich-{tag}", f"{HOST}/msc-{tag}"),
    ).fetchone()
    operator.commit()
    yield {"user": user["id"], "program": prog["id"]}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.execute("delete from auth.users where id = %s", (user["id"],))
    operator.commit()


def make_item(operator: Connection, course: dict[str, Any], status: str = "pending") -> Any:
    job = operator.execute(
        "insert into enrichment_jobs (user_id) values (%s) returning id", (course["user"],)
    ).fetchone()
    item = operator.execute(
        "insert into enrichment_items (job_id, program_id, status) values (%s, %s, %s) returning id",
        (job["id"], course["program"], status),
    ).fetchone()
    operator.commit()
    return item["id"]


def claude() -> Extractor:
    return Extractor(client=FakeAnthropic(FakeResponse(extraction())))  # type: ignore[arg-type]


def status_of(operator: Connection, item_id: Any) -> dict[str, Any]:
    return operator.execute("select status, detail from enrichment_items where id = %s", (item_id,)).fetchone()  # type: ignore[return-value]


def test_missing_cycle_is_created(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    item = make_item(operator, course)
    process_item(worker, PageFetcher(), claude(), item, fresh_days=7)  # type: ignore[arg-type]
    row = operator.execute(
        "select label, is_current, intake_term from program_cycles where program_id = %s", (course["program"],)
    ).fetchone()
    assert row and row["is_current"] and row["intake_term"] != "any"


def test_stale_course_is_extracted(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    operator.execute(
        "insert into program_cycles (program_id, label, intake_year, intake_term) values (%s, '2027-fall', 2027, 'fall')",
        (course["program"],),
    )
    operator.commit()
    item = make_item(operator, course)
    result = process_item(worker, PageFetcher(), claude(), item, fresh_days=7)  # type: ignore[arg-type]
    assert result == "extracted" and status_of(operator, item)["status"] == "extracted"
    facts = operator.execute(
        "select count(*) as n from deadlines d join program_cycles c on c.id = d.cycle_id where c.program_id = %s",
        (course["program"],),
    ).fetchone()
    assert facts and facts["n"] == 1
    assert is_fresh(worker, course["program"], 7)


def test_fresh_course_is_skipped(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    operator.execute(
        "insert into program_cycles (program_id, label, intake_year, intake_term) values (%s, '2027-fall', 2027, 'fall')",
        (course["program"],),
    )
    operator.commit()
    process_item(worker, PageFetcher(), claude(), make_item(operator, course), fresh_days=7)  # type: ignore[arg-type]
    fetcher = PageFetcher()
    second = make_item(operator, course)
    assert process_item(worker, fetcher, claude(), second, fresh_days=7) == "skipped_fresh"  # type: ignore[arg-type]
    assert fetcher.calls == []


def test_refused_page_fails_only_that_item(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    item = make_item(operator, course)
    assert process_item(worker, RefusingFetcher(), claude(), item, fresh_days=7) == "failed"  # type: ignore[arg-type]
    row = status_of(operator, item)
    assert row["status"] == "failed" and HOST in row["detail"]


def test_http_404_fails_item(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    item = make_item(operator, course)
    assert process_item(worker, PageFetcher(status=404), claude(), item, fresh_days=7) == "failed"  # type: ignore[arg-type]
    assert "404" in status_of(operator, item)["detail"]


def test_running_duplicate_waits(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    make_item(operator, course, status="running")
    waiting = make_item(operator, course)
    fetcher = PageFetcher()
    assert process_item(worker, fetcher, claude(), waiting, fresh_days=7) == "waiting"  # type: ignore[arg-type]
    assert fetcher.calls == [] and status_of(operator, waiting)["status"] == "waiting"


def test_ensure_current_cycle_reuses_existing(worker: Connection, operator: Connection, course: dict[str, Any]) -> None:
    first = ensure_current_cycle(worker, course["program"])
    assert ensure_current_cycle(worker, course["program"]) == first


def test_discover_sources_stays_on_host() -> None:
    links = (
        ("How to apply", f"{HOST}/admissions"),
        ("Tuition fees", f"{HOST}/fees"),
        ("Partner fees", "https://other.org/fees"),
        ("Home", f"{HOST}/"),
        ("Tuition fees", f"{HOST}/fees"),
    )
    found = discover_sources(PageFetcher(links=links), f"{HOST}/msc")  # type: ignore[arg-type]
    assert found[0] == ("course", f"{HOST}/msc")
    assert ("fees", f"{HOST}/fees") in found
    assert ("admissions", f"{HOST}/admissions") in found
    assert all(url.startswith(HOST) for _, url in found)
    assert len(found) == len(set(found)) == 3
