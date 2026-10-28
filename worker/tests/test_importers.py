from pathlib import Path

import pytest

from uniguide_worker.importers import au_cricos, uk_discover_uni, us_scorecard
from uniguide_worker.importers.base import AccessPendingError, slugify
from uniguide_worker.importers.de_hochschulkompass import run as hochschulkompass

FIXTURES = Path(__file__).parent / "fixtures"


def test_cricos_keeps_current_tertiary_courses_only() -> None:
    parsed = au_cricos.parse(
        (FIXTURES / "cricos-institutions.csv").read_text(), (FIXTURES / "cricos-courses.csv").read_text()
    )
    levels = sorted({p.level for _, p in parsed.programs})
    assert levels == ["bachelor", "diploma", "doctorate", "master"]
    aqf = {p.register_ids["aqf_level"] for _, p in parsed.programs}
    assert "Certificate III" not in aqf and "Senior Secondary Certificate of Education" not in aqf
    # Skipped: an expired diploma, Certificate III and IV, a non-AQF award, a school certificate
    # and a vocational short course.
    assert parsed.skipped == 6


def test_cricos_maps_identifiers_and_fields() -> None:
    parsed = au_cricos.parse(
        (FIXTURES / "cricos-institutions.csv").read_text(), (FIXTURES / "cricos-courses.csv").read_text()
    )
    provider, program = next((pv, p) for pv, p in parsed.programs if p.level == "master")
    inst = parsed.institutions[provider]
    assert inst.country == "AU" and inst.id_column == "cricos_provider_code"
    assert program.register_ids["cricos_course_code"]
    assert program.isced_level == 7
    assert program.slug == slugify(inst.name, program.title, program.register_ids["cricos_course_code"])
    assert program.duration_months is None or 1 <= program.duration_months <= 120


def test_scorecard_parses_documented_shape() -> None:
    school = {
        "id": 999999,
        "school.name": "Example State University",
        "school.city": "Springfield",
        "school.state": "ZZ",
        "school.school_url": "www.example.edu/",
        "latest.programs.cip_4_digit": [
            {"code": "1107", "title": "Computer Science.", "credential": {"level": 5, "title": "Master's Degree"}},
            {"code": "1107", "title": "Computer Science.", "credential": {"level": 1, "title": "Certificate"}},
            {"code": "5203", "title": "Accounting.", "credential": {"level": 3, "title": "Bachelor's Degree"}},
        ],
    }
    institution, programs = us_scorecard.parse_school(school)
    assert institution.id_value == "999999" and institution.official_domain == "www.example.edu"
    assert [(p.level, p.field_label) for p in programs] == [("master", "Computer Science"), ("bachelor", "Accounting")]
    assert programs[0].register_ids["cip4"] == "1107"


def test_discover_uni_fails_loudly_on_unexpected_columns() -> None:
    with pytest.raises(uk_discover_uni.ColumnMismatch):
        uk_discover_uni.parse("UKPRN,NAME\n1,X\n", "UKPRN,TITLE\n")


def test_hochschulkompass_waits_for_access() -> None:
    with pytest.raises(AccessPendingError):
        hochschulkompass()
