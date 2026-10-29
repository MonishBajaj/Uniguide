"""The CLI's job wrapper records a run for every kind of result a job returns."""

from __future__ import annotations

import os

import pytest

from uniguide_worker.cli import _with_run
from uniguide_worker.db import Connection

from .conftest import LOCAL_WORKER


def test_a_job_that_returns_a_dict_is_recorded_as_succeeded(
    worker: Connection, operator: Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WORKER_DATABASE_URL", os.environ.get("WORKER_DATABASE_URL", LOCAL_WORKER))
    result = _with_run("test-dict-result", lambda conn: {"indexes": 2, "created": 5})
    assert result == {"indexes": 2, "created": 5}
    try:
        row = operator.execute(
            "select status, stats from ingest_runs where job = 'test-dict-result' order by started_at desc limit 1"
        ).fetchone()
        assert row == {"status": "succeeded", "stats": {"indexes": 2, "created": 5}}
    finally:
        operator.execute("delete from ingest_runs where job = 'test-dict-result'")
        operator.commit()
