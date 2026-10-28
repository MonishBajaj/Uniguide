"""Official page -> fetch -> extract -> validate -> fact_versions -> (if clean) publish as unverified.

A human approves every critical field before it shows as Verified; that happens in the web
app's review queue, never here.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from .db import Connection
from .extract.extractor import EXTRACTOR_VERSION, ExtractionRun, Extractor
from .fetch.fetcher import Fetcher, FetchRefused, FetchResult
from .proposals import Proposal, from_extraction
from .validate.checks import CycleInfo, check_changed, check_cycle


@dataclass(frozen=True)
class CycleRow:
    id: UUID
    label: str
    intake_year: int
    starts_on: date | None
    program_id: UUID
    country: str
    institution_name: str

    @property
    def info(self) -> CycleInfo:
        return CycleInfo(self.label, self.intake_year, self.starts_on)


@dataclass
class PageReport:
    url: str
    status: str  # extracted | unchanged | refused | failed
    detail: str = ""
    proposed: int = 0
    published: int = 0
    rejected: int = 0
    issues: list[str] = field(default_factory=list)


def load_cycle(conn: Connection, cycle_id: UUID | str) -> CycleRow:
    row = conn.execute(
        """
        select c.id, c.label, c.intake_year, c.starts_on, c.program_id, i.country, i.name as institution_name
        from program_cycles c
        join programs p on p.id = c.program_id
        join institutions i on i.id = p.institution_id
        where c.id = %s
        """,
        (str(cycle_id),),
    ).fetchone()
    if row is None:
        raise LookupError(f"No program cycle {cycle_id}")
    return CycleRow(**row)


def row_key(subject: str, row: dict[str, Any]) -> tuple[Any, ...]:
    return Proposal(subject, row, "").key()


FACT_TABLES = {"requirement": "requirements", "deadline": "deadlines", "cost_item": "cost_items"}


def facts_for_cycle(conn: Connection, cycle_id: UUID | str) -> dict[tuple[Any, ...], dict[str, Any]]:
    facts: dict[tuple[Any, ...], dict[str, Any]] = {}
    for subject, table in FACT_TABLES.items():
        for row in conn.execute(f"select * from {table} where cycle_id = %s", (str(cycle_id),)):
            facts[row_key(subject, row)] = row
    return facts


def previous_cycle_facts(conn: Connection, cycle: CycleRow) -> dict[tuple[Any, ...], dict[str, Any]]:
    prev = conn.execute(
        """
        select id from program_cycles
        where program_id = %s and intake_year < %s
        order by intake_year desc limit 1
        """,
        (cycle.program_id, cycle.intake_year),
    ).fetchone()
    return facts_for_cycle(conn, prev["id"]) if prev else {}


def upsert_source(
    conn: Connection,
    *,
    url: str,
    owner: str,
    result: FetchResult | None,
    rights_note: str,
    extractor_version: str | None,
) -> UUID:
    row = conn.execute(
        """
        insert into sources (url, owner, rights_note, robots_ok, fetched_at, http_status, content_hash,
                             extractor_version)
        values (%s, %s, %s, %s, now(), %s, %s, %s)
        on conflict (url, coalesce(content_hash, '')) do update
          set fetched_at = excluded.fetched_at, http_status = excluded.http_status
        returning id
        """,
        (
            url,
            owner,
            rights_note,
            result is not None,
            result.status if result else None,
            result.content_hash if result else None,
            extractor_version,
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def record_ai_run(conn: Connection, run: ExtractionRun, purpose: str, input_text: str) -> UUID:
    row = conn.execute(
        """
        insert into ai_runs (purpose, model, prompt_version, input_tokens, output_tokens, cost_usd, latency_ms,
                             stop_reason, input_hash)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            purpose,
            run.model,
            run.prompt_version,
            run.input_tokens,
            run.output_tokens,
            run.cost_usd,
            run.latency_ms,
            run.stop_reason or run.error,
            hashlib.sha256(input_text.encode()).hexdigest(),
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def insert_version(
    conn: Connection,
    proposal: Proposal,
    *,
    cycle_id: UUID | str,
    subject_id: UUID | str | None,
    source_id: UUID,
    extractor_version: str | None,
    ai_run_id: UUID | None,
    created_by: str = "worker",
) -> UUID:
    # A quote that is not on the page means the model made something up: drop it from the queue.
    hallucinated = any(i.code == "quote_not_found" for i in proposal.issues)
    row = conn.execute(
        """
        insert into fact_versions (subject, subject_id, cycle_id, proposed, evidence, evidence_quote, source_id,
                                   extractor_version, ai_run_id, validation, review_state, created_by)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            proposal.subject,
            str(subject_id) if subject_id else None,
            str(cycle_id),
            Jsonb(proposal.proposed),
            Jsonb({"quote": proposal.evidence_quote}),
            proposal.evidence_quote,
            source_id,
            extractor_version,
            ai_run_id,
            Jsonb([i.as_dict() for i in proposal.issues]),
            "auto_rejected" if hallucinated else "pending",
            created_by,
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def publish_extracted(conn: Connection, version_id: UUID) -> UUID | None:
    row = conn.execute("select public.publish_extracted_version(%s) as fact_id", (version_id,)).fetchone()
    return row["fact_id"] if row else None


def already_processed(conn: Connection, url: str, content_hash: str) -> bool:
    row = conn.execute(
        "select 1 from sources where url = %s and content_hash = %s and extractor_version = %s",
        (url, content_hash, EXTRACTOR_VERSION),
    ).fetchone()
    return row is not None


CHANGE_KEYS = ["min_total", "min_sections", "min_grade_numeric", "test_policy", "low", "base", "high", "currency"]


def extract_page(
    conn: Connection,
    fetcher: Fetcher,
    extractor: Extractor,
    url: str,
    cycle_id: UUID | str,
    *,
    publish: bool = True,
) -> PageReport:
    cycle = load_cycle(conn, cycle_id)
    try:
        result = fetcher.fetch(url)
    except FetchRefused as exc:
        return PageReport(url, "refused", str(exc))
    if result.status >= 400 or not result.text:
        return PageReport(url, "failed", f"HTTP {result.status}")
    if already_processed(conn, url, result.content_hash):
        return PageReport(url, "unchanged", "Same content and extractor version as last time.")

    run = extractor.extract(url, cycle.label, result.text)
    ai_run_id = record_ai_run(conn, run, "page_extract", result.text)
    if run.extraction is None:
        conn.commit()
        return PageReport(url, "failed", run.error or "no extraction")

    source_id = upsert_source(
        conn,
        url=url,
        owner=cycle.institution_name,
        result=result,
        rights_note="Official institution page; facts and short quotes only.",
        extractor_version=EXTRACTOR_VERSION,
    )
    proposals = from_extraction(run.extraction, cycle.info, cycle.country, result.text)
    cycle_issues = check_cycle(run.extraction.effective_intake_year, cycle.info)
    existing = facts_for_cycle(conn, cycle.id)
    previous = previous_cycle_facts(conn, cycle)

    report = PageReport(url, "extracted")
    for proposal in proposals:
        proposal.issues += cycle_issues
        proposal.issues += check_changed(proposal.proposed, previous.get(proposal.key()), CHANGE_KEYS)
        current = existing.get(proposal.key())
        version_id = insert_version(
            conn,
            proposal,
            cycle_id=cycle.id,
            subject_id=current["id"] if current else None,
            source_id=source_id,
            extractor_version=EXTRACTOR_VERSION,
            ai_run_id=ai_run_id,
        )
        report.proposed += 1
        report.issues += [f"{proposal.subject}: {i.code}" for i in proposal.issues]
        if proposal.has_errors:
            report.rejected += 1
        elif publish and publish_extracted(conn, version_id):
            report.published += 1
    conn.commit()
    return report
