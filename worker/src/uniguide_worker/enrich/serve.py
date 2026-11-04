"""The enrichment worker: claim queued jobs and run them stage by stage while the student watches."""

from __future__ import annotations

import time
from collections.abc import Callable
from uuid import UUID

from ..config import get_settings
from ..db import Connection, connect
from ..extract.base import PageExtractor
from ..extract.factory import make_extractor
from ..extract.gemini import DEFAULT_MODEL, GeminiExtractor
from ..fetch.fetcher import Fetcher
from ..index.factory import make_lister
from ..index.lister import CourseLister
from .candidates import create_from_candidates, propose_candidates
from .discover import discover, real_courses
from .jobs import process_item

TARGET_COURSES = 10
STALE_AFTER = "20 minutes"
MAX_RETRIES = 4
COURSES_PER_UNIVERSITY = 3
TIME_BUDGET_SECONDS = 45 * 60
DISCOVERY_SECONDS = 6 * 60
WAIT_ROUNDS = 6


def claim_job(conn: Connection) -> UUID | None:
    """Take the oldest queued job, or one whose worker stopped heartbeating, without blocking other workers."""
    row = conn.execute(
        f"""
        update enrichment_jobs set status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now()
        where id = (
          select id from enrichment_jobs
          where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '{STALE_AFTER}')
          order by created_at limit 1 for update skip locked
        )
        returning id
        """
    ).fetchone()
    conn.commit()
    return row["id"] if row else None


def set_stage(conn: Connection, job_id: UUID, stage: str) -> None:
    conn.execute("update enrichment_jobs set stage = %s, heartbeat_at = now() where id = %s", (stage, job_id))
    conn.commit()


def _heartbeat(conn: Connection, job_id: UUID) -> None:
    conn.execute("update enrichment_jobs set heartbeat_at = now() where id = %s", (job_id,))
    conn.commit()


def _open_items(conn: Connection, job_id: UUID) -> list[UUID]:
    rows = conn.execute(
        "select id from enrichment_items where job_id = %s and status in ('pending', 'waiting') order by id", (job_id,)
    ).fetchall()
    return [r["id"] for r in rows]


def _process_with_backoff(
    conn: Connection,
    fetcher: Fetcher,
    extractor: PageExtractor,
    item_id: UUID,
    fresh_days: int,
    sleep: Callable[[float], None],
    heartbeat: Callable[[], None],
) -> str:
    delay = 5.0
    status = process_item(conn, fetcher, extractor, item_id, fresh_days=fresh_days, heartbeat=heartbeat)
    for _ in range(MAX_RETRIES):
        if status != "failed":
            break
        row = conn.execute("select detail from enrichment_items where id = %s", (item_id,)).fetchone()
        if not row or "rate_limited" not in (row["detail"] or ""):
            break
        sleep(delay)
        delay = min(delay * 2, 60.0)
        status = process_item(conn, fetcher, extractor, item_id, fresh_days=fresh_days, heartbeat=heartbeat)
    return status


def run_job(
    conn: Connection,
    fetcher: Fetcher,
    extractor: PageExtractor,
    client: object | None,
    job_id: UUID,
    *,
    fresh_days: int,
    model: str = DEFAULT_MODEL,
    sleep: Callable[[float], None] = time.sleep,
    wait_rounds: int = 30,
    wait_seconds: float = 10.0,
    verify_domain: Callable[[str, str], bool] | None = None,
    lister: CourseLister | None = None,
) -> None:
    try:
        job = conn.execute("select * from enrichment_jobs where id = %s", (job_id,)).fetchone()
        assert job is not None
        queued = conn.execute("select 1 from enrichment_candidates where job_id = %s limit 1", (job_id,)).fetchone()
        if queued:
            run_candidates(conn, fetcher, extractor, lister, job_id, fresh_days=fresh_days, sleep=sleep)
            return
        # A worker that died mid-course left its item "running", which would block the course for everyone.
        conn.execute(
            "update enrichment_items set status = 'pending' where job_id = %s and status = 'running'", (job_id,)
        )
        conn.commit()
        set_stage(conn, job_id, "optimizing_profile")
        set_stage(conn, job_id, "selecting_universities")
        have = conn.execute("select count(*) as n from enrichment_items where job_id = %s", (job_id,)).fetchone()
        assert have is not None
        if client is not None and job["allow_fallback"] and have["n"] < TARGET_COURSES:
            found = propose_candidates(client, model, job["profile_snapshot"], TARGET_COURSES - have["n"])
            for program_id in create_from_candidates(conn, found, verify_domain=verify_domain):
                conn.execute(
                    "insert into enrichment_items (job_id, program_id) values (%s, %s) on conflict do nothing",
                    (job_id, program_id),
                )
            conn.commit()
        set_stage(conn, job_id, "fetching_details")
        for _ in range(wait_rounds):
            items = _open_items(conn, job_id)
            if not items:
                break
            waiting = 0
            for item_id in items:
                beat = lambda: _heartbeat(conn, job_id)  # noqa: E731
                if _process_with_backoff(conn, fetcher, extractor, item_id, fresh_days, sleep, beat) == "waiting":
                    waiting += 1
                _heartbeat(conn, job_id)
            if not waiting:
                break
            sleep(wait_seconds)
        conn.execute(
            """
            update enrichment_items set status = 'failed', finished_at = now(),
              detail = 'Another search is still reading this course. Try again in a minute.'
            where job_id = %s and status in ('pending', 'waiting', 'running')
            """,
            (job_id,),
        )
        conn.execute(
            "update enrichment_jobs set status = 'done', stage = 'done', finished_at = now() where id = %s", (job_id,)
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        # Never leave an item "running": it would hold the course and block every later search.
        conn.execute(
            "update enrichment_items set status = 'failed', detail = 'The search stopped early.', finished_at = now() "
            "where job_id = %s and status = 'running'",
            (job_id,),
        )
        conn.execute(
            "update enrichment_jobs set status = 'failed', error = %s, finished_at = now() where id = %s",
            (f"{type(exc).__name__}: {exc}"[:500], job_id),
        )
        conn.commit()


def _read_courses(
    conn: Connection,
    fetcher: Fetcher,
    extractor: PageExtractor,
    job_id: UUID,
    candidate_id: UUID,
    program_ids: list[UUID],
    fresh_days: int,
    sleep: Callable[[float], None],
) -> int:
    """Read each course and return how many end complete; the others are marked incomplete or failed."""
    complete = 0
    for program_id in program_ids:
        conn.execute(
            "insert into enrichment_items (job_id, program_id, candidate_id) values (%s, %s, %s) "
            "on conflict (job_id, program_id) do update set candidate_id = excluded.candidate_id",
            (job_id, program_id, candidate_id),
        )
        row = conn.execute(
            "select id from enrichment_items where job_id = %s and program_id = %s", (job_id, program_id)
        ).fetchone()
        conn.commit()
        assert row is not None
        item_id = row["id"]
        beat = lambda: _heartbeat(conn, job_id)  # noqa: E731
        status = _process_with_backoff(conn, fetcher, extractor, item_id, fresh_days, sleep, beat)
        for _ in range(WAIT_ROUNDS):
            if status != "waiting":
                break
            sleep(10.0)
            status = process_item(conn, fetcher, extractor, item_id, fresh_days=fresh_days, heartbeat=beat)
        if status in ("extracted", "skipped_fresh"):
            done = conn.execute("select public.course_is_complete(%s) as ok", (program_id,)).fetchone()
            if done is not None and done["ok"]:
                complete += 1
            else:
                conn.execute(
                    "update enrichment_items set status = 'incomplete', finished_at = now(), "
                    "detail = 'A deadline, a cost or a requirement is missing.' where id = %s",
                    (item_id,),
                )
        elif status == "waiting":
            conn.execute(
                "update enrichment_items set status = 'failed', finished_at = now(), "
                "detail = 'Another search is still reading this course.' where id = %s",
                (item_id,),
            )
        conn.commit()
    return complete


def _close_candidate(conn: Connection, candidate_id: UUID, kept: bool, courses: int, reason: str | None) -> None:
    conn.execute(
        "update enrichment_candidates set status = %s, courses = %s, reason = %s, finished_at = now() where id = %s",
        ("kept" if kept else "skipped", courses, reason, candidate_id),
    )
    conn.commit()


def run_candidates(
    conn: Connection,
    fetcher: Fetcher,
    extractor: PageExtractor,
    lister: CourseLister | None,
    job_id: UUID,
    *,
    fresh_days: int,
    budget_seconds: float = TIME_BUDGET_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    now: Callable[[], float] = time.monotonic,
) -> None:
    """Try the job's universities in order until enough complete courses are kept, then finish the job."""
    job = conn.execute("select * from enrichment_jobs where id = %s", (job_id,)).fetchone()
    assert job is not None
    snapshot = job["profile_snapshot"] or {}
    fields, levels = list(snapshot.get("target_fields") or []), list(snapshot.get("target_levels") or [])
    target, max_tries = job["target_complete"], job["max_tries"]
    tried, kept = job["tried"], job["kept"]
    # A worker that died mid-course left its item "running", which would block the course for everyone.
    conn.execute("update enrichment_items set status = 'pending' where job_id = %s and status = 'running'", (job_id,))
    conn.commit()
    set_stage(conn, job_id, "optimizing_profile")
    set_stage(conn, job_id, "selecting_universities")
    set_stage(conn, job_id, "fetching_details")
    start = now()
    while kept < target and tried < max_tries and now() - start <= budget_seconds:
        cand = conn.execute(
            """
            select c.id, c.institution_id, i.official_domain from enrichment_candidates c
            join institutions i on i.id = c.institution_id
            where c.job_id = %s and c.status in ('pending', 'running') order by c.position limit 1
            """,
            (job_id,),
        ).fetchone()
        if cand is None:
            break
        conn.execute(
            "update enrichment_candidates set status = 'running', started_at = coalesce(started_at, now()) "
            "where id = %s",
            (cand["id"],),
        )
        conn.commit()
        try:
            courses = real_courses(conn, cand["institution_id"], fields, levels, COURSES_PER_UNIVERSITY)
            reason: str | None = None
            if not courses:
                if not cand["official_domain"]:
                    reason = "No website is known for this university."
                elif lister is None:
                    reason = "No model is set up to look for this university's course list."
                else:
                    found = discover(
                        conn,
                        fetcher,
                        lister,
                        cand["institution_id"],
                        cand["official_domain"],
                        fields,
                        levels,
                        deadline=time.monotonic() + DISCOVERY_SECONDS,
                        heartbeat=lambda: _heartbeat(conn, job_id),
                    )
                    courses = real_courses(conn, cand["institution_id"], fields, levels, COURSES_PER_UNIVERSITY)
                    if not courses:
                        reason = found.reason if found.status != "found" else "No course in your subject and level."
                        if found.status == "blocked":
                            reason = f"Access refused: {found.reason}"
            complete = 0
            if courses:
                complete = _read_courses(
                    conn, fetcher, extractor, job_id, cand["id"], courses[: max(1, target - kept)], fresh_days, sleep
                )
                if not complete:
                    reason = "A deadline, a cost or a requirement was missing on every course."
            _close_candidate(conn, cand["id"], complete > 0, complete, None if complete else reason)
            kept += complete
        except Exception as exc:  # one broken university must not stop the search
            conn.rollback()
            reason = f"{type(exc).__name__} while looking at this university."
            _close_candidate(conn, cand["id"], False, 0, reason)
        tried += 1
        conn.execute(
            "update enrichment_jobs set tried = %s, kept = %s, heartbeat_at = now() where id = %s",
            (tried, kept, job_id),
        )
        conn.commit()
    conn.execute(
        """
        update enrichment_items set status = 'failed', finished_at = now(),
          detail = 'The search ended before this course was read.'
        where job_id = %s and status in ('pending', 'waiting', 'running')
        """,
        (job_id,),
    )
    conn.execute(
        "update enrichment_jobs set status = 'done', stage = 'done', finished_at = now() where id = %s", (job_id,)
    )
    conn.commit()


def serve(poll_seconds: float = 3.0) -> None:
    """Run until stopped: claim a job, run it, repeat; reconnect after a database error."""
    settings = get_settings()
    if not settings.worker_database_url:
        raise RuntimeError("Set WORKER_DATABASE_URL (see .env.example)")
    fetcher = Fetcher(settings.user_agent)
    extractor = make_extractor(settings)
    client = extractor.client if isinstance(extractor, GeminiExtractor) else None
    model = extractor.model if isinstance(extractor, GeminiExtractor) else DEFAULT_MODEL
    try:
        lister: CourseLister | None = make_lister(settings)
    except ValueError:  # no model for course lists is configured: universities with no known page are skipped
        lister = None
    while True:
        try:
            with connect(settings.worker_database_url) as conn:
                while True:
                    job_id = claim_job(conn)
                    if job_id is None:
                        time.sleep(poll_seconds)
                        continue
                    run_job(
                        conn,
                        fetcher,
                        extractor,
                        client,
                        job_id,
                        fresh_days=settings.enrich_fresh_days,
                        model=model,
                        lister=lister,
                    )
        except Exception as exc:  # keep serving through database restarts
            print(f"enrichment worker: {type(exc).__name__}: {exc}; reconnecting")
            time.sleep(poll_seconds * 3)
