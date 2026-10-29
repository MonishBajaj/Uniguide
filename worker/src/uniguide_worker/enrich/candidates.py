"""Fallback for countries with no register: Gemini names courses, we keep only those on the institution's own site.

Gemini supplies the identity of a course (institution, programme, official URL) and nothing else. Every fact still
comes from reading the official page.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from google.genai import types
from pydantic import BaseModel

from ..db import Connection
from ..db_enums import ProgramLevel

SYSTEM = (
    "You suggest real university courses for a student. Return only courses that exist, with the "
    "institution's official website domain and the URL of the course's page on that site. "
    "Never invent a URL; leave a course out if you are not sure of its page."
)


class Candidate(BaseModel):
    institution: str
    programme: str
    level: str
    country: str
    url: str
    domain: str


class CandidateList(BaseModel):
    candidates: list[Candidate]


def host_matches_domain(url: str, domain: str) -> bool:
    """True only when the URL's host is the institution's domain or one of its subdomains."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    domain = domain.lower().strip().removeprefix("www.")
    if parts.scheme not in ("https", "http") or "." not in domain:
        return False
    return host == domain or host.endswith("." + domain)


def propose_candidates(client: Any, model: str, snapshot: dict[str, Any], limit: int) -> list[Candidate]:
    """Ask Gemini for up to `limit` courses. Only the profile snapshot's targets are sent; errors give no candidates."""
    countries = [str(c) for c in snapshot.get("target_countries", [])]
    levels = [str(x) for x in snapshot.get("target_levels", [])]
    fields = [str(f) for f in snapshot.get("target_fields", [])]
    prompt = (
        f"Suggest up to {limit} courses.\nCountries (ISO codes): {', '.join(countries) or 'any'}\n"
        f"Levels: {', '.join(levels) or 'any'}\nFields: {', '.join(fields) or 'any'}"
    )
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM,
                response_mime_type="application/json",
                response_json_schema=CandidateList.model_json_schema(),
            ),
        )
        found = CandidateList.model_validate_json(response.text or "").candidates
    except Exception:  # best effort: a failed suggestion must not fail the job
        return []
    return [c for c in found if not countries or c.country.upper() in countries][:limit]


def _slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:80]


def _unique_slug(conn: Connection, base: str) -> str:
    slug, n = base, 2
    while conn.execute("select 1 from programs where slug = %s", (slug,)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def create_from_candidates(conn: Connection, candidates: list[Candidate]) -> list[UUID]:
    """Add the accepted candidates to the catalog and return their program ids (existing courses are reused)."""
    levels = {level.value for level in ProgramLevel}
    ids: list[UUID] = []
    for c in candidates:
        if c.level not in levels or not host_matches_domain(c.url, c.domain):
            continue
        country = c.country.upper()
        domain = c.domain.lower().strip().removeprefix("www.")
        inst = conn.execute(
            "select id from institutions where country = %s and (official_domain = %s or lower(name) = lower(%s)) limit 1",
            (country, domain, c.institution),
        ).fetchone()
        if inst is None:
            inst = conn.execute(
                """
                insert into institutions (name, country, official_domain, verification_method)
                values (%s, %s, %s, 'automated_extraction') returning id
                """,
                (c.institution, country, domain),
            ).fetchone()
        assert inst is not None
        prog = conn.execute(
            "select id from programs where institution_id = %s and lower(title) = lower(%s) limit 1",
            (inst["id"], c.programme),
        ).fetchone()
        if prog is None:
            slug = _unique_slug(conn, _slugify(f"{c.institution} {c.programme}"))
            prog = conn.execute(
                """
                insert into programs (institution_id, slug, title, level, official_url, coverage_tier, published,
                                      verification_method)
                values (%s, %s, %s, %s, %s, 'extracted', true, 'automated_extraction') returning id
                """,
                (
                    inst["id"],
                    slug,
                    c.programme,
                    c.level,
                    c.url,
                ),
            ).fetchone()
        assert prog is not None
        if prog["id"] not in ids:
            ids.append(prog["id"])
    conn.commit()
    return ids
