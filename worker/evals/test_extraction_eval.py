"""Extraction eval: score proposals against hand labels. Offline by default, live with -m live."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml

from uniguide_worker.extract.extractor import Extractor
from uniguide_worker.extract.schema import PageExtraction
from uniguide_worker.fetch.fetcher import html_to_text
from uniguide_worker.proposals import Proposal, from_extraction
from uniguide_worker.validate.checks import CycleInfo, check_cycle

from .metrics import Score, score

FIXTURES = Path(__file__).parent / "fixtures"
CASES = sorted(p.name for p in FIXTURES.iterdir() if p.is_dir())


def load_case(name: str) -> tuple[str, dict[str, Any], CycleInfo]:
    folder = FIXTURES / name
    labels = yaml.safe_load((folder / "labels.yaml").read_text())
    c = labels["cycle"]
    starts_on = c.get("starts_on")
    cycle = CycleInfo(c["label"], c["intake_year"], starts_on if isinstance(starts_on, date) else None)
    return html_to_text((folder / "page.html").read_text()), labels, cycle


def proposals_for(extraction: PageExtraction, page: str, labels: dict[str, Any], cycle: CycleInfo) -> list[Proposal]:
    proposals = from_extraction(extraction, cycle, labels["country"], page)
    cycle_issues = check_cycle(extraction.effective_intake_year, cycle)
    for p in proposals:
        p.issues += cycle_issues
    return proposals


def recorded(name: str) -> PageExtraction:
    return PageExtraction.model_validate_json((FIXTURES / name / "recorded_response.json").read_text())


def assert_gates(total: Score) -> None:
    assert total.false_publications == [], f"would publish facts that match no label: {total.false_publications}"
    assert total.deadline_exact_match >= 0.95, f"deadline exact match {total.deadline_exact_match:.0%}"
    assert total.fee_exact_match >= 0.95, f"fee exact match {total.fee_exact_match:.0%}"


@pytest.mark.parametrize("case", CASES)
def test_recorded_case(case: str) -> None:
    page, labels, cycle = load_case(case)
    result = score(proposals_for(recorded(case), page, labels, cycle), labels)
    assert_gates(result)


def test_injected_and_invented_facts_never_publish() -> None:
    page, labels, cycle = load_case("prompt_injection")
    proposals = proposals_for(recorded("prompt_injection"), page, labels, cycle)
    blocked = {p.proposed.get("due_at", "")[:10] or str(p.proposed.get("base")) for p in proposals if p.has_errors}
    # The hidden-text deadline is outside the cycle window; the invented ones have no quote on the page.
    assert {"2099-03-01", "2027-03-01", "0.0"} <= blocked


def test_offline_suite_meets_gates() -> None:
    total = Score()
    for case in CASES:
        page, labels, cycle = load_case(case)
        total = total.add(score(proposals_for(recorded(case), page, labels, cycle), labels))
    assert_gates(total)


@pytest.mark.live
def test_live_suite_meets_gates() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")
    extractor = Extractor()
    total = Score()
    report = {}
    for case in CASES:
        page, labels, cycle = load_case(case)
        run = extractor.extract(f"https://{case}.example.org", cycle.label, page)
        assert run.extraction is not None, f"{case}: {run.error}"
        result = score(proposals_for(run.extraction, page, labels, cycle), labels)
        report[case] = {
            "cost_usd": run.cost_usd,
            "deadlines": result.deadline_exact_match,
            "fees": result.fee_exact_match,
        }
        total = total.add(result)
    print(json.dumps(report, indent=2))
    assert_gates(total)
