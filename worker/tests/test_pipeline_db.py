"""End-to-end against the local database: fake page and fake model, real SQL and RLS."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.extract.extractor import Extractor
from uniguide_worker.extract.gemini import GeminiExtractor
from uniguide_worker.extract.schema import PageExtraction
from uniguide_worker.fetch.fetcher import FetchResult, content_hash
from uniguide_worker.pipeline import extract_page

from .conftest import FakeAnthropic, FakeGenai, FakeGenaiResponse, FakeResponse
from .test_proposals import PAGE, extraction


class FakeFetcher:
    def __init__(self, text: str) -> None:
        self.text = text

    def fetch(self, url: str) -> FetchResult:
        return FetchResult(url, url, 200, self.text, content_hash(self.text + url), None, None, False)


@pytest.fixture
def cycle_id(operator: Connection) -> Iterator[str]:
    """A published program and cycle, committed so the worker connection can see it."""
    slug = f"pipeline-test-{uuid.uuid4().hex[:8]}"
    inst = operator.execute(
        "insert into institutions (name, country) values ('Pipeline Test University', 'GB') returning id"
    ).fetchone()
    assert inst
    prog = operator.execute(
        """
        insert into programs (institution_id, slug, title, level, published)
        values (%s, %s, 'MSc Test', 'master', true) returning id
        """,
        (inst["id"], slug),
    ).fetchone()
    assert prog
    cycle = operator.execute(
        """
        insert into program_cycles (program_id, label, intake_year, intake_term, starts_on)
        values (%s, '2027-autumn', 2027, 'autumn', '2027-09-20') returning id
        """,
        (prog["id"],),
    ).fetchone()
    assert cycle
    operator.commit()
    yield str(cycle["id"])
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.commit()


def run(worker: Connection, cycle_id: str, ex: PageExtraction, page: str = PAGE) -> object:
    extractor = Extractor(client=FakeAnthropic(FakeResponse(ex)))  # type: ignore[arg-type]
    return extract_page(worker, FakeFetcher(page), extractor, f"https://test.example.org/{uuid.uuid4()}", cycle_id)  # type: ignore[arg-type]


def test_clean_extraction_is_published_as_unverified(worker: Connection, operator: Connection, cycle_id: str) -> None:
    report = run(worker, cycle_id, extraction())
    assert report.status == "extracted"  # type: ignore[attr-defined]
    assert report.proposed == 4 and report.published == 4  # type: ignore[attr-defined]
    rows = operator.execute("select status, published from deadlines where cycle_id = %s", (cycle_id,)).fetchall()
    assert rows == [{"status": "unverified", "published": True}]
    versions = operator.execute("select review_state from fact_versions where cycle_id = %s", (cycle_id,)).fetchall()
    assert {v["review_state"] for v in versions} == {"pending"}  # still waiting for a human
    tier = operator.execute(
        "select p.coverage_tier from programs p join program_cycles c on c.program_id = p.id where c.id = %s",
        (cycle_id,),
    ).fetchone()
    assert tier == {"coverage_tier": "extracted"}


def test_invented_quotes_are_auto_rejected_and_never_published(
    worker: Connection, operator: Connection, cycle_id: str
) -> None:
    ex = extraction(costs=[], language_tests=[])
    ex.deadlines[0].quote = "Applications close 1 March 2027 for everyone."
    report = run(worker, cycle_id, ex)
    assert report.published == 0 and report.rejected == 1  # type: ignore[attr-defined]
    assert operator.execute("select count(*) as n from deadlines where cycle_id = %s", (cycle_id,)).fetchone() == {
        "n": 0
    }
    state = operator.execute("select review_state from fact_versions where cycle_id = %s", (cycle_id,)).fetchone()
    assert state == {"review_state": "auto_rejected"}


def test_last_cycles_page_is_not_published(worker: Connection, operator: Connection, cycle_id: str) -> None:
    report = run(worker, cycle_id, extraction(effective_intake_year=2026))
    assert report.published == 0  # type: ignore[attr-defined]
    assert "deadline: cycle_mismatch" in report.issues  # type: ignore[attr-defined]


def test_ai_run_is_logged_without_the_page(worker: Connection, operator: Connection, cycle_id: str) -> None:
    run(worker, cycle_id, extraction())
    row = operator.execute(
        "select model, prompt_version, input_hash, user_id from ai_runs order by created_at desc limit 1"
    ).fetchone()
    assert row and row["model"] == "claude-haiku-5-5" and row["user_id"] is None and len(row["input_hash"]) == 64


def test_gemini_invented_quote_is_dropped_and_page_still_extracted(
    worker: Connection, operator: Connection, cycle_id: str
) -> None:
    ex = extraction(costs=[], language_tests=[])
    ex.deadlines[0].quote = "Applications close 1 March 2027 for everyone."
    extractor = GeminiExtractor(client=FakeGenai(FakeGenaiResponse(ex.model_dump_json())), model="gemini-test")  # type: ignore[arg-type]
    report = extract_page(worker, FakeFetcher(PAGE), extractor, f"https://test.example.org/{uuid.uuid4()}", cycle_id)  # type: ignore[arg-type]
    assert report.status == "extracted" and report.published == 0
    assert operator.execute("select count(*) as n from deadlines where cycle_id = %s", (cycle_id,)).fetchone() == {
        "n": 0
    }
