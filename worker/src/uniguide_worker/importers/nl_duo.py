"""Netherlands: DUO's overview of accredited higher-education programmes (onderwijsdata.duo.nl, CC BY 4.0).

One CSV row per offered programme (or variant) per location and mode. Rows are grouped by
programme unit code; the language and mode come from the offered rows. Pre-master and other
bridging programmes are out of scope, as are programmes whose register end date has passed.
"""

from __future__ import annotations

import csv
import hashlib
import io
from dataclasses import dataclass, field
from datetime import date

from ..db import Connection
from ..fetch.fetcher import Fetcher
from .base import (
    ImportStats,
    InstitutionRecord,
    ProgramRecord,
    domain_of,
    register_source,
    slugify,
    upsert_institution,
    upsert_program,
)

DATASET = "https://onderwijsdata.duo.nl/dataset/7c0686f4-b5c2-418e-8e44-7be0057d8084"
CSV_URL = f"{DATASET}/resource/ffffa7ad-e6a2-4ba7-9fc2-a09df4128555/download/ho_opleidingsoverzicht.csv"
RIGHTS = "Overzicht hoger onderwijs opleidingen, DUO (Dienst Uitvoering Onderwijs); Creative Commons Attribution 4.0."

# NIVEAU -> (program level, ISCED 2011 level, track). HBO is professional, WO research-oriented.
LEVELS: dict[str, tuple[str, int, str]] = {
    "HBO-AD": ("diploma", 5, "associate"),
    "HBO-BA": ("bachelor", 6, "professional"),
    "WO-BA": ("bachelor", 6, "research"),
    "HBO-MA": ("master", 7, "professional"),
    "WO-MA": ("master", 7, "research"),
}
LANGUAGES = {"ENG": "en", "NLD": "nl", "DEU": "de"}
MODES = {"VOLTIJD": "full_time", "DEELTIJD": "part_time", "DUAAL": "dual"}
COLUMNS = ["ONDERWIJSBESTUURID", "ONDERWIJSBESTUUR_NAAM", "SOORT", "OPLEIDINGSEENHEIDCODE", "NIVEAU", "STUDIELAST"]


class ColumnMismatch(RuntimeError):
    pass


@dataclass
class Parsed:
    institutions: dict[str, InstitutionRecord]
    programs: list[tuple[str, ProgramRecord]]
    skipped: int = 0
    notes: list[str] = field(default_factory=list)


def _institution_name(rows: list[dict[str, str]]) -> str:
    offered = next((r["ONDERWIJSAANBIEDER_NAAM"] for r in rows if r.get("ONDERWIJSAANBIEDER_NAAM")), "")
    name = offered or rows[0].get("PENVOERDER") or rows[0]["ONDERWIJSBESTUUR_NAAM"]
    # "Stichting" is the legal form of the foundation that runs the school, not part of its name.
    return name.strip().removeprefix("Stichting ").strip()


def _active(row: dict[str, str], today: date) -> bool:
    for col in ("EINDDATUM", "AANGEBODEN_OPLEIDING_EINDDATUM"):
        end = (row.get(col) or "").strip()
        if end and date.fromisoformat(end) <= today:
            return False
    return True


def parse(text: str, today: date | None = None) -> Parsed:
    today = today or date.today()
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise ColumnMismatch(f"DUO file lacks columns {missing}; update nl_duo.py")

    units: dict[str, list[dict[str, str]]] = {}
    by_board: dict[str, list[dict[str, str]]] = {}
    skipped: set[str] = set()
    for row in reader:
        code = row["OPLEIDINGSEENHEIDCODE"].strip()
        if row["NIVEAU"] not in LEVELS or not _active(row, today):
            skipped.add(code)
            continue
        units.setdefault(code, []).append(row)
        by_board.setdefault(row["ONDERWIJSBESTUURID"].strip(), []).append(row)
    skipped -= units.keys()

    institutions = {}
    for board, rows in by_board.items():
        site = next((r["WEBSITE"] for r in rows if (r.get("WEBSITE") or "").startswith("http")), None)
        institutions[board] = InstitutionRecord(
            name=_institution_name(rows),
            country="NL",
            id_column="register_id",
            id_value=board,
            city=next(
                (r["ONDERWIJSLOCATIEPLAATS"].strip().title() for r in rows if r.get("ONDERWIJSLOCATIEPLAATS")), None
            ),
            official_domain=domain_of(site),
        )

    programs = []
    for code, rows in units.items():
        first = rows[0]
        board = first["ONDERWIJSBESTUURID"].strip()
        level, isced, track = LEVELS[first["NIVEAU"]]
        title = (first.get("INTERNATIONALE_NAAM") or first.get("NAAM_LANG") or "").strip()
        if not title:
            skipped.add(code)
            continue
        languages = sorted({LANGUAGES[t] for r in rows for t in (r.get("VOERTAAL") or "").split(",") if t in LANGUAGES})
        modes = sorted({MODES[r["VORM"]] for r in rows if r.get("VORM") in MODES})
        ects = int(first["STUDIELAST"]) if first["STUDIELAST"].strip().isdigit() else None
        url = next((r["WEBSITE"].strip() for r in rows if (r.get("WEBSITE") or "").startswith("http")), None)
        register_ids: dict[str, object] = {"duo_unit": code, "board": board, "ects": ects, "modes": modes}
        if first.get("ERKENDEOPLEIDINGSCODE"):
            register_ids["croho"] = first["ERKENDEOPLEIDINGSCODE"].strip()
        programs.append(
            (
                board,
                ProgramRecord(
                    slug=slugify(institutions[board].name, title, code),
                    title=title,
                    level=level,
                    isced_level=isced,
                    isced_f=None,
                    cip=None,
                    field_label=None,
                    track=track,
                    # 60 ECTS is one full-time year.
                    duration_months=round(ects / 60 * 12) if ects else None,
                    # An empty VOERTAAL is unknown, not Dutch: leave it empty rather than guess.
                    languages=languages,
                    register_ids=register_ids,
                    official_url=url,
                ),
            )
        )
    return Parsed(institutions, programs, skipped=len(skipped))


def run(
    conn: Connection, fetcher: Fetcher | None = None, *, file: str | None = None, limit: int | None = None
) -> ImportStats:
    if file:
        with open(file, encoding="utf-8-sig") as f:
            text = f.read()
    else:
        if fetcher is None:
            raise ValueError("A fetcher is needed to download the register")
        fetcher.check(CSV_URL)
        fetcher.limiter.wait("onderwijsdata.duo.nl")
        response = fetcher.client.get(CSV_URL, headers={"User-Agent": fetcher.user_agent})
        response.raise_for_status()
        text = response.content.decode("utf-8-sig")

    parsed = parse(text)
    source_id = register_source(
        conn, url=CSV_URL, owner="DUO (Dienst Uitvoering Onderwijs)", rights_note=RIGHTS,
        content_hash=hashlib.sha256(text.encode()).hexdigest(),
    )  # fmt: skip
    stats = ImportStats(skipped=parsed.skipped)
    ids = {}
    for board, program in parsed.programs[:limit] if limit else parsed.programs:
        if board not in ids:
            ids[board] = upsert_institution(conn, parsed.institutions[board], source_id)
            stats.institutions += 1
        upsert_program(conn, ids[board], program, source_id)
        stats.programs += 1
    conn.commit()
    return stats
