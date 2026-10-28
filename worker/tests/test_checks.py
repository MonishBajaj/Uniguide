from datetime import UTC, date, datetime

from uniguide_worker.validate.checks import (
    CycleInfo,
    check_changed,
    check_cost,
    check_cycle,
    check_deadline,
    check_score,
    check_timezone,
)

CYCLE = CycleInfo("2027-fall", 2027, date(2027, 8, 23))


def codes(issues: list) -> list[str]:  # type: ignore[type-arg]
    return [i.code for i in issues]


def test_deadline_inside_window_passes() -> None:
    assert check_deadline(datetime(2027, 1, 15, tzinfo=UTC), CYCLE) == []


def test_deadline_after_intake_start_fails() -> None:
    assert codes(check_deadline(datetime(2027, 9, 1, tzinfo=UTC), CYCLE)) == ["date_outside_window"]


def test_deadline_far_before_intake_fails() -> None:
    assert codes(check_deadline(datetime(2024, 12, 1, tzinfo=UTC), CYCLE)) == ["date_outside_window"]


def test_cycle_mismatch_is_an_error_and_missing_cycle_a_warning() -> None:
    assert [(i.level, i.code) for i in check_cycle(2026, CYCLE)] == [("error", "cycle_mismatch")]
    assert [(i.level, i.code) for i in check_cycle(None, CYCLE)] == [("warning", "cycle_not_stated")]
    assert check_cycle(2027, CYCLE) == []


def test_unknown_timezone() -> None:
    assert codes(check_timezone("Mars/Olympus")) == ["bad_timezone"]
    assert check_timezone("Europe/London") == []


def test_cost_checks() -> None:
    ok = {"kind": "tuition", "basis": "per_year", "low": 1, "base": 2, "high": 3, "currency": "GBP"}
    assert check_cost(ok) == []
    assert codes(check_cost({**ok, "currency": "XYZ"})) == ["unknown_currency"]
    assert codes(check_cost({**ok, "low": 5})) == ["cost_order"]


def test_score_ranges_per_exam_and_version() -> None:
    assert check_score("ielts_academic", None, 6.5) == []
    assert codes(check_score("ielts_academic", None, 65)) == ["score_out_of_range"]
    assert check_score("toefl_ibt", "2026-01", 4.5) == []
    assert codes(check_score("toefl_ibt", "2026-01", 100)) == ["score_out_of_range"]
    assert check_score("toefl_ibt", "legacy", 100) == []
    # No version stated: 100 only fits the legacy scale, 4.5 only the new one.
    assert codes(check_score("toefl_ibt", None, 100)) == ["exam_version_ambiguous"]
    assert codes(check_score("toefl_ibt", None, 500)) == ["score_out_of_range"]
    assert codes(check_score("gre", None, 400)) == ["score_out_of_range"]


def test_changes_since_last_cycle_are_flagged() -> None:
    assert check_changed({"base": 2}, None, ["base"]) == []
    assert check_changed({"base": 2}, {"base": 2}, ["base"]) == []
    assert codes(check_changed({"base": 3}, {"base": 2}, ["base"])) == ["changed_since_last_cycle"]
