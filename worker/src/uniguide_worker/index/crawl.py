"""Crawl curated course-index pages into the catalog.

A course is created only when the model's quote is on the page, its URL is one of the page's links, and that
URL is on the institution's own domain. A page the model could not read is never remembered as seen.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any

from ..db import Connection
from ..db_enums import ProgramLevel
from ..enrich.candidates import host_matches_domain, slugify, unique_slug
from ..extract.extractor import MAX_PAGE_CHARS
from ..fetch.fetcher import Fetcher, FetchRefused
from ..validate.quotes import normalise, quote_in_text
from .lister import MAX_LINKS, PROMPT_VERSION, CourseLister, ListedCourse

log = logging.getLogger(__name__)

MAX_COURSES = 300
LEVELS = {level.value for level in ProgramLevel}


@dataclass
class IndexReport:
    url: str
    status: str  # crawled | unchanged | refused | failed
    created: int = 0
    existing: int = 0
    promoted: int = 0
    rejected: list[str] = field(default_factory=list)
    detail: str = ""


def _reject_reason(course: ListedCourse, page_text: str, link_urls: set[str], domain: str) -> str | None:
    if course.level not in LEVELS:
        return f"{course.title}: level {course.level!r} is not one we know"
    if not quote_in_text(course.quote, page_text):
        return f"{course.title}: quote not found on the page"
    if normalise(course.title) not in normalise(course.quote):
        return f"{course.title}: the quote does not contain the title"
    url = course.url.split("#")[0]
    if url not in link_urls:
        return f"{course.title}: {url} is not a link on the page"
    if not host_matches_domain(url, domain):
        return f"{course.title}: {url} is not on the official domain {domain}"
    return None


def _touch(conn: Connection, index_id: Any, *, digest: str | None = None) -> None:
    conn.execute(
        """
        update institution_indexes
        set last_checked_at = now(),
            last_changed_at = case when %(h)s::text is not null then now() else last_changed_at end,
            content_hash = coalesce(%(h)s::text, content_hash)
        where id = %(i)s
        """,
        {"h": digest, "i": index_id},
    )
    conn.commit()


def _record_run(conn: Connection, run: Any, page_text: str) -> None:
    conn.execute(
        """
        insert into ai_runs (purpose, model, prompt_version, input_tokens, output_tokens, cost_usd, latency_ms,
                             stop_reason, input_hash)
        values ('index_list', %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            run.model,
            PROMPT_VERSION,
            run.input_tokens,
            run.output_tokens,
            run.cost_usd,
            run.latency_ms,
            run.error,
            hashlib.sha256(page_text.encode()).hexdigest(),
        ),
    )


def crawl_index(conn: Connection, fetcher: Fetcher, lister: CourseLister, index: dict[str, Any]) -> IndexReport:
    url, domain = index["url"], index["official_domain"]
    try:
        result = fetcher.fetch(url)
    except FetchRefused as exc:
        _touch(conn, index["id"])
        return IndexReport(url, "refused", detail=str(exc))
    if result.status >= 400 or not result.text:
        _touch(conn, index["id"])
        return IndexReport(url, "failed", detail=f"HTTP {result.status}")
    if result.content_hash == index["content_hash"]:
        _touch(conn, index["id"])
        return IndexReport(url, "unchanged")

    run = lister.list_courses(url, result.text, result.links)
    _record_run(conn, run, result.text)
    if run.courses is None:
        _touch(conn, index["id"])  # the hash is not stored, so the next crawl reads this page again
        return IndexReport(url, "failed", detail=run.error or "no list")

    report = IndexReport(url, "crawled")
    if len(result.text) > MAX_PAGE_CHARS or len(result.links) > MAX_LINKS or len(run.courses) > MAX_COURSES:
        report.detail = "Only part of this page was read; list its sections as separate index URLs."
    link_urls = {href.split("#")[0] for _, href in result.links}
    seen: set[tuple[str, str]] = set()
    for course in run.courses[:MAX_COURSES]:
        reason = _reject_reason(course, result.text, link_urls, domain)
        if reason:
            report.rejected.append(reason)
            continue
        key = (course.title.casefold(), course.level)
        if key in seen:
            continue
        seen.add(key)
        found = conn.execute(
            """
            select id, official_url, suggestion_status from programs
            where institution_id = %s and lower(title) = lower(%s) and level = %s limit 1
            """,
            (index["institution_id"], course.title, course.level),
        ).fetchone()
        if found:
            if found["suggestion_status"] == "pending":
                # The university's own list confirms what the model only suggested.
                conn.execute(
                    "update programs set published = true, suggestion_status = 'approved' where id = %s", (found["id"],)
                )
                report.promoted += 1
            else:
                report.existing += 1  # includes a rejected suggestion: an admin's decision stands
            if not found["official_url"]:
                conn.execute("update programs set official_url = %s where id = %s", (course.url, found["id"]))
            continue
        conn.execute(
            """
            insert into programs (institution_id, slug, title, level, official_url, coverage_tier, published,
                                  verification_method)
            values (%s, %s, %s, %s, %s, 'extracted', true, 'automated_extraction')
            """,
            (
                index["institution_id"],
                unique_slug(conn, slugify(f"{index['institution_name']} {course.title}")),
                course.title,
                course.level,
                course.url.split("#")[0],
            ),
        )
        report.created += 1
    # Remember the page only when it produced courses: an empty answer may be a weak one, so try again next time.
    accepted = report.created + report.existing + report.promoted
    _touch(conn, index["id"], digest=result.content_hash if accepted else None)
    return report


def crawl_all(
    conn: Connection,
    fetcher: Fetcher,
    lister: CourseLister,
    *,
    country: str | None = None,
    limit: int = 30,
    min_age_hours: int = 0,
) -> list[IndexReport]:
    """Crawl the active indexes that are due, least recently checked first."""
    rows = conn.execute(
        """
        select ix.*, i.official_domain, i.name as institution_name
        from institution_indexes ix join institutions i on i.id = ix.institution_id
        where ix.active and (%(c)s::text is null or i.country = %(c)s::text)
          and (ix.last_checked_at is null or ix.last_checked_at < now() - make_interval(hours => %(h)s))
        order by ix.last_checked_at nulls first limit %(n)s
        """,
        {"c": country, "h": min_age_hours, "n": limit},
    ).fetchall()
    reports: list[IndexReport] = []
    for row in rows:
        try:
            reports.append(crawl_index(conn, fetcher, lister, row))
        except Exception as exc:  # one broken site must not starve the others
            conn.rollback()
            log.exception("crawl of %s failed", row["url"])
            _touch(conn, row["id"])  # moves it to the back of the queue; no hash, so it is read again
            reports.append(IndexReport(row["url"], "failed", detail=f"{type(exc).__name__} while reading the page"))
    return reports
