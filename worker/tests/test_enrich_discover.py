"""Finding a university's real course pages: verified courses first, then a discovered course-list page."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich.discover import MIN_ACCEPTED, discover, find_index_page, real_courses
from uniguide_worker.fetch.fetcher import FetchRefused, FetchResult, content_hash
from uniguide_worker.index.lister import CourseListRun, ListedCourse


class SiteFetcher:
    """A fake website: url -> (page text, links). Unknown urls are 404; urls in `refused` raise FetchRefused."""

    def __init__(self, pages: dict[str, tuple[str, tuple[tuple[str, str], ...]]], refused: set[str] | None = None) -> None:
        self.pages, self.refused, self.calls = pages, refused or set(), []

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        self.calls.append(url)
        if url in self.refused:
            raise FetchRefused(f"Disallowed by robots.txt: {url}")
        if url not in self.pages:
            return FetchResult(url, url, 404, "", "", None, None, False, ())
        text, links = self.pages[url]
        return FetchResult(url, url, 200, text, content_hash(text), None, None, False, links)


class MapLister:
    """Answers per page url; records which pages it was asked about."""

    def __init__(self, by_url: dict[str, list[ListedCourse]] | None = None, error: Exception | None = None) -> None:
        self.by_url, self.error, self.asked = by_url or {}, error, []

    def list_courses(self, url: str, page_text: str, links: tuple[tuple[str, str], ...]) -> CourseListRun:
        self.asked.append(url)
        if self.error:
            raise self.error
        return CourseListRun(self.by_url.get(url, []), "test", 1, 1, 0.0)


@pytest.fixture
def site(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    domain = f"disc-{tag}.example.org"
    inst = operator.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'US', %s) returning id",
        (f"Disc U {tag}", domain),
    ).fetchone()
    assert inst is not None
    operator.commit()
    yield {"institution": inst["id"], "domain": domain, "operator": operator}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.commit()


def add_program(site: dict[str, Any], title: str, **kw: Any) -> uuid.UUID:
    row = site["operator"].execute(
        "insert into programs (institution_id, slug, title, level, isced_f, published, official_url) "
        "values (%s, %s, %s, %s, %s, %s, %s) returning id",
        (
            site["institution"],
            f"disc-{uuid.uuid4().hex[:10]}",
            title,
            kw.get("level", "master"),
            kw.get("field", "0613"),
            kw.get("published", True),
            kw.get("url", f"https://www.{site['domain']}/{uuid.uuid4().hex[:6]}"),
        ),
    ).fetchone()
    site["operator"].commit()
    return row["id"]  # type: ignore[index]


def course_pages(domain: str, titles: list[str]) -> tuple[str, tuple[tuple[str, str], ...], list[ListedCourse]]:
    links = tuple((t, f"https://www.{domain}/programs/{i}") for i, t in enumerate(titles))
    listed = [ListedCourse(title=t, level="master", url=u, quote=t, field="06") for t, u in links]
    return " ".join(titles), links, listed


def home(domain: str, *links: tuple[str, str]) -> tuple[str, tuple[tuple[str, str], ...]]:
    return "Welcome to the university", tuple(links)


# --- real_courses ---------------------------------------------------------------------------------------------------


def test_real_courses_match_level_and_field_and_need_a_page(worker: Connection, site: dict[str, Any]) -> None:
    ok = add_program(site, "MS Computer Science", field="0613")
    add_program(site, "BS Computer Science", level="bachelor")
    add_program(site, "MS Law", field="04")
    add_program(site, "Draft", published=False)
    add_program(site, "No page", url=None)
    assert real_courses(worker, site["institution"], ["06"], ["master"]) == [ok]


def test_real_courses_are_limited_and_ignore_field_when_none_is_chosen(worker: Connection, site: dict[str, Any]) -> None:
    ids = [add_program(site, f"MS {n}", field="04" if n % 2 else "0613") for n in range(5)]
    assert len(real_courses(worker, site["institution"], [], ["master"], limit=3)) == 3
    assert set(real_courses(worker, site["institution"], [], ["master"], limit=10)) == set(ids)


# --- find_index_page ------------------------------------------------------------------------------------------------


def test_a_page_with_enough_accepted_courses_is_found(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    found = find_index_page(SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"])
    assert found is not None
    url, page_text, link_urls, accepted = found
    assert url == f"https://www.{d}/graduate/programs" and len(accepted) == MIN_ACCEPTED
    assert page_text == text and all(c.url in link_urls for c in accepted)


def test_a_page_of_navigation_links_is_not_an_index(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, ["Master's courses", "Doctoral courses", "Short courses"])
    pages = {
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    assert find_index_page(SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"]) is None


def test_a_page_the_model_lists_nothing_on_is_not_an_index(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    pages = {
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": ("Search for a program", ()),
    }
    assert find_index_page(SiteFetcher(pages), MapLister(), d, ["master"]) is None


def test_graduate_pages_are_tried_before_undergraduate_ones_for_a_masters_student(
    worker: Connection, site: dict[str, Any]
) -> None:
    d = site["domain"]
    pages = {
        f"https://www.{d}/": home(
            d,
            ("Undergraduate programs", f"https://www.{d}/undergraduate/programs"),
            ("Graduate programs", f"https://www.{d}/graduate/programs"),
        ),
        f"https://www.{d}/undergraduate/programs": ("ug " * 5, tuple((f"ug {n}", f"https://www.{d}/ug/{n}") for n in range(9))),
        f"https://www.{d}/graduate/programs": ("grad " * 5, tuple((f"gr {n}", f"https://www.{d}/gr/{n}") for n in range(3))),
    }
    lister = MapLister()
    find_index_page(SiteFetcher(pages), lister, d, ["master"])
    assert lister.asked[0] == f"https://www.{d}/graduate/programs"


def test_the_bare_domain_is_tried_when_www_is_missing(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    found = find_index_page(SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"])
    assert found is not None


# --- discover -------------------------------------------------------------------------------------------------------


def discoverable(site: dict[str, Any]) -> tuple[SiteFetcher, MapLister]:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    return SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed})


def test_discovery_stores_the_index_and_its_courses(worker: Connection, site: dict[str, Any]) -> None:
    fetcher, lister = discoverable(site)
    result = discover(worker, fetcher, lister, site["institution"], site["domain"], ["06"], ["master"])
    assert result.status == "found" and len(result.program_ids) == MIN_ACCEPTED
    op: Connection = site["operator"]
    index = op.execute("select url, active from institution_indexes where institution_id = %s", (site["institution"],)).fetchone()
    assert index == {"url": f"https://www.{site['domain']}/graduate/programs", "active": True}
    rows = op.execute("select isced_f, official_url, published from programs where institution_id = %s", (site["institution"],)).fetchall()
    assert len(rows) == MIN_ACCEPTED and all(r["isced_f"] == "06" and r["published"] and r["official_url"] for r in rows)
    remembered = op.execute("select status, index_url from institution_discovery where institution_id = %s", (site["institution"],)).fetchone()
    assert remembered == {"status": "found", "index_url": index["url"]}


def test_a_refused_site_is_blocked(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    fetcher = SiteFetcher({}, refused={f"https://www.{d}/", f"https://{d}/"})
    result = discover(worker, fetcher, MapLister(), site["institution"], d, ["06"], ["master"])
    assert result.status == "blocked" and "robots" in result.reason.lower()


def test_a_site_with_no_course_list_is_none_and_not_retried_for_a_week(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    fetcher = SiteFetcher({f"https://www.{d}/": home(d)})
    first = discover(worker, fetcher, MapLister(), site["institution"], d, ["06"], ["master"])
    assert first.status == "none" and first.reason
    calls = len(fetcher.calls)
    again = discover(worker, fetcher, MapLister(), site["institution"], d, ["06"], ["master"])
    assert again.status == "none" and len(fetcher.calls) == calls


def test_an_old_failure_is_tried_again(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    op: Connection = site["operator"]
    op.execute(
        "insert into institution_discovery (institution_id, status, reason, checked_at) values (%s, 'none', 'old', now() - interval '8 days')",
        (site["institution"],),
    )
    op.commit()
    fetcher, lister = discoverable(site)
    assert discover(worker, fetcher, lister, site["institution"], d, ["06"], ["master"]).status == "found"


def test_a_model_error_makes_the_university_none_not_a_crash(worker: Connection, site: dict[str, Any]) -> None:
    fetcher, _ = discoverable(site)
    result = discover(worker, fetcher, MapLister(error=TimeoutError("model timed out")), site["institution"], site["domain"], ["06"], ["master"])
    assert result.status == "none" and "model timed out" in result.reason
