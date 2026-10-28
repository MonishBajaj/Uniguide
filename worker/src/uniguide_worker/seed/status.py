"""Coverage of the hand-verified seed: how many real courses, where, and which deadlines need re-checking."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class StaleFact:
    path: Path
    slug: str
    cycle: str
    verified_at: date


@dataclass(frozen=True)
class SeedStatus:
    total: int
    target: int
    by_country: dict[str, int]
    stale: list[StaleFact]


def seed_status(
    docs: list[tuple[Path, dict[str, Any]]], today: date, *, stale_days: int = 30, target: int = 50
) -> SeedStatus:
    real = [(path, doc) for path, doc in docs if not doc.get("placeholder")]
    by_country = Counter(doc["institution"]["country"] for _, doc in real)
    stale: list[StaleFact] = []
    for path, doc in real:
        for cycle in doc["cycles"]:
            for fact in cycle["facts"]:
                if fact["subject"] != "deadline":
                    continue
                checked = max(
                    date.fromisoformat(str(d)) for d in (fact["verified_at"], fact.get("second_checked_at")) if d
                )
                if (today - checked).days > stale_days:
                    stale.append(StaleFact(path, doc["program"]["slug"], cycle["label"], checked))
    return SeedStatus(len(real), target, dict(sorted(by_country.items())), stale)
