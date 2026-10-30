"""Job runner against the local database: stages, fallback, failures, rate limits and stale jobs."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich import serve as serve_mod
from uniguide_worker.enrich.serve import claim_job, run_job
from uniguide_worker.extract.extractor import ExtractionRun, Extractor
from uniguide_worker.extract.prompt import PROMPT_VERSION

from .conftest import FakeAnthropic, FakeGenai, FakeGenaiResponse, FakeResponse
from .test_enrich_item import HOST, PageFetcher, RefusingFetcher
from .test_proposals import extraction


def claude() -> Extractor:
    return Extractor(client=FakeAnthropic(FakeResponse(extraction())))  # type: ignore[arg-type]


@pytest.fixture
def world(operator: Connection) -> Iterator[dict[str, Any]]:
    tag = uuid.uuid4().hex[:8]
    user = operator.execute(
        """
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s,
                '{"birth_month": "1995-01", "residence_country": "IN"}') returning id
        """,
        (f"job-{tag}@example.com",),
    ).fetchone()
    assert user is not None
    inst = operator.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'DE', 'enrich.example.org') returning id",
        (f"Job U {tag}",),
    ).fetchone()
    assert inst is not None
    operator.commit()
    yield {"user": user["id"], "inst": inst["id"], "tag": tag, "operator": operator}
    operator.execute("delete from institutions where id = %s", (inst["id"],))
    operator.execute("delete from institutions where official_domain like %s", (f"%{tag}%",))
    operator.execute("delete from auth.users where id = %s", (user["id"],))
    operator.commit()


def make_job(
    world: dict[str, Any], courses: int, *, allow_fallback: bool = False, snapshot: dict[str, Any] | None = None
) -> Any:
    op: Connection = world["operator"]
    job = op.execute(
        "insert into enrichment_jobs (user_id, allow_fallback, profile_snapshot) values (%s, %s, %s) returning id",
        (world["user"], allow_fallback, json.dumps(snapshot or {"target_countries": ["DE"]})),
    ).fetchone()
    assert job is not None
    for n in range(courses):
        slug = f"job-{uuid.uuid4().hex[:10]}"
        prog = op.execute(
            "insert into programs (institution_id, slug, title, level, published, official_url) "
            "values (%s, %s, %s, 'master', true, %s) returning id",
            (world["inst"], slug, f"MSc {n}", f"{HOST}/{slug}"),
        ).fetchone()
        assert prog is not None
        op.execute("insert into enrichment_items (job_id, program_id) values (%s, %s)", (job["id"], prog["id"]))
    op.commit()
    return job["id"]


def job_row(world: dict[str, Any], job: Any) -> dict[str, Any]:
    op: Connection = world["operator"]
    row = op.execute("select * from enrichment_jobs where id = %s", (job,)).fetchone()
    assert row is not None
    return row


def item_statuses(world: dict[str, Any], job: Any) -> list[str]:
    rows = world["operator"].execute("select status from enrichment_items where job_id = %s", (job,)).fetchall()
    return sorted(r["status"] for r in rows)


def run(world: dict[str, Any], worker: Connection, job: Any, **kw: Any) -> None:
    kw.setdefault("fetcher", PageFetcher())
    kw.setdefault("extractor", claude())
    kw.setdefault("client", None)
    kw.setdefault("sleep", lambda _s: None)
    run_job(worker, kw.pop("fetcher"), kw.pop("extractor"), kw.pop("client"), job, fresh_days=7, **kw)


def test_job_moves_through_stages_in_order(
    worker: Connection, world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[str] = []
    original = serve_mod.set_stage

    def record(conn: Connection, job: Any, stage: str) -> None:
        seen.append(stage)
        original(conn, job, stage)

    monkeypatch.setattr(serve_mod, "set_stage", record)
    job = make_job(world, 2)
    run(world, worker, job)
    assert seen == ["optimizing_profile", "selecting_universities", "fetching_details"]
    row = job_row(world, job)
    assert row["status"] == "done" and row["stage"] == "done" and row["finished_at"] is not None


def test_job_done_when_all_items_terminal(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 3)
    run(world, worker, job)
    assert item_statuses(world, job) == ["extracted"] * 3


def test_failed_item_does_not_fail_job(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 2)
    run(world, worker, job, fetcher=RefusingFetcher())
    assert job_row(world, job)["status"] == "done"
    assert item_statuses(world, job) == ["failed", "failed"]


def test_fewer_than_ten_without_consent_still_finishes(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 6, allow_fallback=False)
    client = FakeGenai(FakeGenaiResponse(json.dumps({"candidates": []})))
    run(world, worker, job, client=client)
    assert client.models.calls == []
    assert job_row(world, job)["status"] == "done" and len(item_statuses(world, job)) == 6


def test_fallback_runs_when_allowed_and_short(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 2, allow_fallback=True)
    domain = f"fallback-{world['tag']}.example.org"
    reply = {
        "candidates": [
            {
                "institution": f"Fallback U {world['tag']}",
                "programme": "MSc Fallback",
                "level": "master",
                "country": "DE",
                "url": f"https://www.{domain}/msc",
                "domain": domain,
            }
        ]
    }
    client = FakeGenai(FakeGenaiResponse(json.dumps(reply)))
    run(world, worker, job, client=client, verify_domain=lambda _i, _d: True)
    assert len(client.models.calls) == 1
    assert len(item_statuses(world, job)) == 3
    assert job_row(world, job)["status"] == "done"


def test_stale_running_job_is_reclaimed(worker: Connection, world: dict[str, Any]) -> None:
    op: Connection = world["operator"]
    stale = make_job(world, 1)
    live = make_job(world, 1)
    op.execute(
        "update enrichment_jobs set status = 'running', heartbeat_at = now() - interval '20 minutes' where id = %s",
        (stale,),
    )
    op.execute("update enrichment_jobs set status = 'running', heartbeat_at = now() where id = %s", (live,))
    op.commit()
    assert claim_job(worker) == stale
    assert claim_job(worker) is None


class RateLimitedOnce:
    """Fails the first call like a Gemini 429, then behaves like the real extractor."""

    version = "test/1"

    def __init__(self) -> None:
        self.calls = 0
        self.inner = claude()

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        self.calls += 1
        if self.calls == 1:
            return ExtractionRun(None, "test", PROMPT_VERSION, None, 0, 0, 0.0, 1, "rate_limited: HTTP 429: quota")
        return self.inner.extract(url, cycle_label, page_text)


def test_rate_limited_extraction_backs_off_and_retries(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 1)
    delays: list[float] = []
    extractor = RateLimitedOnce()
    run(world, worker, job, extractor=extractor, sleep=delays.append)
    assert delays == [5]
    assert item_statuses(world, job) == ["extracted"]
    assert extractor.calls == 2


class AlwaysFails:
    version = "test/1"

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        return ExtractionRun(None, "test", PROMPT_VERSION, None, 0, 0, 0.0, 1, "connection error: down")


def test_failed_extraction_is_retried_by_the_next_job_not_skipped(worker: Connection, world: dict[str, Any]) -> None:
    first = make_job(world, 1)
    run(world, worker, first, extractor=AlwaysFails())
    assert item_statuses(world, first) == ["failed"]
    # Same program, new student: the page must be read again, not treated as unchanged.
    program = (
        world["operator"].execute("select program_id from enrichment_items where job_id = %s", (first,)).fetchone()
    )
    second = (
        world["operator"]
        .execute("insert into enrichment_jobs (user_id) values (%s) returning id", (world["user"],))
        .fetchone()
    )
    world["operator"].execute(
        "insert into enrichment_items (job_id, program_id) values (%s, %s)", (second["id"], program["program_id"])
    )
    world["operator"].commit()
    run(world, worker, second["id"])
    assert item_statuses(world, second["id"]) == ["extracted"]


def test_waiting_item_gives_up_with_a_clear_message(worker: Connection, world: dict[str, Any]) -> None:
    job = make_job(world, 1)
    op: Connection = world["operator"]
    program = op.execute("select program_id from enrichment_items where job_id = %s", (job,)).fetchone()
    assert program is not None
    other = op.execute("insert into enrichment_jobs (user_id) values (%s) returning id", (world["user"],)).fetchone()
    assert other is not None
    op.execute(
        "insert into enrichment_items (job_id, program_id, status) values (%s, %s, 'running')",
        (other["id"], program["program_id"]),
    )
    op.commit()
    run(world, worker, job, wait_rounds=2)
    row = op.execute("select status, detail from enrichment_items where job_id = %s", (job,)).fetchone()
    assert row is not None
    assert row["status"] == "failed" and "still" in row["detail"]
    assert job_row(world, job)["status"] == "done"


def test_reclaimed_job_resumes_its_running_item(worker: Connection, world: dict[str, Any]) -> None:
    op: Connection = world["operator"]
    job = make_job(world, 1)
    op.execute("update enrichment_items set status = 'running' where job_id = %s", (job,))
    op.execute(
        "update enrichment_jobs set status = 'running', heartbeat_at = now() - interval '20 minutes' where id = %s",
        (job,),
    )
    op.commit()
    assert claim_job(worker) == job
    run(world, worker, job)
    assert item_statuses(world, job) == ["extracted"]


def test_a_dead_workers_item_does_not_block_the_course_for_other_students(
    worker: Connection, world: dict[str, Any]
) -> None:
    op: Connection = world["operator"]
    dead = make_job(world, 1)
    program = op.execute("select program_id from enrichment_items where job_id = %s", (dead,)).fetchone()
    assert program is not None
    op.execute("update enrichment_items set status = 'running' where job_id = %s", (dead,))
    op.execute(
        "update enrichment_jobs set status = 'running', heartbeat_at = now() - interval '20 minutes' where id = %s",
        (dead,),
    )
    later = op.execute("insert into enrichment_jobs (user_id) values (%s) returning id", (world["user"],)).fetchone()
    assert later is not None
    op.execute(
        "insert into enrichment_items (job_id, program_id) values (%s, %s)", (later["id"], program["program_id"])
    )
    op.commit()
    # The stale job is the oldest, so it is claimed and resumed first; afterwards the course is free.
    first = claim_job(worker)
    assert first == dead
    run(world, worker, first)
    assert claim_job(worker) == later["id"]
    run(world, worker, later["id"])
    assert item_statuses(world, later["id"]) == ["skipped_fresh"]
