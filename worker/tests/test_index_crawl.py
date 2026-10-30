"""Crawling an index page: only courses that are quoted on the page and live on the institution's own site survive."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

import httpx
import pytest

from uniguide_worker.db import Connection
from uniguide_worker.fetch.fetcher import FetchRefused, FetchResult, content_hash
from uniguide_worker.index.crawl import crawl_all, crawl_index
from uniguide_worker.index.lister import CourseListRun, GeminiCourseLister, ListedCourse

from .conftest import FakeGenai, FakeGenaiResponse

PAGE = (
    "Graduate programs. Master of Science in Robotics. Master of Science in Data Science. "
    "Doctor of Philosophy in Physics. Bachelor of Arts in History."
)


def listed(title: str, url: str, level: str = "master", quote: str | None = None) -> ListedCourse:
    return ListedCourse(title=title, level=level, url=url, quote=quote or title)


class Lister:
    def __init__(self, courses: list[ListedCourse] | None, error: str | None = None) -> None:
        self.courses, self.error, self.calls = courses, error, 0

    def list_courses(self, url: str, page_text: str, links: tuple[tuple[str, str], ...]) -> CourseListRun:
        self.calls += 1
        return CourseListRun(self.courses, "test", 10, 5, 0.0, self.error)


class IndexFetcher:
    def __init__(
        self, domain: str, text: str = PAGE, status: int = 200, links: tuple[tuple[str, str], ...] | None = None
    ) -> None:
        self.domain, self.text, self.status = domain, text, status
        self.links = links or (
            ("Robotics MS", f"https://www.{domain}/robotics"),
            ("Data Science MS", f"https://www.{domain}/data-science"),
            ("Physics PhD", f"https://www.{domain}/physics"),
            ("Elsewhere", "https://evil.example.com/robotics"),
        )

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        text = self.text if self.status < 400 else ""
        return FetchResult(
            url, url, self.status, text, content_hash(text) if text else "", None, None, False, self.links
        )


class RefusingFetcher:
    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        raise FetchRefused(f"Disallowed by robots.txt: {url}")


@pytest.fixture
def index(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    domain = f"crawl-{tag}.example.org"
    inst = operator.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'US', %s) returning id",
        (f"Crawl U {tag}", domain),
    ).fetchone()
    assert inst is not None
    row = operator.execute(
        "insert into institution_indexes (institution_id, url, active) values (%s, %s, true) returning id",
        (inst["id"], f"https://www.{domain}/programs"),
    ).fetchone()
    assert row is not None
    operator.commit()
    yield {"id": row["id"], "institution": inst["id"], "domain": domain}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.commit()


def index_row(conn: Connection, ix: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        "select ix.*, i.official_domain, i.name as institution_name from institution_indexes ix join institutions i on i.id = ix.institution_id "
        "where ix.id = %s",
        (ix["id"],),
    ).fetchone()
    assert row
    return row


def programs(operator: Connection, ix: dict[str, Any]) -> list[dict[str, Any]]:
    return operator.execute(
        "select title, level, published, coverage_tier, official_url, suggestion_status from programs "
        "where institution_id = %s order by title",
        (ix["institution"],),
    ).fetchall()


def test_quoted_on_site_courses_are_created_published(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    lister = Lister(
        [
            listed("Master of Science in Robotics", f"https://www.{d}/robotics"),
            listed("Doctor of Philosophy in Physics", f"https://www.{d}/physics", level="doctorate"),
        ]
    )
    report = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.status == "crawled" and report.created == 2
    rows = programs(operator, index)
    assert [(r["title"], r["level"], r["published"], r["coverage_tier"]) for r in rows] == [
        ("Doctor of Philosophy in Physics", "doctorate", True, "extracted"),
        ("Master of Science in Robotics", "master", True, "extracted"),
    ]
    assert rows[1]["official_url"] == f"https://www.{d}/robotics" and rows[1]["suggestion_status"] is None


def test_a_course_whose_quote_is_not_on_the_page_is_dropped(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    lister = Lister(
        [listed("Master of Science in Alchemy", f"https://www.{d}/robotics", quote="Master of Science in Alchemy")]
    )
    report = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.created == 0 and any("quote" in r for r in report.rejected)
    assert programs(operator, index) == []


def test_a_url_off_the_institutions_domain_or_not_on_the_page_is_dropped(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    lister = Lister(
        [
            listed("Master of Science in Robotics", "https://evil.example.com/robotics"),
            listed("Master of Science in Data Science", f"https://www.{d}/invented-page"),
        ]
    )
    report = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.created == 0 and len(report.rejected) == 2
    assert programs(operator, index) == []


def test_a_bad_level_and_a_duplicate_title_are_not_added_twice(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    robotics = listed("Master of Science in Robotics", f"https://www.{d}/robotics")
    lister = Lister(
        [
            robotics,
            robotics,
            ListedCourse.model_construct(
                title="Bachelor of Arts in History",
                level="wizard",
                url=f"https://www.{d}/robotics",
                quote="Bachelor of Arts in History",
            ),
        ]
    )
    report = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.created == 1
    assert len(programs(operator, index)) == 1


def test_an_unchanged_page_is_not_sent_to_the_model_again(worker: Connection, index: dict[str, Any]) -> None:
    d = index["domain"]
    lister = Lister([listed("Master of Science in Robotics", f"https://www.{d}/robotics")])
    crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    again = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert again.status == "unchanged" and lister.calls == 1


def test_a_failed_read_is_retried_next_time(worker: Connection, index: dict[str, Any]) -> None:
    d = index["domain"]
    broken = Lister(None, error="connection error: down")
    assert crawl_index(worker, IndexFetcher(d), broken, index_row(worker, index)).status == "failed"  # type: ignore[arg-type]
    assert index_row(worker, index)["content_hash"] is None
    good = Lister([listed("Master of Science in Robotics", f"https://www.{d}/robotics")])
    assert crawl_index(worker, IndexFetcher(d), good, index_row(worker, index)).status == "crawled"  # type: ignore[arg-type]


def test_refused_and_missing_pages_are_reported_not_raised(worker: Connection, index: dict[str, Any]) -> None:
    lister = Lister([])
    assert crawl_index(worker, RefusingFetcher(), lister, index_row(worker, index)).status == "refused"  # type: ignore[arg-type]
    assert (
        crawl_index(worker, IndexFetcher(index["domain"], status=404), lister, index_row(worker, index)).status  # type: ignore[arg-type]
        == "failed"
    )
    assert lister.calls == 0


def test_only_active_indexes_are_crawled_and_the_limit_applies(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    operator.execute(
        "insert into institution_indexes (institution_id, url, active) values (%s, %s, false)",
        (index["institution"], f"https://www.{d}/off"),
    )
    operator.commit()
    lister = Lister([])
    reports = crawl_all(worker, IndexFetcher(d), lister, country="US", limit=500)  # type: ignore[arg-type]
    urls = {r.url for r in reports}
    assert f"https://www.{d}/programs" in urls and f"https://www.{d}/off" not in urls


def test_prompt_lists_the_links_and_the_model_output_is_parsed() -> None:
    reply = json.dumps(
        {
            "courses": [
                {"title": "MS Robotics", "level": "master", "url": "https://x.example.org/r", "quote": "MS Robotics"}
            ]
        }
    )
    client = FakeGenai(FakeGenaiResponse(reply))
    run = GeminiCourseLister(client=client, model="gemini-test").list_courses(
        "https://x.example.org/programs", "MS Robotics", (("MS Robotics", "https://x.example.org/r"),)
    )
    prompt = client.models.calls[0]["contents"]
    assert "https://x.example.org/r" in prompt and "MS Robotics" in prompt
    assert run.error is None and run.courses and run.courses[0].title == "MS Robotics"
    bad = GeminiCourseLister(client=FakeGenai(FakeGenaiResponse("nope")), model="gemini-test").list_courses(
        "u", "t", ()
    )
    assert bad.courses is None and bad.error


def course_page(domain: str, titles: list[str], *slugs: str) -> IndexFetcher:
    text = "Programs. " + ". ".join(titles) + "."
    return IndexFetcher(
        domain, text, links=tuple((t, f"https://www.{domain}/{sl}") for t, sl in zip(titles, slugs, strict=True))
    )


def test_a_long_course_name_does_not_stop_the_crawl(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    operator.execute(
        "update institutions set name = %s where id = %s",
        ("University of Illinois Urbana-Champaign", index["institution"]),
    )
    operator.commit()
    title = "Master of Science in Mechanical Science and Engineering"
    lister = Lister([listed(title, f"https://www.{d}/mechse")])
    report = crawl_index(worker, course_page(d, [title], "mechse"), lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.status == "crawled" and report.created == 1


class FlakyFetcher(IndexFetcher):
    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        if url.endswith("/bad"):
            raise httpx.ConnectError("connection reset")
        return super().fetch(url, etag, last_modified)


def test_one_failing_index_does_not_stop_the_others(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    operator.execute(
        "insert into institution_indexes (institution_id, url, active) values (%s, %s, true)",
        (index["institution"], f"https://www.{d}/bad"),
    )
    operator.commit()
    lister = Lister([listed("Master of Science in Robotics", f"https://www.{d}/robotics")])
    reports = {r.url.rsplit("/", 1)[1]: r for r in crawl_all(worker, FlakyFetcher(d), lister, country="US", limit=50)}  # type: ignore[arg-type]
    assert reports["bad"].status == "failed" and reports["programs"].status == "crawled"
    checked = operator.execute(
        "select last_checked_at from institution_indexes where url like %s", ("%/bad",)
    ).fetchone()
    assert checked and checked["last_checked_at"] is not None  # it moves to the back of the queue


def test_the_same_title_at_two_levels_is_two_courses(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    fetcher = course_page(d, ["Computer Science MS", "Computer Science PhD"], "cs-ms", "cs-phd")
    lister = Lister(
        [
            listed("Computer Science", f"https://www.{d}/cs-ms", quote="Computer Science MS"),
            listed("Computer Science", f"https://www.{d}/cs-phd", level="doctorate", quote="Computer Science PhD"),
        ]
    )
    report = crawl_index(worker, fetcher, lister, index_row(worker, index))  # type: ignore[arg-type]
    assert report.created == 2
    assert sorted(r["level"] for r in programs(operator, index)) == ["doctorate", "master"]


def test_an_official_listing_publishes_a_pending_suggestion_but_respects_a_rejection(
    worker: Connection, operator: Connection, index: dict[str, Any]
) -> None:
    d = index["domain"]
    for title, status in (
        ("Master of Science in Robotics", "pending"),
        ("Master of Science in Data Science", "rejected"),
    ):
        operator.execute(
            "insert into programs (institution_id, slug, title, level, published, suggestion_status) values (%s, %s, %s, 'master', false, %s)",
            (index["institution"], f"sugg-{uuid.uuid4().hex[:8]}", title, status),
        )
    operator.commit()
    lister = Lister(
        [
            listed("Master of Science in Robotics", f"https://www.{d}/robotics"),
            listed("Master of Science in Data Science", f"https://www.{d}/data-science"),
        ]
    )
    report = crawl_index(worker, IndexFetcher(d), lister, index_row(worker, index))  # type: ignore[arg-type]
    by_title = {r["title"]: r for r in programs(operator, index)}
    assert (
        by_title["Master of Science in Robotics"]["published"],
        by_title["Master of Science in Robotics"]["suggestion_status"],
    ) == (True, "approved")
    assert (
        by_title["Master of Science in Data Science"]["published"],
        by_title["Master of Science in Data Science"]["suggestion_status"],
    ) == (False, "rejected")
    assert report.promoted == 1 and report.created == 0


def test_an_empty_or_fully_rejected_listing_is_tried_again_next_time(worker: Connection, index: dict[str, Any]) -> None:
    d = index["domain"]
    crawl_index(worker, IndexFetcher(d), Lister([]), index_row(worker, index))  # type: ignore[arg-type]
    assert index_row(worker, index)["content_hash"] is None
    bad = Lister([listed("Master of Science in Alchemy", f"https://www.{d}/robotics")])
    crawl_index(worker, IndexFetcher(d), bad, index_row(worker, index))  # type: ignore[arg-type]
    assert index_row(worker, index)["content_hash"] is None
    ok = Lister([listed("Master of Science in Robotics", f"https://www.{d}/robotics")])
    crawl_index(worker, IndexFetcher(d), ok, index_row(worker, index))  # type: ignore[arg-type]
    assert index_row(worker, index)["content_hash"] is not None


def test_a_cut_off_model_answer_says_the_index_is_too_long() -> None:
    reply = FakeGenaiResponse('{"courses": [', finish_reason="MAX_TOKENS")
    run = GeminiCourseLister(client=FakeGenai(reply), model="gemini-test").list_courses("u", "t", ())
    assert run.courses is None and run.error and "too long" in run.error
