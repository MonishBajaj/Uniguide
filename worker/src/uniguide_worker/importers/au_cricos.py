"""Australia: CRICOS, the register of courses open to student-visa holders (data.gov.au, CC BY 2.5 AU).

Imports institutions and tertiary courses for the Listed tier. Fees in the register are left for
the extraction/review flow rather than published straight from the CSV.
"""

from __future__ import annotations

import csv
import hashlib
import io
from collections.abc import Iterable
from dataclasses import dataclass

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

DATASET = "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193"
COURSES_CSV = f"{DATASET}/resource/48cacf69-2082-415e-9595-f17d0c3a4af0/download/cricos-courses.csv"
INSTITUTIONS_CSV = f"{DATASET}/resource/7f6941f3-5327-4db7-b556-5f16d77f63c1/download/cricos-institutions.csv"
RIGHTS = "CRICOS, Department of Education, data.gov.au; Creative Commons Attribution 2.5 Australia."

# AQF course level -> (program level, ISCED 2011 level, track). Unlisted levels (school,
# Certificate I-IV, short courses) are out of scope.
LEVELS: dict[str, tuple[str, int, str | None]] = {
    "Diploma": ("diploma", 5, None),
    "Advanced Diploma": ("diploma", 5, "advanced"),
    "Associate Degree": ("diploma", 5, "associate"),
    "Bachelor Degree": ("bachelor", 6, None),
    "Bachelor Honours Degree": ("bachelor", 6, "honours"),
    "Graduate Certificate": ("diploma", 7, "graduate_certificate"),
    "Graduate Diploma": ("diploma", 7, "graduate_diploma"),
    "Masters Degree (Coursework)": ("master", 7, "coursework"),
    "Masters Degree (Extended)": ("master", 7, "extended"),
    "Masters Degree (Research)": ("master", 7, "research"),
    "Doctoral Degree": ("doctorate", 8, None),
}

# ASCED broad field -> ISCED-F 2013 broad field, only where the mapping is one-to-one.
# Ambiguous fields (05, 09, 10, 12) are left unmapped; the ASCED code is kept in register_ids.
ASCED_TO_ISCED_F = {"01": "05", "02": "06", "03": "07", "04": "07", "06": "09", "07": "01", "08": "04", "11": "10"}

LANGUAGES = {"English": "en", "Korean": "ko", "Mandarin": "zh", "Chinese (NFD)": "zh", "Chinese (NEC)": "zh"}


@dataclass(frozen=True)
class Parsed:
    institutions: dict[str, InstitutionRecord]
    programs: list[tuple[str, ProgramRecord]]
    skipped: int


def _code(field: str) -> str:
    return field.split(" - ", 1)[0].strip()


def _label(field: str) -> str | None:
    parts = field.split(" - ", 1)
    return parts[1].strip() if len(parts) == 2 else None


def parse(institutions_csv: str, courses_csv: str) -> Parsed:
    institutions: dict[str, InstitutionRecord] = {}
    for row in csv.DictReader(io.StringIO(institutions_csv.lstrip("﻿"))):
        code = row["CRICOS Provider Code"].strip()
        if not code:
            continue
        city = (row.get("Postal Address City") or "").strip().title() or None
        institutions[code] = InstitutionRecord(
            name=(row.get("Trading Name") or "").strip() or row["Institution Name"].strip(),
            country="AU",
            id_column="cricos_provider_code",
            id_value=code,
            city=city,
            official_domain=domain_of(row.get("Website")),
        )

    programs: list[tuple[str, ProgramRecord]] = []
    skipped = 0
    for row in csv.DictReader(io.StringIO(courses_csv.lstrip("﻿"))):
        provider = row["CRICOS Provider Code"].strip()
        level_name = row["Course Level"].strip()
        foundation = row.get("Foundation Studies", "").strip() == "Yes"
        if row.get("Expired", "").strip() != "No" or provider not in institutions:
            skipped += 1
            continue
        level: str
        isced: int
        track: str | None
        if foundation:
            level, isced, track = "foundation", 3, "foundation_studies"
        elif level_name in LEVELS:
            level, isced, track = LEVELS[level_name]
        else:
            skipped += 1
            continue

        course_code = row["CRICOS Course Code"].strip()
        detailed = row.get("Field of Education 1 Detailed Field", "")
        asced = _code(detailed) if detailed else None
        weeks = row.get("Duration (Weeks)", "").strip()
        months = round(int(weeks) * 12 / 52) if weeks.isdigit() and int(weeks) > 0 else None
        language = LANGUAGES.get(row.get("Course Language", "").strip(), "en")
        title = row["Course Name"].strip()
        programs.append(
            (
                provider,
                ProgramRecord(
                    slug=slugify(institutions[provider].name, title, course_code),
                    title=title,
                    level=level,
                    isced_level=isced,
                    isced_f=ASCED_TO_ISCED_F.get(asced[:2]) if asced else None,
                    cip=None,
                    field_label=_label(row.get("Field of Education 1 Narrow Field", "")),
                    track=track,
                    duration_months=min(months, 120) if months else None,
                    languages=[language],
                    register_ids={"cricos_course_code": course_code, "asced": asced, "aqf_level": level_name},
                ),
            )
        )
    return Parsed(institutions, programs, skipped)


def run(
    conn: Connection,
    fetcher: Fetcher | None = None,
    *,
    limit: int | None = None,
    files: tuple[str, str] | None = None,
) -> ImportStats:
    """Import from data.gov.au, or from local copies of (institutions.csv, courses.csv)."""
    if files:
        with open(files[0], encoding="utf-8-sig") as f1, open(files[1], encoding="utf-8-sig") as f2:
            institutions_csv, courses_csv = f1.read(), f2.read()
    else:
        if fetcher is None:
            raise ValueError("A fetcher is needed to download the register")
        institutions_csv = _download(fetcher, INSTITUTIONS_CSV)
        courses_csv = _download(fetcher, COURSES_CSV)

    parsed = parse(institutions_csv, courses_csv)
    source_id = register_source(
        conn,
        url=COURSES_CSV,
        owner="CRICOS register (Australian Government Department of Education)",
        rights_note=RIGHTS,
        content_hash=hashlib.sha256(courses_csv.encode()).hexdigest(),
    )
    stats = ImportStats(skipped=parsed.skipped)
    institution_ids = {}
    selected: Iterable[tuple[str, ProgramRecord]] = parsed.programs[:limit] if limit else parsed.programs
    for provider, program in selected:
        if provider not in institution_ids:
            institution_ids[provider] = upsert_institution(conn, parsed.institutions[provider], source_id)
            stats.institutions += 1
        upsert_program(conn, institution_ids[provider], program, source_id)
        stats.programs += 1
    conn.commit()
    return stats


def _download(fetcher: Fetcher, url: str) -> str:
    fetcher.check(url)
    fetcher.limiter.wait("data.gov.au")
    response = fetcher.client.get(url, headers={"User-Agent": fetcher.user_agent})
    response.raise_for_status()
    return response.content.decode("utf-8-sig")
