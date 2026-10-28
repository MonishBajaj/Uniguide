"""United States: College Scorecard (U.S. Department of Education, public domain).

Institutions and fields of study by credential level. Scorecard has no graduate deadlines or
requirements; those come from extraction. Needs a free api.data.gov key (DATA_GOV_API_KEY).

The response shape below follows the published API documentation; confirm it against a live
response with your key before relying on a full import (see docs/DATA_SOURCES.md).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx

from ..db import Connection
from ..fetch.ratelimit import HostRateLimiter
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

API = "https://api.data.gov/ed/collegescorecard/v1/schools.json"
RIGHTS = "College Scorecard, U.S. Department of Education; public domain."
FIELDS = "id,school.name,school.city,school.state,school.school_url,latest.programs.cip_4_digit"

# Scorecard credential level -> (program level, ISCED 2011 level). Certificates and
# first-professional degrees are out of scope for now.
CREDENTIALS: dict[int, tuple[str, int]] = {3: ("bachelor", 6), 5: ("master", 7), 6: ("doctorate", 8)}


def parse_school(school: dict[str, Any]) -> tuple[InstitutionRecord, list[ProgramRecord]]:
    unitid = str(school["id"])
    name = school["school.name"]
    institution = InstitutionRecord(
        name=name,
        country="US",
        id_column="ipeds_unitid",
        id_value=unitid,
        city=school.get("school.city"),
        official_domain=domain_of(school.get("school.school_url")),
    )
    programs: list[ProgramRecord] = []
    for entry in school.get("latest.programs.cip_4_digit") or []:
        credential = entry.get("credential") or {}
        level = CREDENTIALS.get(int(credential.get("level") or 0))
        if level is None:
            continue
        code = str(entry.get("code") or "").zfill(4)
        title = (entry.get("title") or "").strip().rstrip(".")
        program_level, isced = level
        programs.append(
            ProgramRecord(
                slug=slugify(name, credential.get("title") or program_level, title, unitid),
                title=f"{credential.get('title') or program_level.title()}: {title}",
                level=program_level,
                isced_level=isced,
                isced_f=None,
                cip=None,  # Scorecard gives 4-digit CIP; programs.cip holds the 6-digit form
                field_label=title,
                track=None,
                duration_months=None,
                languages=["en"],
                register_ids={"ipeds_unitid": unitid, "cip4": code, "credential_level": credential.get("level")},
            )
        )
    return institution, programs


def run(
    conn: Connection,
    *,
    api_key: str,
    user_agent: str,
    state: str | None = None,
    limit: int | None = None,
    per_page: int = 50,
    client: httpx.Client | None = None,
) -> ImportStats:
    client = client or httpx.Client(timeout=60.0)
    limiter = HostRateLimiter(min_interval=4.0)  # default key quota is 1,000 requests/hour
    stats = ImportStats()
    page = 0
    source_id = None
    while True:
        params: dict[str, str | int] = {
            "api_key": api_key,
            "fields": FIELDS,
            "per_page": per_page,
            "page": page,
            "school.degrees_awarded.predominant__range": "3..4",
        }
        if state:
            params["school.state"] = state
        limiter.wait("api.data.gov")
        response = client.get(API, params=params, headers={"User-Agent": user_agent})
        response.raise_for_status()
        payload = response.json()
        if source_id is None:
            source_id = register_source(
                conn,
                url=API,
                owner="College Scorecard (U.S. Department of Education)",
                rights_note=RIGHTS,
                content_hash=hashlib.sha256(
                    json.dumps(payload.get("metadata", {}), sort_keys=True).encode()
                ).hexdigest(),
            )
        results = payload.get("results") or []
        for school in results:
            institution, programs = parse_school(school)
            institution_id = upsert_institution(conn, institution, source_id)
            stats.institutions += 1
            for program in programs:
                upsert_program(conn, institution_id, program, source_id)
                stats.programs += 1
                if limit and stats.programs >= limit:
                    conn.commit()
                    return stats
        conn.commit()
        metadata = payload.get("metadata") or {}
        if not results or (page + 1) * per_page >= int(metadata.get("total", 0)):
            return stats
        page += 1
