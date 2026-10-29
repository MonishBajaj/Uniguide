"""Fallback for countries with no register: Gemini names courses, we keep only those on the institution's own site.

Gemini supplies the identity of a course (institution, programme, official URL) and nothing else. Every fact still
comes from reading the official page.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import httpx
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


# A DNS name ending in letters: rules out IP addresses (including link-local ones) and bare names like "localhost".
DOMAIN = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def _clean_domain(domain: str) -> str:
    return domain.lower().strip().removeprefix("www.")


def host_matches_domain(url: str, domain: str) -> bool:
    """True only when the URL's host is the institution's domain or one of its subdomains."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    domain = _clean_domain(domain)
    if parts.scheme not in ("https", "http") or not DOMAIN.match(domain):
        return False
    return host == domain or host.endswith("." + domain)


class RorVerifier:
    """Independent check that a university really uses a domain: the ROR registry must list it for that name."""

    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(timeout=15.0, headers={"User-Agent": "UniguideBot/0.1 (domain check)"})

    def __call__(self, institution: str, domain: str) -> bool:
        domain = _clean_domain(domain)
        if not DOMAIN.match(domain):
            return False
        try:
            response = self.client.get("https://api.ror.org/v2/organizations", params={"query": institution})
            response.raise_for_status()
            items = response.json().get("items", [])[:5]
        except (httpx.HTTPError, ValueError):
            return False
        for item in items:
            known = [str(d) for d in item.get("domains", [])]
            known += [urlsplit(str(link.get("value", ""))).hostname or "" for link in item.get("links", [])]
            for k in map(_clean_domain, known):
                if k and (k == domain or k.endswith("." + domain) or domain.endswith("." + k)):
                    return True
        return False


_COUNTRY = re.compile(r"^[A-Z]{2}$")
_FIELD = re.compile(r"^[a-z0-9_]{1,40}$")


def propose_candidates(client: Any, model: str, snapshot: dict[str, Any], limit: int) -> list[Candidate]:
    """Ask Gemini for up to `limit` courses. Only the profile snapshot's targets are sent; errors give no candidates."""
    # Only well-formed codes reach the prompt; free text in a profile cannot steer the model.
    levels_ok = {level.value for level in ProgramLevel}
    countries = [c for c in map(str, snapshot.get("target_countries", [])) if _COUNTRY.match(c)]
    levels = [x for x in map(str, snapshot.get("target_levels", [])) if x in levels_ok]
    fields = [f for f in map(str, snapshot.get("target_fields", [])) if _FIELD.match(f)]
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


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:80]


def unique_slug(conn: Connection, base: str) -> str:
    slug, n = base, 2
    while conn.execute("select 1 from programs where slug = %s", (slug,)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def create_from_candidates(
    conn: Connection,
    candidates: list[Candidate],
    *,
    verify_domain: Callable[[str, str], bool] | None = None,
) -> list[UUID]:
    """Add the accepted candidates to the catalog and return their program ids (existing courses are reused).

    Gemini's own claim about a domain is never enough. A known institution keeps the domain recorded for it; any
    other institution must be confirmed by `verify_domain` (the ROR registry by default).
    """
    verify = verify_domain or RorVerifier()
    levels = {level.value for level in ProgramLevel}
    ids: list[UUID] = []
    for c in candidates:
        if c.level not in levels or not host_matches_domain(c.url, c.domain):
            continue
        country = c.country.upper()
        domain = _clean_domain(c.domain)
        inst = conn.execute(
            """
            select id, official_domain from institutions
            where country = %s and (official_domain = %s or lower(name) = lower(%s)) limit 1
            """,
            (country, domain, c.institution),
        ).fetchone()
        recorded = inst["official_domain"] if inst else None
        if recorded:
            if not host_matches_domain(c.url, recorded):
                continue
        elif not verify(c.institution, domain):
            continue
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
            slug = unique_slug(conn, slugify(f"{c.institution} {c.programme}"))
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
