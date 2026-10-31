"""What the worker's emails read from the stored journey (journey M4, J4.3).

Stage text comes from journey_stages.json, a copy of the TypeScript engine's STAGES that a vitest test keeps
identical, so the emails and the web app name stages the same way.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from importlib.resources import files
from typing import Any

STAGES: dict[str, dict[str, str]] = json.loads(files(__package__).joinpath("journey_stages.json").read_text("utf-8"))

# A journey older than this isn't trusted to drive an email; the student gets the older digest instead.
FRESH_DAYS = 8


def is_fresh(computed_at: datetime | None, now: datetime) -> bool:
    return computed_at is not None and now - computed_at <= timedelta(days=FRESH_DAYS)


def stage_name(stage: int) -> str:
    return STAGES[str(stage)]["name"]


def parent_note(stage: int, student: str) -> str:
    return STAGES[str(stage)]["parentNote"].replace("{name}", student)


def parent_safe_titles(steps: list[dict[str, Any]], limit: int = 5) -> list[str]:
    """Only steps with a parent title, and only that title: never a step's own title, reason or date."""
    return [s["parentTitle"] for s in steps if s.get("parentTitle")][:limit]
