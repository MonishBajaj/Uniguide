"""The candidate loop: universities in order, courses read, complete ones kept, the rest skipped and replaced."""

from __future__ import annotations

import itertools
import json
import uuid
from collections.abc import Iterator
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich import serve as serve_mod
from uniguide_worker.enrich.serve import run_candidates, run_job
from uniguide_worker.extract.extractor import ExtractionRun
from uniguide_worker.extract.prompt import PROMPT_VERSION
from uniguide_worker.index.lister import ListedCourse

from .test_enrich_discover import MapLister, SiteFetcher
from .test_enrich_item import HOST, PageFetcher
from .test_proposals import PAGE, extraction

SNAPSHOT = {"target_countries": ["US"], "target_levels": ["master"], "target_fields": ["06"]}


class UrlExtractor:
    """Complete facts for every course except those whose url says /partial/ (no deadline)."""

    version = f"test/{PROMPT_VERSION}"

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        found = extraction(deadlines=[]) if "/partial/" in url else extraction()
        return ExtractionRun(found, "test", PROMPT_VERSION, "end_turn", 1, 1, 0.0, 1)


class CoursePagesFetcher(SiteFetcher):
    """A fake site whose course pages (under HOST) all say PAGE; anything else comes from `pages`."""

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> Any:
        if url.startswith(HOST):
            return PageFetcher().fetch(url)
        return super().fetch(url, etag, last_modified)


@pytest.fixture
def ctx(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    user = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1995-01", "residence_country": "IN"}') returning id
        """,
        (f"loop-{tag}@example.com",),
    ).fetchone()
    assert user is not None
    operator.commit()
    state: dict[str, Any] = {"op": operator, "user": user["id"], "tag": tag, "institutions": []}
    yield state
    for inst in state["institutions"]:
        operator.execute("delete from institutions where id = %s", (inst,))
    operator.execute("delete from auth.users where id = %s", (user["id"],))
    operator.commit()


def university(ctx: dict[str, Any], courses: int, kind: str = "complete", field: str = "0613") -> uuid.UUID:
    op: Connection = ctx["op"]
    n = len(ctx["institutions"])
    inst = op.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'US', %s) returning id",
        (f"Loop U {ctx['tag']} {n}", f"u{n}-{ctx['tag']}.example.org"),
    ).fetchone()
    assert inst is not None
    ctx["institutions"].append(inst["id"])
    for c in range(courses):
        op.execute(
            "insert into programs (institution_id, slug, title, level, isced_f, published, official_url) "
            "values (%s, %s, %s, 'master', %s, true, %s)",
            (inst["id"], f"loop-{uuid.uuid4().hex[:10]}", f"MSc {c}", field, f"{HOST}/{kind}/{uuid.uuid4().hex[:8]}"),
        )
    op.commit()
    return inst["id"]  # type: ignore[no-any-return]


def make_job(ctx: dict[str, Any], institutions: list[uuid.UUID], snapshot: dict[str, Any] | None = None, **cols: int) -> Any:
    op: Connection = ctx["op"]
    job = op.execute(
        "insert into enrichment_jobs (user_id, profile_snapshot, max_tries, status, heartbeat_at) "
        "values (%s, %s, %s, 'running', now()) returning id",  # running, so a live worker does not claim it
        (ctx["user"], json.dumps(snapshot if snapshot is not None else SNAPSHOT), cols.get("max_tries", 30)),
    ).fetchone()
    assert job is not None
    for position, inst in enumerate(institutions, 1):
        op.execute(
            "insert into enrichment_candidates (job_id, position, institution_id) values (%s, %s, %s)",
            (job["id"], position, inst),
        )
    op.commit()
    return job["id"]


def loop(worker: Connection, job: Any, **kw: Any) -> None:
    kw.setdefault("fetcher", PageFetcher())
    kw.setdefault("extractor", UrlExtractor())
    kw.setdefault("lister", MapLister())
    kw.setdefault("sleep", lambda _s: None)
    run_candidates(worker, kw.pop("fetcher"), kw.pop("extractor"), kw.pop("lister"), job, fresh_days=7, **kw)


def job_row(ctx: dict[str, Any], job: Any) -> dict[str, Any]:
    row = ctx["op"].execute("select * from enrichment_jobs where id = %s", (job,)).fetchone()
    assert row is not None
    return row


def candidates(ctx: dict[str, Any], job: Any) -> list[tuple[str, int]]:
    rows = ctx["op"].execute(
        "select status, courses from enrichment_candidates where job_id = %s order by position", (job,)
    ).fetchall()
    return [(r["status"], r["courses"]) for r in rows]


def item_statuses(ctx: dict[str, Any], job: Any) -> list[str]:
    rows = ctx["op"].execute("select status from enrichment_items where job_id = %s", (job,)).fetchall()
    return sorted(r["status"] for r in rows)


def test_the_loop_stops_at_ten_complete_courses_from_several_universities(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 3) for _ in range(8)])
    loop(worker, job)
    row = job_row(ctx, job)
    assert (row["status"], row["stage"], row["tried"], row["kept"]) == ("done", "done", 4, 10)
    assert candidates(ctx, job) == [("kept", 3), ("kept", 3), ("kept", 3), ("kept", 1)] + [("pending", 0)] * 4
    assert item_statuses(ctx, job) == ["extracted"] * 10


def test_a_university_with_only_incomplete_courses_is_skipped_and_the_next_one_tried(
    worker: Connection, ctx: dict[str, Any]
) -> None:
    job = make_job(ctx, [university(ctx, 2, "partial"), university(ctx, 1)])
    loop(worker, job)
    assert candidates(ctx, job) == [("skipped", 0), ("kept", 1)]
    assert item_statuses(ctx, job) == ["extracted", "incomplete", "incomplete"]
    reason = ctx["op"].execute("select reason from enrichment_candidates where job_id = %s and position = 1", (job,)).fetchone()
    assert reason is not None and "missing" in reason["reason"]
    assert (job_row(ctx, job)["tried"], job_row(ctx, job)["kept"]) == (2, 1)


def test_the_job_stops_after_the_maximum_number_of_tries(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 1, "partial") for _ in range(32)], max_tries=30)
    loop(worker, job)
    row = job_row(ctx, job)
    assert (row["status"], row["tried"], row["kept"]) == ("done", 30, 0)
    assert [s for s, _ in candidates(ctx, job)].count("pending") == 2


def test_a_job_where_every_university_is_skipped_still_finishes(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 0), university(ctx, 1, "partial")])
    loop(worker, job)
    row = job_row(ctx, job)
    assert (row["status"], row["tried"], row["kept"]) == ("done", 2, 0)
    assert [s for s, _ in candidates(ctx, job)] == ["skipped", "skipped"]


def test_a_university_whose_discovery_fails_is_skipped_and_the_next_one_tried(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 0), university(ctx, 1)])
    loop(worker, job, fetcher=CoursePagesFetcher({}), lister=MapLister(error=TimeoutError("model timed out")))
    assert [s for s, _ in candidates(ctx, job)] == ["skipped", "kept"]
    assert job_row(ctx, job)["status"] == "done"


def test_an_unexpected_error_for_one_university_skips_only_that_one(
    worker: Connection, ctx: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    job = make_job(ctx, [university(ctx, 1), university(ctx, 1)])
    real = serve_mod.real_courses
    calls = itertools.count()

    def flaky(*args: Any, **kwargs: Any) -> Any:
        if next(calls) == 0:
            raise ValueError("boom")
        return real(*args, **kwargs)

    monkeypatch.setattr(serve_mod, "real_courses", flaky)
    loop(worker, job)
    assert [s for s, _ in candidates(ctx, job)] == ["skipped", "kept"]
    reason = ctx["op"].execute("select reason from enrichment_candidates where job_id = %s and position = 1", (job,)).fetchone()
    assert reason is not None and "ValueError" in reason["reason"]


def test_the_time_budget_stops_a_job(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 1) for _ in range(3)])
    clock = itertools.count(0, 2000)
    loop(worker, job, budget_seconds=2700, now=lambda: float(next(clock)))
    row = job_row(ctx, job)
    assert (row["status"], row["tried"]) == ("done", 1)


def test_a_fresh_complete_course_counts_without_being_fetched_again(worker: Connection, ctx: dict[str, Any]) -> None:
    inst = university(ctx, 1)
    first = make_job(ctx, [inst])
    loop(worker, first)
    again = make_job(ctx, [inst])
    # the first job is done, so a second one can be queued for the same university
    fetcher = PageFetcher()
    loop(worker, again, fetcher=fetcher)
    assert fetcher.calls == [] and candidates(ctx, again) == [("kept", 1)]
    assert item_statuses(ctx, again) == ["skipped_fresh"]


def test_at_most_three_courses_of_one_university_are_read(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 5)])
    loop(worker, job)
    assert candidates(ctx, job) == [("kept", 3)] and len(item_statuses(ctx, job)) == 3


def test_courses_already_in_the_catalogue_are_used_without_asking_the_model(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 2)])
    lister = MapLister()
    loop(worker, job, lister=lister)
    assert lister.asked == []


def test_a_student_with_no_field_gets_courses_of_any_field(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 1, field="04")], snapshot={"target_levels": ["master"]})
    loop(worker, job)
    assert candidates(ctx, job) == [("kept", 1)]


def test_a_course_in_another_field_is_not_used(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 1, field="04")])
    loop(worker, job)
    assert candidates(ctx, job) == [("skipped", 0)]


def test_run_job_hands_a_job_with_candidates_to_the_loop(worker: Connection, ctx: dict[str, Any]) -> None:
    job = make_job(ctx, [university(ctx, 1)])
    run_job(worker, PageFetcher(), UrlExtractor(), None, job, fresh_days=7, lister=MapLister(), sleep=lambda _s: None)
    assert candidates(ctx, job) == [("kept", 1)] and job_row(ctx, job)["status"] == "done"


def test_discovery_finds_courses_for_a_university_with_none(worker: Connection, ctx: dict[str, Any]) -> None:
    inst = university(ctx, 0)
    d = ctx["op"].execute("select official_domain from institutions where id = %s", (inst,)).fetchone()["official_domain"]
    titles = [f"Program {n}" for n in range(5)]
    links = tuple((t, f"https://www.{d}/programs/{i}") for i, t in enumerate(titles))
    listed = [ListedCourse(title=t, level="master", url=u, quote=t, field="06") for t, u in links]
    pages: dict[str, Any] = {
        f"https://www.{d}/": ("Home", (("Graduate programs", f"https://www.{d}/graduate/programs"),)),
        f"https://www.{d}/graduate/programs": (" ".join(titles), links),
    }
    pages.update({u: (PAGE, ()) for _, u in links})
    job = make_job(ctx, [inst])
    loop(worker, job, fetcher=SiteFetcher(pages), lister=MapLister({f"https://www.{d}/graduate/programs": listed}))
    assert candidates(ctx, job) == [("kept", 3)] and job_row(ctx, job)["kept"] == 3
