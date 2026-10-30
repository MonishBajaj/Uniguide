from pathlib import Path

from uniguide_worker.db import Connection
from uniguide_worker.importers import qs_rankings

from .qs_workbook import write_workbook

CS = "Computer Science & Information Systems"


def _institution(conn: Connection, name: str, country: str = "US") -> str:
    row = conn.execute("insert into institutions (name, country) values (%s, %s) returning id", (name, country)).fetchone()
    assert row is not None
    return str(row["id"])


def _rows(conn: Connection, institution_id: str) -> dict[tuple[str, str], tuple[int, int]]:
    rows = conn.execute(
        "select subject, edition, rank_low, rank_high from institution_rankings where institution_id = %s",
        (institution_id,),
    ).fetchall()
    return {(r["subject"], r["edition"]): (r["rank_low"], r["rank_high"]) for r in rows}


def _book(tmp_path: Path, rows: dict[str, list[list[str]]], edition: str = "2026") -> str:
    path = str(tmp_path / f"qs-{edition}.xlsx")
    write_workbook(path, {name: (name, data) for name, data in rows.items()}, edition)
    return path


def _row(rank: str, name: str, country: str = "United States of America") -> list[str]:
    return [rank, rank, name, country, "50", "50"]


def test_matched_institution_gets_a_row_per_subject(worker: Connection, tmp_path: Path) -> None:
    uid = _institution(worker, "Quillfeather University")
    path = _book(tmp_path, {CS: [_row("12", "Quillfeather University (QU)")], "Law": [_row("751-850", "Quillfeather University")]})
    stats = qs_rankings.run(worker, file=path)
    assert _rows(worker, uid) == {(CS, "2026"): (12, 12), ("Law", "2026"): (751, 850)}
    assert stats.institutions == 1 and stats.programs == 2


def test_matching_stays_inside_the_country(worker: Connection, tmp_path: Path) -> None:
    other = _institution(worker, "Quillfeather University", "GB")
    qs_rankings.run(worker, file=_book(tmp_path, {CS: [_row("12", "Quillfeather University")]}))
    assert _rows(worker, other) == {}


def test_alias_file_resolves_a_name_the_normaliser_misses(worker: Connection, tmp_path: Path) -> None:
    uid = _institution(worker, "Quillfeather State College")
    aliases = tmp_path / "aliases.yaml"
    aliases.write_text('"QSC Quillfeather": "Quillfeather State College"\n')
    qs_rankings.run(worker, file=_book(tmp_path, {CS: [_row("40", "QSC Quillfeather")]}), aliases_file=str(aliases))
    assert _rows(worker, uid) == {(CS, "2026"): (40, 40)}


def test_a_name_matching_two_institutions_is_skipped_and_reported(worker: Connection, tmp_path: Path) -> None:
    a, b = _institution(worker, "Quillfeather University"), _institution(worker, "Quillfeather University-Main Campus")
    stats = qs_rankings.run(worker, file=_book(tmp_path, {CS: [_row("12", "Quillfeather University")]}))
    assert _rows(worker, a) == {} and _rows(worker, b) == {}
    assert any("ambiguous" in n and "Quillfeather University" in n for n in stats.notes)


def test_two_qs_rows_for_one_institution_keep_the_better_rank(worker: Connection, tmp_path: Path) -> None:
    uid = _institution(worker, "Quillfeather University")
    path = _book(tmp_path, {CS: [_row("90", "Quillfeather University"), _row("30", "Quillfeather University (QU)")]})
    qs_rankings.run(worker, file=path)
    assert _rows(worker, uid) == {(CS, "2026"): (30, 30)}


def test_running_twice_leaves_one_row_and_another_edition_is_kept(worker: Connection, tmp_path: Path) -> None:
    uid = _institution(worker, "Quillfeather University")
    old = _book(tmp_path, {CS: [_row("12", "Quillfeather University")]})
    qs_rankings.run(worker, file=old)
    qs_rankings.run(worker, file=old)
    new = _book(tmp_path, {CS: [_row("8", "Quillfeather University")]}, edition="2027")
    qs_rankings.run(worker, file=new)
    assert _rows(worker, uid) == {(CS, "2026"): (12, 12), (CS, "2027"): (8, 8)}


def test_unmatched_institutions_are_reported_only_when_ranked_200_or_better(worker: Connection, tmp_path: Path) -> None:
    path = _book(tmp_path, {CS: [_row("150", "Zzyzx Missing Institute"), _row("600-650", "Zzyzx Far Away College")]})
    stats = qs_rankings.run(worker, file=path)
    assert stats.skipped == 2
    assert any("Zzyzx Missing Institute (US) best rank 150" in n for n in stats.notes)
    assert not any("Far Away" in n for n in stats.notes)


def test_rankings_record_their_source(worker: Connection, tmp_path: Path) -> None:
    uid = _institution(worker, "Quillfeather University")
    qs_rankings.run(worker, file=_book(tmp_path, {CS: [_row("12", "Quillfeather University")]}))
    row = worker.execute("select source_id from institution_rankings where institution_id = %s", (uid,)).fetchone()
    assert row is not None and row["source_id"] is not None


def test_an_empty_workbook_imports_nothing(worker: Connection, tmp_path: Path) -> None:
    stats = qs_rankings.run(worker, file=_book(tmp_path, {CS: []}))
    assert stats.institutions == 0 and stats.programs == 0
