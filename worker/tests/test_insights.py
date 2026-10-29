from typing import Any

from uniguide_worker.research.insights import compute_insights


def outcomes(country: str, admitted: int, rejected: int) -> list[dict[str, Any]]:
    rows = [
        {"country": country, "decision": "admitted", "program_id": "p", "user_id": "secret"} for _ in range(admitted)
    ]
    return rows + [
        {"country": country, "decision": "rejected", "program_id": "p", "user_id": "secret"} for _ in range(rejected)
    ]


def test_suppresses_groups_under_ten() -> None:
    nine = compute_insights(outcomes("GB", 5, 4))
    ten = compute_insights(outcomes("GB", 5, 5))
    assert nine == []
    assert [(i.metric, i.dimension, i.group_size) for i in ten] == [("admit_share", {"country": "GB"}, 10)]
    assert ten[0].value == 0.5


def test_one_row_per_country_and_nothing_identifying() -> None:
    rows = outcomes("GB", 6, 4) + outcomes("DE", 8, 2) + outcomes("US", 1, 1)
    insights = compute_insights(rows)
    assert sorted(i.dimension["country"] for i in insights) == ["DE", "GB"]
    assert all(
        "user_id" not in i.dimension and set(vars(i)) == {"metric", "dimension", "value", "group_size"}
        for i in insights
    )


def test_suppresses_when_too_few_outcomes_are_decided() -> None:
    waitlisted = [{"country": "GB", "decision": "waitlisted", "program_id": "p"} for _ in range(9)]
    one_decided = waitlisted + [{"country": "GB", "decision": "admitted", "program_id": "p"}]
    assert compute_insights(one_decided) == []


def test_values_are_rounded_to_the_nearest_five_percent() -> None:
    [i] = compute_insights(outcomes("GB", 7, 5))  # 58.3% of decided
    assert i.value == 0.6
