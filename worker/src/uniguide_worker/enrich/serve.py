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
from .candidates import create_from_candidates, propose_candidates
from .jobs import process_item

TARGET_COURSES = 10
STALE_AFTER = "15 minutes"
MAX_RETRIES = 4


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
) -> str:
    delay = 5.0
    status = process_item(conn, fetcher, extractor, item_id, fresh_days=fresh_days)
    for _ in range(MAX_RETRIES):
        if status != "failed":
            break
        row = conn.execute("select detail from enrichment_items where id = %s", (item_id,)).fetchone()
        if not row or "rate_limited" not in (row["detail"] or ""):
            break
        sleep(delay)
        delay = min(delay * 2, 60.0)
        status = process_item(conn, fetcher, extractor, item_id, fresh_days=fresh_days)
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
) -> None:
    try:
        job = conn.execute("select * from enrichment_jobs where id = %s", (job_id,)).fetchone()
        assert job is not None
        set_stage(conn, job_id, "optimizing_profile")
        set_stage(conn, job_id, "selecting_universities")
        have = conn.execute("select count(*) as n from enrichment_items where job_id = %s", (job_id,)).fetchone()
        assert have is not None
        if client is not None and job["allow_fallback"] and have["n"] < TARGET_COURSES:
            found = propose_candidates(client, model, job["profile_snapshot"], TARGET_COURSES - have["n"])
            for program_id in create_from_candidates(conn, found):
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
                if _process_with_backoff(conn, fetcher, extractor, item_id, fresh_days, sleep) == "waiting":
                    waiting += 1
                _heartbeat(conn, job_id)
            if not waiting:
                break
            sleep(wait_seconds)
        conn.execute(
            """
            update enrichment_items set status = 'failed', finished_at = now(),
              detail = 'Another search is still reading this course. Try again in a minute.'
            where job_id = %s and status in ('pending', 'waiting')
            """,
            (job_id,),
        )
        conn.execute(
            "update enrichment_jobs set status = 'done', stage = 'done', finished_at = now() where id = %s", (job_id,)
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.execute(
            "update enrichment_jobs set status = 'failed', error = %s, finished_at = now() where id = %s",
            (f"{type(exc).__name__}: {exc}"[:500], job_id),
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
    while True:
        try:
            with connect(settings.worker_database_url) as conn:
                while True:
                    job_id = claim_job(conn)
                    if job_id is None:
                        time.sleep(poll_seconds)
                        continue
                    run_job(
                        conn, fetcher, extractor, client, job_id, fresh_days=settings.enrich_fresh_days, model=model
                    )
        except Exception as exc:  # keep serving through database restarts
            print(f"enrichment worker: {type(exc).__name__}: {exc}; reconnecting")
            time.sleep(poll_seconds * 3)
