from datetime import date

from uniguide_worker.extract.schema import PageExtraction
from uniguide_worker.proposals import from_extraction
from uniguide_worker.validate.checks import CycleInfo

PAGE = (
    "MSc Data Science 2027 entry. International applicants should apply by 30 June 2027. "
    "IELTS Academic 6.5 overall with 6.0 in writing. Tuition 2027-28 (overseas): £31,500. "
    "Living costs: £1,100 to £1,500 a month."
)
CYCLE = CycleInfo("2027-autumn", 2027, date(2027, 9, 20))


def extraction(**overrides: object) -> PageExtraction:
    data: dict[str, object] = {
        "effective_intake": "2027 entry",
        "effective_intake_year": 2027,
        "language_tests": [
            {
                "applicant_category": "international",
                "exam": "ielts_academic",
                "exam_version": None,
                "min_total": 6.5,
                "min_sections": [{"section": "Writing", "minimum": 6.0}],
                "quote": "IELTS Academic 6.5 overall with 6.0 in writing.",
            }
        ],
        "entry_qualifications": [],
        "admissions_tests": [],
        "deadlines": [
            {
                "applicant_category": "international",
                "round": None,
                "kind": "application",
                "owning_system": "direct",
                "date": "2027-06-30",
                "time": None,
                "timezone": None,
                "original_text": "30 June 2027",
                "quote": "International applicants should apply by 30 June 2027.",
            }
        ],
        "costs": [
            {
                "applicant_category": "international",
                "kind": "tuition",
                "basis": "per_year",
                "amount": 31500,
                "amount_high": None,
                "currency": "gbp",
                "fee_year": "2027-28",
                "quote": "Tuition 2027-28 (overseas): £31,500.",
            },
            {
                "applicant_category": "all",
                "kind": "living",
                "basis": "per_month",
                "amount": 1100,
                "amount_high": 1500,
                "currency": "GBP",
                "fee_year": None,
                "quote": "Living costs: £1,100 to £1,500 a month.",
            },
        ],
    }
    data.update(overrides)
    return PageExtraction.model_validate(data)


def test_clean_extraction_maps_to_typed_proposals() -> None:
    proposals = from_extraction(extraction(), CYCLE, "GB", PAGE)
    assert [p.subject for p in proposals] == ["requirement", "deadline", "cost_item", "cost_item"]
    assert all(not p.has_errors for p in proposals)
    lang, deadline, tuition, living = proposals
    assert lang.proposed["min_sections"] == {"writing": 6.0}
    # Date-only UK deadline: local midnight, Europe/London (BST in June).
    assert deadline.proposed["due_at"] == "2027-06-30T00:00:00+01:00"
    assert deadline.proposed["precision"] == "date"
    assert tuition.proposed["currency"] == "GBP"
    assert (living.proposed["low"], living.proposed["base"], living.proposed["high"]) == (1100, 1300, 1500)


def test_invented_quote_is_an_error() -> None:
    bad = extraction(
        deadlines=[
            {
                "applicant_category": "all",
                "round": None,
                "kind": "application",
                "owning_system": "direct",
                "date": "2027-03-01",
                "time": None,
                "timezone": None,
                "original_text": "1 March 2027",
                "quote": "The final deadline is 1 March 2027.",
            }
        ]
    )
    deadline = next(p for p in from_extraction(bad, CYCLE, "GB", PAGE) if p.subject == "deadline")
    assert [i.code for i in deadline.issues] == ["quote_not_found"]


def test_unknown_zone_country_falls_back_to_utc_with_warning() -> None:
    deadline = next(p for p in from_extraction(extraction(), CYCLE, "US", PAGE) if p.subject == "deadline")
    assert deadline.proposed["timezone"] == "UTC"
    assert [i.code for i in deadline.issues] == ["timezone_assumed"]


def test_stated_time_and_zone_give_an_exact_deadline() -> None:
    ex = extraction()
    ex.deadlines[0].time = "17:15"
    ex.deadlines[0].timezone = "Europe/Dublin"
    deadline = next(p for p in from_extraction(ex, CYCLE, "IE", PAGE) if p.subject == "deadline")
    assert deadline.proposed["due_at"] == "2027-06-30T17:15:00+01:00"
    assert deadline.proposed["precision"] == "exact_time"
