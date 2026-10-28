import math
import random
from typing import Any

from uniguide_worker.research import admission
from uniguide_worker.research.outcomes import build_report


def synthetic(n: int, seed: int = 7) -> list[dict[str, Any]]:
    """Outcomes where a better grade (on either scale) and a less selective course raise the odds."""
    rng = random.Random(seed)
    programs = [(f"p{i}", "GB" if i % 2 else "DE", rng.gauss(0, 1.0)) for i in range(12)]
    rows = []
    for _ in range(n):
        pid, country, offset = rng.choice(programs)
        z = rng.gauss(0, 1)
        if rng.random() < 0.5:
            grade, scale = 7.5 + 1.0 * z, "gpa_10"
        else:
            grade, scale = 2.3 - 0.5 * z, "german_1_5"  # lower is better
        p = 1 / (1 + math.exp(-(-0.2 + 1.5 * z + offset)))
        rows.append(
            {
                "program_id": pid, "country": country, "intake_year": rng.choice([2024, 2025, 2026]),
                "decision": "admitted" if rng.random() < p else "rejected", "grade_value": grade,
                "grade_scale": scale, "funding_offered": None, "verification_level": "self_reported",
            }
        )  # fmt: skip
    return rows


def test_model_learns_grade_direction_per_scale_and_passes_gate() -> None:
    ev = admission.evaluate(synthetic(3000))
    assert ev is not None and ev.fit is not None
    assert ev.holdout_year == 2026 and ev.trained_through == 2025
    assert ev.fit.slopes["grade"] > 1.0
    assert ev.fit.scales["german_1_5"]["direction"] == -1.0
    assert ev.brier < ev.brier_baseline
    assert ev.passed, ev.reasons


def test_thin_data_fails_the_gate() -> None:
    ev = admission.evaluate(synthetic(120))
    assert ev is not None and not ev.passed
    assert any("training outcomes" in r for r in ev.reasons)


def test_one_intake_year_cannot_be_evaluated() -> None:
    rows = [dict(r, intake_year=2026) for r in synthetic(200)]
    assert admission.evaluate(rows) is None


def test_unknown_scale_counts_as_missing_not_converted() -> None:
    scales = {"gpa_10": {"mean": 7.5, "sd": 1.0, "direction": 1.0}}
    assert admission.grade_feature(85, "percent", scales) == (0.0, 1.0)
    assert admission.grade_feature(8.5, "gpa_10", scales) == (1.0, 0.0)


def test_partial_pooling_shrinks_thin_courses() -> None:
    rows = synthetic(2000)
    rows += [
        {"program_id": "tiny", "country": "GB", "intake_year": 2025, "decision": "admitted", "grade_value": 6.0,
         "grade_scale": "gpa_10", "funding_offered": None, "verification_level": "self_reported"}
    ] * 2  # fmt: skip
    model = admission.fit(rows)
    assert abs(model.program["tiny"]["offset"]) < 1.0


def test_report_suppresses_small_groups() -> None:
    rows = synthetic(300)
    rows.append(dict(rows[0], program_id="lonely"))
    report = build_report(rows, min_n=10)
    assert report.suppressed_programs >= 1
    assert all(p["n"] >= 10 for p in report.programs)
    assert "lonely" not in {p["program_id"] for p in report.programs}


def test_predictions_match_the_shared_fixture() -> None:
    import json
    from pathlib import Path

    data = json.loads((Path(__file__).parents[2] / "data/fixtures/admission-model.json").read_text())
    p = data["params"]
    model = admission.Fit(p["intercept"], p["slopes"], p["scales"], p["country"], p["program"])
    for case in data["cases"]:
        if case["expected"] is None:
            assert case["program_id"] not in p["program"]
            continue
        assert round(admission.predict(model, case), 4) == case["expected"]
