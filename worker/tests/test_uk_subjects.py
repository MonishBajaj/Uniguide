import pytest

from uniguide_worker.importers import uk_discover_uni

INSTITUTIONS = "UKPRN,LEGAL_NAME,PROVURL\n100,Example University,www.example.ac.uk\n"
COURSES = (
    "UKPRN,KISCOURSEID,TITLE,CRSEURL,KISMODE\n"
    "100,CS1,Computer Science,https://example.ac.uk/cs,01\n"
    "100,MIX1,Mathematics with Spanish,https://example.ac.uk/mix,01\n"
    "100,GEN1,Liberal Arts,https://example.ac.uk/la,01\n"
    "100,NOSBJ,Anything,https://example.ac.uk/x,01\n"
)
SUBJECTS = (
    "PUBUKPRN,UKPRN,KISCOURSEID,KISMODE,SBJ\n"
    "100,100,CS1,01,CAH11-01-01\n"
    "100,100,CS1,02,CAH11-01-01\n"
    "100,100,MIX1,01,CAH09-01-01\n"
    "100,100,MIX1,01,CAH19-02-01\n"
    "100,100,GEN1,01,CAH23-01-01\n"
    "100,100,GEN1,01,CAH19-01-01\n"
)


def _fields(subjects: str | None) -> dict[str, str | None]:
    _, programs = uk_discover_uni.parse(INSTITUTIONS, COURSES, subjects)
    return {p.register_ids["kiscourseid"]: p.isced_f for _, p in programs}


def test_subject_code_becomes_a_broad_field() -> None:
    assert _fields(SUBJECTS)["CS1"] == "06"


def test_first_listed_subject_decides_for_a_joint_course() -> None:
    assert _fields(SUBJECTS)["MIX1"] == "05"


def test_combined_studies_are_skipped_in_favour_of_the_next_subject() -> None:
    assert _fields(SUBJECTS)["GEN1"] == "02"


def test_course_without_subject_rows_has_no_field() -> None:
    assert _fields(SUBJECTS)["NOSBJ"] is None


def test_without_a_subject_file_fields_stay_empty() -> None:
    assert set(_fields(None).values()) == {None}


def test_subject_file_with_missing_columns_fails_loudly() -> None:
    with pytest.raises(uk_discover_uni.ColumnMismatch):
        uk_discover_uni.parse(INSTITUTIONS, COURSES, "UKPRN,X\n1,2\n")


def test_every_mapped_field_is_a_known_broad_field() -> None:
    known = {"01", "02", "03", "04", "05", "06", "07", "08", "09", "10"}
    assert {v for v in uk_discover_uni.CAH_TO_ISCED_F.values() if v} <= known
