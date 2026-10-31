"""Keep course facts current: read every registered official page of a course, and in season
re-check pages by demand, re-extracting only when a page's content changed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from .db import Connection
from .extract.base import PageExtractor
from .fetch.fetcher import Fetcher, FetchRefused
from .pipeline import PageReport, extract_page


@dataclass
class MonitorReport:
    checked: int = 0
    unchanged: int = 0
    extracted: int = 0
    refused: int = 0
    notified: int = 0
    pages: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__


def intake_cycle(conn: Connection, program_id: UUID) -> UUID | None:
    """The intake that page facts belong to: the latest current cycle that is not register data."""
    row = conn.execute(
        """
        select id from program_cycles
        where program_id = %s and is_current and intake_term <> 'any'
        order by intake_year desc limit 1
        """,
        (program_id,),
    ).fetchone()
    return row["id"] if row else None


def _record(
    conn: Connection, source: dict[str, Any], *, etag: str | None, modified: str | None, digest: str | None
) -> None:
    conn.execute(
        """
        update program_sources
        set last_checked_at = now(), etag = coalesce(%s, etag), last_modified = coalesce(%s, last_modified),
            last_changed_at = case when %s::text is not null and %s::text is distinct from content_hash then now()
                                   else last_changed_at end,
            content_hash = coalesce(%s, content_hash)
        where id = %s
        """,
        (etag, modified, digest, digest, digest, source["id"]),
    )


def check_source(
    conn: Connection, fetcher: Fetcher, extractor: PageExtractor, source: dict[str, Any], report: MonitorReport
) -> PageReport | None:
    cycle_id = intake_cycle(conn, source["program_id"])
    if cycle_id is None:
        report.pages.append({"url": source["url"], "status": "no intake cycle; add one in the review queue"})
        return None
    report.checked += 1
    try:
        result = fetcher.fetch(source["url"], etag=source["etag"], last_modified=source["last_modified"])
    except FetchRefused as exc:
        report.refused += 1
        conn.execute("update program_sources set last_checked_at = now() where id = %s", (source["id"],))
        report.pages.append({"url": source["url"], "status": "refused", "detail": str(exc)})
        return None

    if result.not_modified or (result.content_hash and result.content_hash == source["content_hash"]):
        report.unchanged += 1
        _record(conn, source, etag=result.etag, modified=result.last_modified, digest=None)
        conn.commit()
        return None

    page = extract_page(conn, fetcher, extractor, source["url"], cycle_id, result=result)
    # A page we could not read must not be remembered as "seen": the next run has to try it again.
    digest = None if page.status == "failed" else result.content_hash or None
    _record(conn, source, etag=result.etag, modified=result.last_modified, digest=digest)
    report.extracted += 1
    report.pages.append(
        {"url": source["url"], "status": page.status, "proposed": page.proposed, "changes": page.changes}
    )
    if page.changes:
        title = conn.execute(
            "select p.title, i.name from programs p join institutions i on i.id = p.institution_id where p.id = %s",
            (source["program_id"],),
        ).fetchone()
        assert title is not None
        row = conn.execute(
            "select public.notify_program_watchers(%s, %s, %s) as n",
            (
                source["program_id"],
                f"Information changed: {title['title']}, {title['name']}",
                "The official page now says something different. We are checking it; until then the new "
                "value is marked unverified.\n" + "\n".join(f"- {c}" for c in page.changes[:5]),
            ),
        ).fetchone()
        report.notified += row["n"] if row else 0
    conn.commit()
    return page


def extract_program(conn: Connection, fetcher: Fetcher, extractor: PageExtractor, slug: str) -> MonitorReport:
    report = MonitorReport()
    sources = conn.execute(
        """
        select s.* from program_sources s join programs p on p.id = s.program_id
        where p.slug = %s and s.active order by s.kind
        """,
        (slug,),
    ).fetchall()
    if not sources:
        report.pages.append({"status": f"no official pages registered for {slug}"})
    for source in sources:
        check_source(
            conn, fetcher, extractor, {**source, "etag": None, "last_modified": None, "content_hash": None}, report
        )
    return report


def monitor(conn: Connection, fetcher: Fetcher, extractor: PageExtractor, *, limit: int = 50) -> MonitorReport:
    """Re-check pages in order of need: courses whose unchecked facts students' next steps rely on, then the most
    shortlisted, then the least recently checked."""
    report = MonitorReport()
    sources = conn.execute(
        """
        with demand as (select program_id, shortlists, journey_steps from public.verification_demand(1000))
        select s.* from program_sources s
        left join demand d on d.program_id = s.program_id
        where s.active and (s.last_checked_at is null or s.last_checked_at < now() - interval '6 days')
        -- Pages whose unchecked facts students' next steps rely on come first (journey M6, J6.4, G25).
        order by coalesce(d.journey_steps, 0) desc, coalesce(d.shortlists, 0) desc, s.last_checked_at nulls first
        limit %s
        """,
        (limit,),
    ).fetchall()
    for source in sources:
        check_source(conn, fetcher, extractor, source, report)
    return report
