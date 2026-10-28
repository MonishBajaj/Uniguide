"""Score proposals from one page against human labels."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from uniguide_worker.proposals import Proposal


@dataclass
class Score:
    deadlines_expected: int = 0
    deadlines_matched: int = 0
    fees_expected: int = 0
    fees_matched: int = 0
    false_publications: list[str] = field(default_factory=list)

    def add(self, other: Score) -> Score:
        return Score(
            self.deadlines_expected + other.deadlines_expected,
            self.deadlines_matched + other.deadlines_matched,
            self.fees_expected + other.fees_expected,
            self.fees_matched + other.fees_matched,
            self.false_publications + other.false_publications,
        )

    @property
    def deadline_exact_match(self) -> float:
        return self.deadlines_matched / self.deadlines_expected if self.deadlines_expected else 1.0

    @property
    def fee_exact_match(self) -> float:
        return self.fees_matched / self.fees_expected if self.fees_expected else 1.0


def _deadline_key(p: dict[str, Any]) -> tuple[str, str]:
    return (str(p["due_at"])[:10], p.get("kind", "application"))


def _fee_key(p: dict[str, Any]) -> tuple[str, str, float, str]:
    return (p["kind"], p["basis"], float(p["base"]), p["currency"])


def score(proposals: list[Proposal], labels: dict[str, Any]) -> Score:
    published = [p for p in proposals if not p.has_errors]
    expected_deadlines = {(str(d["date"]), d.get("kind", "application")) for d in labels.get("deadlines", [])}
    expected_fees = {
        (f["kind"], f["basis"], float(f.get("base", f.get("amount"))), f["currency"]) for f in labels.get("fees", [])
    }
    got_deadlines = {_deadline_key(p.proposed) for p in published if p.subject == "deadline"}
    got_fees = {_fee_key(p.proposed) for p in published if p.subject == "cost_item"}
    return Score(
        deadlines_expected=len(expected_deadlines),
        deadlines_matched=len(expected_deadlines & got_deadlines),
        fees_expected=len(expected_fees),
        fees_matched=len(expected_fees & got_fees),
        false_publications=[f"deadline {d}" for d in got_deadlines - expected_deadlines]
        + [f"fee {f}" for f in got_fees - expected_fees],
    )
