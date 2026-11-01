"""Find a university's real course pages: verified or earlier-discovered courses first, then discover a course list.

Automatic discovery looks on the university's own site for the page that lists its graduate (or undergraduate)
programs, lets the course lister read it, and keeps the page only when enough of the courses it lists pass the crawl's
checks. The page is stored as an active but unverified index and its courses become published, unverified programs.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from ..db import Connection
from ..fetch.fetcher import Fetcher, FetchRefused, FetchResult
from ..index.crawl import _reject_reason, ingest_listed
from ..index.lister import CourseLister, ListedCourse
from .candidates import host_matches_domain

MIN_ACCEPTED = 5
RETRY_AFTER_DAYS = 7
FIRST_HOP = 4
SECOND_HOP = 2
LISTER_TRIES = 2

_GOOD = re.compile(
    r"program|degree|a-z|a to z|courses|majors|masters?|study|academics?|education|schools?", re.IGNORECASE
)
_GRADUATE = re.compile(r"graduate|postgrad|masters?|phd|doctor", re.IGNORECASE)
_UNDERGRADUATE = re.compile(r"undergrad|bachelor", re.IGNORECASE)
# News stories and the like often mention "programs" without listing any, so they count against a link.
_AVOID = re.compile(
    r"apply|fees?|funding|events?|login|visit|open-?day|accommodation|alumni|news|stor(?:y|ies)|press|blog|\b20\d\d\b",
    re.IGNORECASE,
)
_NOT_COURSE_HOSTS = ("news.", "events.", "blog.", "press.")
_GRADUATE_LEVELS = {"master", "doctorate"}

Page = tuple[str, str, set[str], list[ListedCourse]]


@dataclass(frozen=True)
class Discovery:
    status: Literal["found", "none", "blocked"]
    reason: str
    program_ids: list[UUID]


def real_courses(
    conn: Connection, institution_id: UUID, fields: list[str], levels: list[str], limit: int = 3
) -> list[UUID]:
    """Published courses of the university that have a page, in the student's levels and fields (any field if none)."""
    rows = conn.execute(
        """
        select p.id from programs p
        where p.institution_id = %(i)s and p.published and p.official_url is not null
          and (cardinality(%(levels)s::text[]) = 0 or p.level::text = any(%(levels)s::text[]))
          and (cardinality(%(fields)s::text[]) = 0
               or exists (select 1 from unnest(%(fields)s::text[]) f where p.isced_f like f || '%%'))
        order by p.coverage_tier desc, p.title
        limit %(n)s
        """,
        {"i": institution_id, "levels": levels, "fields": fields, "n": limit},
    ).fetchall()
    return [r["id"] for r in rows]


def _score(text: str, url: str, levels: list[str]) -> int:
    path = urlsplit(url).path.replace("-", " ").replace("_", " ")
    haystack = f"{text} {path}"
    score = len(_GOOD.findall(haystack)) - 2 * len(_AVOID.findall(haystack))
    graduate = bool(levels) and set(levels) <= _GRADUATE_LEVELS
    if graduate:
        score += 3 * len(_GRADUATE.findall(haystack)) - 4 * len(_UNDERGRADUATE.findall(haystack))
    elif "bachelor" in levels:
        score += 3 * len(_UNDERGRADUATE.findall(haystack))
    return score


def _best_links(page: FetchResult, domain: str, levels: list[str], count: int, seen: set[str]) -> list[str]:
    scored: dict[str, int] = {}
    for text, href in page.links:
        url = href.split("#")[0]
        host = (urlsplit(url).hostname or "").lower()
        if url in seen or url == page.final_url or not host_matches_domain(url, domain):
            continue
        if host.startswith(_NOT_COURSE_HOSTS):
            continue
        score = _score(text, url, levels)
        if score > 0 and score > scored.get(url, 0):
            scored[url] = score
    return sorted(scored, key=lambda u: -scored[u])[:count]


def _home(fetcher: Fetcher, domain: str) -> FetchResult | None:
    refused: FetchRefused | None = None
    for url in (f"https://www.{domain}/", f"https://{domain}/"):
        try:
            page = fetcher.fetch(url)
        except FetchRefused as exc:
            refused = exc
            continue
        if page.status < 400 and page.links:
            return page
    if refused is not None:
        raise refused
    return None


def find_index_page(
    fetcher: Fetcher, lister: CourseLister, domain: str, levels: list[str], *, deadline: float | None = None
) -> Page | None:
    """The first page of the university's own site that the lister reads into at least MIN_ACCEPTED real courses."""

    def out_of_time() -> bool:
        return deadline is not None and time.monotonic() > deadline

    home = _home(fetcher, domain)
    if home is None:
        return None
    seen = {home.final_url}
    fetched: list[FetchResult] = []
    for url in _best_links(home, domain, levels, FIRST_HOP, seen):
        if out_of_time():
            break
        seen.add(url)
        try:
            page = fetcher.fetch(url)
        except FetchRefused:
            continue
        if page.status >= 400 or not page.text:
            continue
        fetched.append(page)
        for second in _best_links(page, domain, levels, SECOND_HOP, seen):
            if out_of_time():
                break
            seen.add(second)
            try:
                inner = fetcher.fetch(second)
            except FetchRefused:
                continue
            if inner.status < 400 and inner.text:
                fetched.append(inner)
    for page in sorted(fetched, key=lambda p: -len(p.links))[:LISTER_TRIES]:
        if out_of_time():
            break
        run = lister.list_courses(page.final_url, page.text, page.links)
        link_urls = {href.split("#")[0] for _, href in page.links}
        accepted = [c for c in run.courses or [] if _reject_reason(c, page.text, link_urls, domain) is None]
        if len(accepted) >= MIN_ACCEPTED:
            return page.final_url, page.text, link_urls, accepted
    return None


def _remember(conn: Connection, institution_id: UUID, status: str, reason: str, index_url: str | None = None) -> None:
    conn.execute(
        """
        insert into institution_discovery (institution_id, status, reason, index_url, checked_at)
        values (%s, %s, %s, %s, now())
        on conflict (institution_id) do update
          set status = excluded.status, reason = excluded.reason, index_url = excluded.index_url, checked_at = now()
        """,
        (institution_id, status, reason, index_url),
    )
    conn.commit()


def discover(
    conn: Connection,
    fetcher: Fetcher,
    lister: CourseLister,
    institution_id: UUID,
    domain: str,
    fields: list[str],
    levels: list[str],
    *,
    deadline: float | None = None,
) -> Discovery:
    """Find and store a course list for a university with none. A dead end is remembered for RETRY_AFTER_DAYS."""
    earlier = conn.execute(
        """
        select status, reason from institution_discovery
        where institution_id = %s and status in ('none', 'blocked')
          and checked_at > now() - make_interval(days => %s)
        """,
        (institution_id, RETRY_AFTER_DAYS),
    ).fetchone()
    if earlier:
        return Discovery(earlier["status"], earlier["reason"] or "", [])
    try:
        found = find_index_page(fetcher, lister, domain, levels, deadline=deadline)
    except FetchRefused as exc:
        _remember(conn, institution_id, "blocked", str(exc)[:300])
        return Discovery("blocked", str(exc)[:300], [])
    except Exception as exc:  # a model timeout or a broken page must cost this university only
        reason = f"{type(exc).__name__}: {exc}"[:300]
        _remember(conn, institution_id, "none", reason)
        return Discovery("none", reason, [])
    if found is None:
        reason = "No page listing the university's courses could be read"
        _remember(conn, institution_id, "none", reason)
        return Discovery("none", reason, [])

    url, page_text, link_urls, accepted = found
    conn.execute(
        "insert into institution_indexes (institution_id, url, active) values (%s, %s, true) on conflict do nothing",
        (institution_id, url),
    )
    index = conn.execute(
        """
        select ix.*, i.official_domain, i.name as institution_name
        from institution_indexes ix join institutions i on i.id = ix.institution_id
        where ix.institution_id = %s and ix.url = %s
        """,
        (institution_id, url),
    ).fetchone()
    assert index is not None
    ingest_listed(conn, index, page_text, link_urls, accepted)
    ids = conn.execute(
        "select id from programs where institution_id = %s and official_url = any(%s)",
        (institution_id, [c.url.split("#")[0] for c in accepted]),
    ).fetchall()
    _remember(conn, institution_id, "found", "", url)
    return Discovery("found", "", [r["id"] for r in ids])
