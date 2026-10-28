"""Postgres access. The worker connects as the ingest_worker role; the seed loader as postgres."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

Connection = psycopg.Connection[dict[str, Any]]


def connect(url: str) -> Connection:
    # prepare_threshold=None keeps the connection usable through Supavisor's transaction pooler.
    return psycopg.connect(url, row_factory=dict_row, prepare_threshold=None, autocommit=False)


def is_local(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return host in {"localhost", "127.0.0.1", "::1", "host.docker.internal"} or host.startswith("supabase_db_")
