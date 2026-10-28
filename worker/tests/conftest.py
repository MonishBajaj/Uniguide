from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import psycopg
import pytest

from uniguide_worker.db import Connection, connect

LOCAL_OPERATOR = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
LOCAL_WORKER = "postgresql://ingest_worker:ingest_worker_local@127.0.0.1:54322/postgres"


def _reachable(url: str) -> bool:
    try:
        with psycopg.connect(url, connect_timeout=2):
            return True
    except psycopg.Error:
        return False


@pytest.fixture(scope="session")
def operator_url() -> str:
    url = os.environ.get("OPERATOR_DATABASE_URL", LOCAL_OPERATOR)
    if not _reachable(url):
        pytest.skip("local Supabase database not running (pnpm db:start)")
    return url


@pytest.fixture
def operator(operator_url: str) -> Iterator[Connection]:
    with connect(operator_url) as conn:
        yield conn
        conn.rollback()


@pytest.fixture
def worker(operator_url: str) -> Iterator[Connection]:
    url = os.environ.get("WORKER_DATABASE_URL", LOCAL_WORKER)
    if not _reachable(url):
        pytest.skip("ingest_worker login not configured (supabase/seed.sql sets it locally)")
    with connect(url) as conn:
        yield conn
        conn.rollback()


class FakeUsage:
    def __init__(self, input_tokens: int = 1000, output_tokens: int = 200) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class FakeResponse:
    def __init__(self, parsed: Any, stop_reason: str = "end_turn") -> None:
        self.parsed_output = parsed
        self.stop_reason = stop_reason
        self.usage = FakeUsage()


class FakeMessages:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> FakeResponse:
        self.calls.append(kwargs)
        return self.response


class FakeAnthropic:
    """Stands in for anthropic.Anthropic in offline tests."""

    def __init__(self, response: FakeResponse) -> None:
        self.messages = FakeMessages(response)
