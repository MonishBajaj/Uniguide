"""Crawling an index page: only courses that are quoted on the page and live on the institution's own site survive."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

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
    return ListedCourse(title=title, level=level, url=url, quote=quote or title)  # type: ignore[arg-type]


class Lister:
    def __init__(self, courses: list[ListedCourse] | None, error: str | None = None) -> None:
        self.courses, self.error, self.calls = courses, error, 0

    def list_courses(self, url: str, page_text: str, links: tuple[tuple[str, str], ...]) -> CourseListRun:
        self.calls += 1
        return CourseListRun(self.courses, "test", 10, 5, 0.0, self.error)


class IndexFetcher:
    def __init__(self, domain: str, text: str = PAGE, status: int = 200) -> None:
        self.domain, self.text, self.status = domain, text, status
        self.links = (
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
    row = operator.execute(
        "insert into institution_indexes (institution_id, url, active) values (%s, %s, true) returning id",
        (inst["id"], f"https://www.{domain}/programs"),
    ).fetchone()
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
        crawl_index(worker, IndexFetcher(index["domain"], status=404), lister, index_row(worker, index)).status
        == "failed"
    )  # type: ignore[arg-type]
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
    run = GeminiCourseLister(client=client, model="gemini-test").list_courses(  # type: ignore[arg-type]
        "https://x.example.org/programs", "MS Robotics", (("MS Robotics", "https://x.example.org/r"),)
    )
    prompt = client.models.calls[0]["contents"]
    assert "https://x.example.org/r" in prompt and "MS Robotics" in prompt
    assert run.error is None and run.courses and run.courses[0].title == "MS Robotics"
    bad = GeminiCourseLister(client=FakeGenai(FakeGenaiResponse("nope")), model="gemini-test").list_courses(
        "u", "t", ()
    )  # type: ignore[arg-type]
    assert bad.courses is None and bad.error
