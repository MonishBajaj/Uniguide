"""Outcome analytics over consented, de-identified outcomes (the research_outcomes view).

Small groups are suppressed: a course with fewer than `min_n` shared outcomes is counted but
never reported on its own, so no one's result can be singled out.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from ..db import Connection

DEFAULT_MIN_N = 10


@dataclass
class OutcomeReport:
    total: int = 0
    by_decision: dict[str, int] = field(default_factory=dict)
    by_country: list[dict[str, Any]] = field(default_factory=list)
    programs: list[dict[str, Any]] = field(default_factory=list)
    suppressed_programs: int = 0
    min_n: int = DEFAULT_MIN_N

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__


def _summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = Counter(r["decision"] for r in rows)
    decided = decisions["admitted"] + decisions["rejected"]
    funded = [r for r in rows if r["decision"] == "admitted" and r["funding_offered"] is not None]
    return {
        "n": len(rows),
        "admitted_share": round(decisions["admitted"] / decided, 3) if decided else None,
        "waitlisted": decisions["waitlisted"],
        "funded_share_of_admits": round(sum(r["funding_offered"] for r in funded) / len(funded), 3) if funded else None,
        "self_reported_share": round(sum(r["verification_level"] == "self_reported" for r in rows) / len(rows), 3),
    }


def build_report(rows: list[dict[str, Any]], min_n: int = DEFAULT_MIN_N) -> OutcomeReport:
    report = OutcomeReport(total=len(rows), by_decision=dict(Counter(r["decision"] for r in rows)), min_n=min_n)
    by_country: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_program: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by_country[r["country"]].append(r)
        by_program[str(r["program_id"])].append(r)
    report.by_country = [{"country": c, **_summary(rs)} for c, rs in sorted(by_country.items()) if len(rs) >= min_n]
    for program_id, rs in sorted(by_program.items(), key=lambda kv: -len(kv[1])):
        if len(rs) < min_n:
            report.suppressed_programs += 1
            continue
        report.programs.append({"program_id": program_id, **_summary(rs)})
    return report


def load_rows(conn: Connection) -> list[dict[str, Any]]:
    return conn.execute(
        """
        select program_id, country, cycle_label, intake_year, decision::text as decision, funding_offered,
               verification_level, residence_country, home_qualification, grade_value, grade_scale
        from research_outcomes
        """
    ).fetchall()
