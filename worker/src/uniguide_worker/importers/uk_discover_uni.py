"""United Kingdom: the Discover Uni dataset (Office for Students / HESA, Open Government Licence).

Undergraduate courses only; postgraduate courses come from extraction. The dataset is a zip of
CSV files downloaded by hand from the Discover Uni / HESA data pages. Column names below follow
the dataset specification and must be confirmed against the current year's file before a full
import (see docs/DATA_SOURCES.md); a missing column fails loudly rather than importing nonsense.
"""

from __future__ import annotations

import csv
import hashlib
import io

from ..db import Connection
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

DATASET_URL = "https://www.discoveruni.gov.uk/about-our-data/"
RIGHTS = "Discover Uni dataset, Office for Students; Open Government Licence v3.0."

# Column map: our field -> dataset column. Update here if the specification changes.
INSTITUTION_COLUMNS = {"ukprn": "UKPRN", "name": "LEGAL_NAME", "url": "PROVURL"}
COURSE_COLUMNS = {"ukprn": "UKPRN", "course_id": "KISCOURSEID", "title": "TITLE", "url": "CRSEURL", "mode": "KISMODE"}

# SBJ.csv: one row per course, mode and subject. Codes are HECoS Common Aggregation Hierarchy (CAH) levels,
# for example CAH11-01-01; the first part (CAH11) names the subject group we map to a broad ISCED-F field.
SUBJECT_COLUMNS = {"ukprn": "UKPRN", "course_id": "KISCOURSEID", "subject": "SBJ"}

# CAH subject group -> broad ISCED-F field (the field codes students pick from). None: no single field.
# Checked against sample course titles in the 2026 dataset. Edit here if HESA changes the hierarchy.
CAH_TO_ISCED_F: dict[str, str | None] = {
    "CAH01": "09",  # medicine and dentistry
    "CAH02": "09",  # subjects allied to medicine
    "CAH03": "05",  # biological and sport sciences
    "CAH04": "03",  # psychology (social and behavioural sciences)
    "CAH05": "08",  # veterinary sciences
    "CAH06": "08",  # agriculture, food and related studies
    "CAH07": "05",  # physical sciences
    "CAH09": "05",  # mathematical sciences
    "CAH10": "07",  # engineering and technology
    "CAH11": "06",  # computing
    "CAH13": "07",  # architecture, building and planning
    "CAH15": "03",  # social sciences
    "CAH16": "04",  # law
    "CAH17": "04",  # business and management
    "CAH19": "02",  # language and area studies
    "CAH20": "02",  # historical, philosophical and religious studies
    "CAH22": "01",  # education and teaching
    "CAH23": None,  # combined and general studies
    "CAH24": "03",  # media, journalism and communications
    "CAH25": "02",  # creative arts and design
    "CAH26": "05",  # geography, earth and environmental sciences
}

# KISMODE: 1 full-time, 2 part-time, 3 both. Delivery is on campus unless the course is distance.
MODES = {"1": "full_time", "2": "part_time", "3": "full_or_part_time"}


class ColumnMismatch(RuntimeError):
    pass


def _require(header: list[str], columns: dict[str, str], file: str) -> None:
    missing = [c for c in columns.values() if c not in header]
    if missing:
        raise ColumnMismatch(f"{file} lacks columns {missing}; update the column map in uk_discover_uni.py")


def _course_fields(subject_csv: str | None) -> dict[tuple[str, str], str]:
    """The broad field of each course: its first listed subject that maps to a field."""
    if subject_csv is None:
        return {}
    reader = csv.DictReader(io.StringIO(subject_csv.lstrip("\ufeff")))
    _require(list(reader.fieldnames or []), SUBJECT_COLUMNS, "SBJ.csv")
    fields: dict[tuple[str, str], str] = {}
    for row in reader:
        key = (row[SUBJECT_COLUMNS["ukprn"]].strip(), row[SUBJECT_COLUMNS["course_id"]].strip())
        field = CAH_TO_ISCED_F.get(row[SUBJECT_COLUMNS["subject"]].strip()[:5])
        if field and key not in fields:
            fields[key] = field
    return fields


def parse(
    institution_csv: str, course_csv: str, subject_csv: str | None = None
) -> tuple[dict[str, InstitutionRecord], list[tuple[str, ProgramRecord]]]:
    inst_reader = csv.DictReader(io.StringIO(institution_csv.lstrip("﻿")))
    _require(list(inst_reader.fieldnames or []), INSTITUTION_COLUMNS, "INSTITUTION.csv")
    institutions = {}
    for row in inst_reader:
        ukprn = row[INSTITUTION_COLUMNS["ukprn"]].strip()
        institutions[ukprn] = InstitutionRecord(
            name=row[INSTITUTION_COLUMNS["name"]].strip(),
            country="GB",
            id_column="ukprn",
            id_value=ukprn,
            official_domain=domain_of(row.get(INSTITUTION_COLUMNS["url"])),
        )

    fields = _course_fields(subject_csv)
    course_reader = csv.DictReader(io.StringIO(course_csv.lstrip("﻿")))
    _require(list(course_reader.fieldnames or []), COURSE_COLUMNS, "KISCOURSE.csv")
    programs = []
    for row in course_reader:
        ukprn = row[COURSE_COLUMNS["ukprn"]].strip()
        if ukprn not in institutions:
            continue
        course_id = row[COURSE_COLUMNS["course_id"]].strip()
        title = row[COURSE_COLUMNS["title"]].strip()
        url = (row.get(COURSE_COLUMNS["url"]) or "").strip()
        programs.append(
            (
                ukprn,
                ProgramRecord(
                    slug=slugify(institutions[ukprn].name, title, course_id),
                    title=title,
                    level="bachelor",
                    isced_level=6,
                    isced_f=fields.get((ukprn, course_id)),
                    cip=None,
                    field_label=None,
                    track=MODES.get(row.get(COURSE_COLUMNS["mode"], "").strip()),
                    duration_months=None,
                    languages=["en"],
                    register_ids={"ukprn": ukprn, "kiscourseid": course_id},
                    official_url=url if url.startswith(("http://", "https://")) else None,
                ),
            )
        )
    return institutions, programs


def run(
    conn: Connection,
    *,
    institution_file: str,
    course_file: str,
    subject_file: str | None = None,
    limit: int | None = None,
) -> ImportStats:
    with open(institution_file, encoding="utf-8-sig") as f1, open(course_file, encoding="utf-8-sig") as f2:
        institution_csv, course_csv = f1.read(), f2.read()
    subject_csv = None
    if subject_file:
        with open(subject_file, encoding="utf-8-sig") as f3:
            subject_csv = f3.read()
    institutions, programs = parse(institution_csv, course_csv, subject_csv)
    source_id = register_source(
        conn,
        url=DATASET_URL,
        owner="Discover Uni (Office for Students)",
        rights_note=RIGHTS,
        content_hash=hashlib.sha256(course_csv.encode()).hexdigest(),
    )
    stats = ImportStats()
    ids = {}
    for ukprn, program in programs[:limit] if limit else programs:
        if ukprn not in ids:
            ids[ukprn] = upsert_institution(conn, institutions[ukprn], source_id)
            stats.institutions += 1
        upsert_program(conn, ids[ukprn], program, source_id)
        stats.programs += 1
    conn.commit()
    return stats
