"""Attach ROR identifiers to institutions using ROR's affiliation matcher (CC0 data).

Only matches ROR marks as `chosen` (its own high-confidence pick) in the same country are
accepted; everything else is left for a person.
"""

from __future__ import annotations

from typing import Any

import httpx

from ..db import Connection
from ..fetch.ratelimit import HostRateLimiter
from .base import ImportStats

API = "https://api.ror.org/v2/organizations"


def best_match(payload: dict[str, Any], country: str) -> str | None:
    for item in payload.get("items", []):
        org = item.get("organization", {})
        countries = {(loc.get("geonames_details") or {}).get("country_code") for loc in org.get("locations", [])}
        if item.get("chosen") and country in countries:
            return str(org["id"])
    return None


def run(
    conn: Connection,
    *,
    user_agent: str,
    country: str | None = None,
    limit: int = 200,
    client: httpx.Client | None = None,
) -> ImportStats:
    client = client or httpx.Client(timeout=30.0)
    limiter = HostRateLimiter(min_interval=1.0)  # ROR asks for at most 2,000 requests per 5 minutes
    stats = ImportStats()
    rows = conn.execute(
        """
        select id, name, country from institutions
        where ror_id is null and (%s::text is null or country = %s)
        order by name limit %s
        """,
        (country, country, limit),
    ).fetchall()
    for row in rows:
        limiter.wait("api.ror.org")
        response = client.get(API, params={"affiliation": row["name"]}, headers={"User-Agent": user_agent})
        if response.status_code != 200:
            stats.notes.append(f"{row['name']}: HTTP {response.status_code}")
            continue
        ror_id = best_match(response.json(), row["country"])
        if ror_id is None:
            stats.skipped += 1
            continue
        taken = conn.execute("select 1 from institutions where ror_id = %s", (ror_id,)).fetchone()
        if taken:
            stats.notes.append(f"{row['name']}: {ror_id} already used by another institution")
            continue
        conn.execute("update institutions set ror_id = %s where id = %s", (ror_id, row["id"]))
        stats.institutions += 1
    conn.commit()
    return stats
