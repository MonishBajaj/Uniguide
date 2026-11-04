"""Finding a university's real course pages: verified courses first, then a discovered course-list page."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any, cast

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich.discover import MIN_ACCEPTED, discover, find_index_page, real_courses
from uniguide_worker.fetch.fetcher import Fetcher, FetchRefused, FetchResult, content_hash
from uniguide_worker.index.lister import CourseListRun, ListedCourse
from uniguide_worker.index.seed import seed_urls


class SiteFetcher(Fetcher):
    """A fake website: url -> (page text, links). Unknown urls are 404; urls in `refused` raise FetchRefused."""

    def __init__(
        self, pages: dict[str, tuple[str, tuple[tuple[str, str], ...]]], refused: set[str] | None = None
    ) -> None:
        self.pages, self.refused = pages, refused or set()
        self.calls: list[str] = []

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
        self.by_url, self.error = by_url or {}, error
        self.asked: list[str] = []

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
    row = (
        site["operator"]
        .execute(
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
        )
        .fetchone()
    )
    site["operator"].commit()
    assert row is not None
    return cast(uuid.UUID, row["id"])


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


def test_real_courses_are_limited_and_ignore_field_when_none_is_chosen(
    worker: Connection, site: dict[str, Any]
) -> None:
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
    found = find_index_page(
        SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"]
    )
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
    assert (
        find_index_page(SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"])
        is None
    )


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
        f"https://www.{d}/undergraduate/programs": (
            "ug " * 5,
            tuple((f"ug {n}", f"https://www.{d}/ug/{n}") for n in range(9)),
        ),
        f"https://www.{d}/graduate/programs": (
            "grad " * 5,
            tuple((f"gr {n}", f"https://www.{d}/gr/{n}") for n in range(3)),
        ),
    }
    lister = MapLister()
    find_index_page(SiteFetcher(pages), lister, d, ["master"])
    assert lister.asked[0] == f"https://www.{d}/graduate/programs"


def test_news_stories_are_not_followed_even_when_they_mention_programs(
    worker: Connection, site: dict[str, Any]
) -> None:
    d = site["domain"]
    news = f"https://news.{d}/stories/2026/10/new-graduate-programs-launch"
    pages = {
        f"https://www.{d}/": home(
            d,
            ("New graduate programs launch this fall", news),
            ("Graduate programs", f"https://www.{d}/graduate/programs"),
        ),
        news: ("story " * 10, tuple((f"s{n}", f"https://www.{d}/s/{n}") for n in range(20))),
        f"https://www.{d}/graduate/programs": ("grad", ()),
    }
    fetcher = SiteFetcher(pages)
    find_index_page(fetcher, MapLister(), d, ["master"])
    assert news not in fetcher.calls


def test_a_graduate_admissions_page_can_lead_to_the_program_list(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://www.{d}/": home(d, ("Education", f"https://www.{d}/education")),
        f"https://www.{d}/education": (
            "Education",
            (("Graduate admissions", f"https://www.{d}/graduate-admissions/programs"),),
        ),
        f"https://www.{d}/graduate-admissions/programs": (text, links),
    }
    found = find_index_page(
        SiteFetcher(pages), MapLister({f"https://www.{d}/graduate-admissions/programs": listed}), d, ["master"]
    )
    assert found is not None and found[0].endswith("/graduate-admissions/programs")


def test_the_bare_domain_is_tried_when_www_is_missing(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    found = find_index_page(
        SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"]
    )
    assert found is not None


def test_a_known_index_url_is_read_first_and_the_home_page_is_not_visited(
    worker: Connection, site: dict[str, Any]
) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    seed = f"https://www.{d}/known/list"
    fetcher = SiteFetcher({seed: (text, links)})
    found = find_index_page(fetcher, MapLister({seed: listed}), d, ["master"], seeds=[seed])
    assert found is not None and found[0] == seed
    assert fetcher.calls == [seed]


def test_the_home_page_is_used_when_a_known_index_url_gives_too_few_courses(
    worker: Connection, site: dict[str, Any]
) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    seed = f"https://www.{d}/known/list"
    pages = {
        seed: ("empty", ()),
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    found = find_index_page(
        SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed}), d, ["master"], seeds=[seed]
    )
    assert found is not None and found[0].endswith("/graduate/programs")


def test_seed_urls_come_from_the_curated_files_for_the_domain(tmp_path: Any) -> None:
    (tmp_path / "us").mkdir()
    (tmp_path / "us" / "x.yaml").write_text(
        "institution: X U\ncountry: US\nofficial_domain: x.example.edu\nindexes:\n"
        "  - url: https://grad.x.example.edu/programs\n  - url: https://x.example.edu/catalog\n"
    )
    assert seed_urls("www.x.example.edu", root=tmp_path) == [
        "https://grad.x.example.edu/programs",
        "https://x.example.edu/catalog",
    ]
    assert seed_urls("other.example.edu", root=tmp_path) == []


def test_the_heartbeat_is_sent_before_every_fetch_and_model_call(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    pages = {
        f"https://www.{d}/": home(d, ("Graduate programs", f"https://www.{d}/graduate/programs")),
        f"https://www.{d}/graduate/programs": (text, links),
    }
    fetcher, lister = SiteFetcher(pages), MapLister({f"https://www.{d}/graduate/programs": listed})
    beats: list[int] = []
    find_index_page(
        fetcher, lister, d, ["master"], heartbeat=lambda: beats.append(len(fetcher.calls) + len(lister.asked))
    )
    assert len(beats) == len(fetcher.calls) + len(lister.asked)


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
    index = op.execute(
        "select url, active from institution_indexes where institution_id = %s", (site["institution"],)
    ).fetchone()
    assert index == {"url": f"https://www.{site['domain']}/graduate/programs", "active": True}
    rows = op.execute(
        "select isced_f, official_url, published from programs where institution_id = %s", (site["institution"],)
    ).fetchall()
    assert len(rows) == MIN_ACCEPTED and all(
        r["isced_f"] == "06" and r["published"] and r["official_url"] for r in rows
    )
    remembered = op.execute(
        "select status, index_url from institution_discovery where institution_id = %s", (site["institution"],)
    ).fetchone()
    assert remembered == {"status": "found", "index_url": index["url"]}


def test_a_refused_site_is_blocked(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    fetcher = SiteFetcher({}, refused={f"https://www.{d}/", f"https://{d}/"})
    result = discover(worker, fetcher, MapLister(), site["institution"], d, ["06"], ["master"])
    assert result.status == "blocked" and "robots" in result.reason.lower()


def test_a_site_with_no_course_list_is_none_and_not_retried_for_a_week(
    worker: Connection, site: dict[str, Any]
) -> None:
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
    result = discover(
        worker,
        fetcher,
        MapLister(error=TimeoutError("model timed out")),
        site["institution"],
        site["domain"],
        ["06"],
        ["master"],
    )
    assert result.status == "none" and "model timed out" in result.reason


def test_discovery_reads_a_known_index_url_before_guessing(worker: Connection, site: dict[str, Any]) -> None:
    d = site["domain"]
    text, links, listed = course_pages(d, [f"Program {n}" for n in range(MIN_ACCEPTED)])
    seed = f"https://www.{d}/known/list"
    fetcher = SiteFetcher({seed: (text, links)})
    result = discover(
        worker, fetcher, MapLister({seed: listed}), site["institution"], d, ["06"], ["master"], seeds=[seed]
    )
    assert result.status == "found" and len(result.program_ids) == MIN_ACCEPTED
    assert fetcher.calls == [seed]


def test_a_known_index_on_a_sibling_host_is_accepted_and_the_broader_domain_is_recorded(
    worker: Connection, site: dict[str, Any], tmp_path: Any
) -> None:
    d = site["domain"]
    op: Connection = site["operator"]
    op.execute("update institutions set official_domain = %s where id = %s", (f"www.{d}", site["institution"]))
    op.commit()
    (tmp_path / "us").mkdir()
    seed = f"https://grad.{d}/programs"
    (tmp_path / "us" / "u.yaml").write_text(
        f"institution: Disc U\ncountry: US\nofficial_domain: {d}\nindexes:\n  - url: {seed}\n"
    )
    links = tuple((f"Program {n}", f"https://grad.{d}/programs/{n}") for n in range(MIN_ACCEPTED))
    listed = [ListedCourse(title=t, level="master", url=u, quote=t, field="06") for t, u in links]
    fetcher = SiteFetcher({seed: (" ".join(t for t, _ in links), links)})
    result = discover(
        worker,
        fetcher,
        MapLister({seed: listed}),
        site["institution"],
        f"www.{d}",
        ["06"],
        ["master"],
        seed_root=tmp_path,
    )
    assert result.status == "found" and len(result.program_ids) == MIN_ACCEPTED
    row = op.execute("select official_domain from institutions where id = %s", (site["institution"],)).fetchone()
    assert row == {"official_domain": d}
