"""Enrich one course of a job: register its official pages, skip it if its facts are fresh, otherwise read them."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import psycopg

from ..db import Connection
from ..extract.base import PageExtractor
from ..fetch.fetcher import Fetcher
from ..monitor import MonitorReport, check_source, intake_cycle
from .sources import discover_sources


def ensure_current_cycle(conn: Connection, program_id: UUID) -> UUID:
    """The intake that page facts belong to; registers that only list a course have none, so make the next one."""
    existing = intake_cycle(conn, program_id)
    if existing:
        return existing
    today = date.today()
    year = today.year if today.month <= 5 else today.year + 1
    conn.execute(
        """
        insert into program_cycles (program_id, label, intake_year, intake_term)
        values (%s, %s, %s, 'fall') on conflict (program_id, label) do nothing
        """,
        (program_id, f"{year}-fall", year),
    )
    conn.commit()
    cycle = intake_cycle(conn, program_id)
    assert cycle is not None
    return cycle


def is_fresh(conn: Connection, program_id: UUID, days: int) -> bool:
    """True when every registered page was checked within `days` and the course has at least one fact."""
    row = conn.execute(
        """
        select
          (select count(*) from program_sources where program_id = %(p)s and active) as sources,
          (select count(*) from program_sources
            where program_id = %(p)s and active
              and (last_checked_at is null or last_checked_at < now() - make_interval(days => %(d)s))) as stale,
          exists (
            select 1 from program_cycles c
            where c.program_id = %(p)s and c.is_current
              and (exists (select 1 from requirements where cycle_id = c.id)
                or exists (select 1 from deadlines where cycle_id = c.id)
                or exists (select 1 from cost_items where cycle_id = c.id))
          ) as has_facts
        """,
        {"p": program_id, "d": days},
    ).fetchone()
    assert row is not None
    return bool(row["sources"] > 0 and row["stale"] == 0 and row["has_facts"])


def _finish(conn: Connection, item_id: UUID, status: str, detail: str | None) -> str:
    conn.execute(
        """
        update enrichment_items
        set status = %s, detail = %s, finished_at = case when %s = 'waiting' then null else now() end
        where id = %s
        """,
        (status, detail, status, item_id),
    )
    conn.commit()
    return status


def _register_sources(conn: Connection, fetcher: Fetcher, program_id: UUID, official_url: str | None) -> None:
    if not official_url:
        return
    for kind, url in discover_sources(fetcher, official_url):
        conn.execute(
            """
            insert into program_sources (program_id, kind, url, rights_note) values (%s, %s, %s, %s)
            on conflict do nothing
            """,
            (program_id, kind, url, "Official institution page; facts and short quotes only."),
        )
    conn.commit()


def _enrich(
    conn: Connection,
    fetcher: Fetcher,
    extractor: PageExtractor,
    program_id: UUID,
    official_url: str | None,
    fresh_days: int,
) -> tuple[str, str | None]:
    ensure_current_cycle(conn, program_id)
    sources = conn.execute(
        "select * from program_sources where program_id = %s and active order by kind", (program_id,)
    ).fetchall()
    if not sources:
        _register_sources(conn, fetcher, program_id, official_url)
        sources = conn.execute(
            "select * from program_sources where program_id = %s and active order by kind", (program_id,)
        ).fetchall()
    if not sources:
        return "failed", "No official page is known for this course."
    if is_fresh(conn, program_id, fresh_days):
        return "skipped_fresh", None

    report = MonitorReport()
    problems: list[str] = []
    statuses: list[str] = []
    for source in sources:
        page = check_source(conn, fetcher, extractor, source, report)
        if page is None:
            last: dict[str, Any] = report.pages[-1] if report.pages else {}
            statuses.append(last.get("status", "unchanged"))
            if last.get("status") == "refused":
                problems.append(str(last.get("detail", source["url"])))
        else:
            statuses.append(page.status)
            if page.status == "failed":
                problems.append(f"{page.url}: {page.detail}")
    if "extracted" in statuses:
        return "extracted", None
    if "unchanged" in statuses:
        return "skipped_fresh", None
    return "failed", "; ".join(problems)[:500] or "No readable official page."


def process_item(
    conn: Connection, fetcher: Fetcher, extractor: PageExtractor, item_id: UUID, *, fresh_days: int
) -> str:
    """Run one enrichment item to a final status (or `waiting` while another search reads the same course)."""
    item = conn.execute(
        """
        select i.program_id, p.official_url from enrichment_items i
        join programs p on p.id = i.program_id where i.id = %s
        """,
        (item_id,),
    ).fetchone()
    if item is None:
        raise LookupError(f"No enrichment item {item_id}")
    try:
        conn.execute(
            "update enrichment_items set status = 'running', started_at = now(), detail = null where id = %s",
            (item_id,),
        )
        conn.commit()
    except psycopg.errors.UniqueViolation:
        conn.rollback()
        return _finish(conn, item_id, "waiting", "Another search is reading this course.")
    try:
        status, detail = _enrich(conn, fetcher, extractor, item["program_id"], item["official_url"], fresh_days)
    except Exception as exc:  # one broken course must not stop the rest of the job
        conn.rollback()
        status, detail = "failed", f"{type(exc).__name__}: {exc}"[:300]
    return _finish(conn, item_id, status, detail)
