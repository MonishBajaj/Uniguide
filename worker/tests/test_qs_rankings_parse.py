from pathlib import Path

import pytest

from uniguide_worker.importers.qs_rankings import COUNTRY_ISO, normalize_name, parse_rank, read_workbook

from .qs_workbook import write_workbook


@pytest.mark.parametrize(
    ("text", "expected"),
    [("7", (7, 7)), ("751-850", (751, 850)), ("=7", (7, 7)), ("501+", (501, 501)), (" 12 ", (12, 12))],
)
def test_parse_rank(text: str, expected: tuple[int, int]) -> None:
    assert parse_rank(text) == expected


@pytest.mark.parametrize("text", ["", "n/a", "850-751"])
def test_parse_rank_rejects_what_is_not_a_rank(text: str) -> None:
    with pytest.raises(ValueError):
        parse_rank(text)


def test_names_match_without_brackets_accents_or_campus_suffix() -> None:
    assert normalize_name("Massachusetts Institute of Technology (MIT)") == normalize_name(
        "Massachusetts Institute of Technology"
    )
    assert normalize_name("Universität Potsdam") == normalize_name("Universitat Potsdam")
    assert normalize_name("Georgia Institute of Technology-Main Campus") == normalize_name(
        "Georgia Institute of Technology"
    )
    assert normalize_name("The University of Newcastle, Australia (UON)") == normalize_name(
        "University of Newcastle Australia"
    )


def test_unicode_dashes_and_apostrophes_separate_words_like_ascii_ones() -> None:
    assert normalize_name("Rutgers University\u2013New Brunswick") == normalize_name("Rutgers University-New Brunswick")
    assert normalize_name("City St George\u2019s, University of London") == normalize_name(
        "City St George's, University of London"
    )


def test_different_institutions_do_not_collide() -> None:
    assert normalize_name("University of Washington") != normalize_name("Washington University in St. Louis")


def test_workbook_reader(tmp_path: Path) -> None:
    path = str(tmp_path / "qs.xlsx")
    write_workbook(
        path,
        {
            "Computer Science & Information ": (
                "Computer Science & Information Systems",
                [
                    ["1", "1", "Massachusetts Institute of Technology (MIT)", "United States of America", "100", "1"],
                    ["751-850", "551-600", "Worcester Polytechnic Institute", "United States of America", "33", "959"],
                    ["5", "6", "University of Nowhere", "Narnia", "90", "5"],
                ],
            ),
            "Law": ("Law", [["3", "4", "University of Oxford", "United Kingdom", "99", "2"]]),
        },
    )
    book = read_workbook(path)
    assert book.edition == "2026"
    assert [s.subject for s in book.sheets] == ["Computer Science & Information Systems", "Law"]
    cs = book.sheets[0].rows
    assert [(r.institution, r.country, r.rank_low, r.rank_high) for r in cs] == [
        ("Massachusetts Institute of Technology (MIT)", "US", 1, 1),
        ("Worcester Polytechnic Institute", "US", 751, 850),
    ]
    assert book.sheets[1].rows[0].country == "GB"


def test_country_names_cover_the_destinations() -> None:
    assert set(COUNTRY_ISO.values()) == {
        "US",
        "GB",
        "CA",
        "AU",
        "DE",
        "IE",
        "NL",
        "FR",
        "NZ",
        "SG",
        "JP",
        "KR",
        "AE",
        "QA",
    }
