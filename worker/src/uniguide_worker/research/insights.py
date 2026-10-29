"""Public trend insights from consented, de-identified outcomes. Groups under the suppression size are not published."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from ..db import Connection
from .outcomes import DEFAULT_MIN_N


@dataclass(frozen=True)
class Insight:
    metric: str
    dimension: dict[str, str]
    value: float
    group_size: int


def compute_insights(rows: list[dict[str, Any]], min_n: int = DEFAULT_MIN_N) -> list[Insight]:
    """Share of decided applicants admitted, by destination country, for countries with at least min_n decided outcomes."""
    by_country: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by_country[r["country"]].append(r)
    out = []
    for country, rs in sorted(by_country.items()):
        decided = [r for r in rs if r["decision"] in ("admitted", "rejected")]
        # The share rests on decided outcomes, so that is the group that must be large enough to publish.
        if len(decided) < min_n:
            continue
        share = sum(r["decision"] == "admitted" for r in decided) / len(decided)
        # Rounded to the nearest 5%, so weekly changes cannot reveal a single new result.
        out.append(Insight("admit_share", {"country": country}, round(round(share * 20) / 20, 2), len(decided)))
    return out


def publish_insights(conn: Connection, insights: list[Insight]) -> int:
    """Replace the published insights (runs as the analyst role)."""
    conn.execute("delete from public_insights")
    for i in insights:
        conn.execute(
            "insert into public_insights (metric, dimension, value, group_size) values (%s, %s::jsonb, %s, %s)",
            (i.metric, json.dumps(i.dimension), i.value, i.group_size),
        )
    conn.commit()
    return len(insights)
