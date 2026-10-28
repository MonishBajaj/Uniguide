"""Faculty for research degrees from OpenAlex (CC0): researchers whose last known institution is
the university, their topics and a few recent works. Needs institutions.ror_id (see ror-match).

Written to the documented OpenAlex API shape; OpenAlex now requires an API key for regular use
(OPENALEX_API_KEY). Confirm against a live response before a large import.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import httpx
from psycopg.types.json import Jsonb

from ..db import Connection
from ..embeddings import embed
from ..fetch.ratelimit import HostRateLimiter
from .base import ImportStats, register_source

API = "https://api.openalex.org"
RIGHTS = "OpenAlex, CC0."

# ISCED-F broad field -> OpenAlex fields, used to keep researchers relevant to the course.
ISCED_TO_OPENALEX = {
    "01": ["Social Sciences", "Psychology"],
    "02": ["Arts and Humanities"],
    "03": ["Social Sciences", "Psychology"],
    "04": ["Business, Management and Accounting", "Economics, Econometrics and Finance", "Decision Sciences"],
    "05": ["Mathematics", "Physics and Astronomy", "Chemistry", "Biochemistry, Genetics and Molecular Biology",
           "Environmental Science", "Earth and Planetary Sciences", "Agricultural and Biological Sciences"],
    "06": ["Computer Science"],
    "07": ["Engineering", "Materials Science", "Chemical Engineering", "Energy"],
    "08": ["Agricultural and Biological Sciences", "Veterinary"],
    "09": ["Medicine", "Nursing", "Health Professions", "Pharmacology, Toxicology and Pharmaceutics", "Dentistry",
           "Neuroscience", "Immunology and Microbiology"],
    "10": ["Social Sciences"],
}  # fmt: skip


def openalex_fields(isced_f: str | None) -> list[str]:
    return ISCED_TO_OPENALEX.get((isced_f or "")[:2], [])


def parse_author(author: dict[str, Any]) -> dict[str, Any]:
    topics = [
        {
            "name": t.get("display_name"),
            "field": (t.get("field") or {}).get("display_name"),
            "subfield": (t.get("subfield") or {}).get("display_name"),
            "count": t.get("count"),
        }
        for t in (author.get("topics") or [])[:8]
    ]
    return {
        "openalex_id": author["id"],
        "name": author["display_name"],
        "orcid": author.get("orcid"),
        "works_count": author.get("works_count"),
        "cited_by_count": author.get("cited_by_count"),
        "topics": topics,
        "fields": sorted({t["field"] for t in topics if t["field"]}),
    }


def parse_works(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"title": w.get("title"), "year": w.get("publication_year"), "doi": w.get("doi"), "openalex_id": w.get("id")}
        for w in payload.get("results", [])
        if w.get("title")
    ]


def research_text(profile: dict[str, Any]) -> str:
    parts = [t["name"] for t in profile["topics"] if t["name"]] + [w["title"] for w in profile["recent_works"]]
    return ". ".join(parts)


def run(
    conn: Connection,
    *,
    institution_id: str,
    contact: str,
    isced_f: str | None = None,
    limit: int = 40,
    client: httpx.Client | None = None,
) -> ImportStats:
    client = client or httpx.Client(timeout=30.0)
    limiter = HostRateLimiter(min_interval=0.2)
    stats = ImportStats()
    inst = conn.execute("select id, name, ror_id from institutions where id = %s", (institution_id,)).fetchone()
    if inst is None or not inst["ror_id"]:
        stats.notes.append("Institution has no ROR id; run `import ror-match` first")
        return stats

    params: dict[str, str | int] = {"mailto": contact}
    if os.environ.get("OPENALEX_API_KEY"):
        params["api_key"] = os.environ["OPENALEX_API_KEY"]

    def get(path: str, **extra: str | int) -> dict[str, Any]:
        limiter.wait("api.openalex.org")
        response = client.get(f"{API}{path}", params={**params, **extra})
        response.raise_for_status()
        return dict(response.json())

    authors = get(
        "/authors",
        filter=f"last_known_institutions.ror:{inst['ror_id']},works_count:>5",
        sort="cited_by_count:desc",
        per_page=min(limit * 2, 200),
        select="id,display_name,orcid,works_count,cited_by_count,topics",
    )
    wanted = set(openalex_fields(isced_f))
    profiles = [parse_author(a) for a in authors.get("results", [])]
    if wanted:
        profiles = [p for p in profiles if wanted & set(p["fields"])]
    profiles = profiles[:limit]

    for p in profiles:
        works = get(
            "/works",
            filter=f"author.id:{p['openalex_id'].rsplit('/', 1)[-1]},from_publication_date:2021-01-01",
            sort="publication_date:desc",
            per_page=5,
            select="id,title,publication_year,doi",
        )
        p["recent_works"] = parse_works(works)
        p["research_text"] = research_text(p)

    embedded = embed([p["research_text"] for p in profiles])
    vectors: list[list[float] | None] = list(embedded) if embedded else [None] * len(profiles)
    source_id = register_source(
        conn,
        url=f"{API}/authors?filter=last_known_institutions.ror:{inst['ror_id']}",
        owner="OpenAlex",
        rights_note=RIGHTS,
        content_hash=hashlib.sha256(json.dumps([p["openalex_id"] for p in profiles]).encode()).hexdigest(),
    )
    for p, vector in zip(profiles, vectors, strict=True):
        conn.execute(
            """
            insert into faculty_profiles (institution_id, openalex_id, name, orcid, works_count, cited_by_count, topics,
                                          fields, recent_works, research_text, embedding, source_id, fetched_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::extensions.vector, %s, now())
            on conflict (openalex_id) do update set
              institution_id = excluded.institution_id, name = excluded.name, orcid = excluded.orcid,
              works_count = excluded.works_count, cited_by_count = excluded.cited_by_count, topics = excluded.topics,
              fields = excluded.fields, recent_works = excluded.recent_works, research_text = excluded.research_text,
              embedding = coalesce(excluded.embedding, faculty_profiles.embedding), source_id = excluded.source_id,
              fetched_at = now()
            """,
            (
                inst["id"], p["openalex_id"], p["name"], p["orcid"], p["works_count"], p["cited_by_count"],
                Jsonb(p["topics"]), p["fields"], Jsonb(p["recent_works"]), p["research_text"],
                str(vector) if vector else None, source_id,
            ),
        )  # fmt: skip
        stats.programs += 1
    conn.commit()
    stats.notes.append(f"{stats.programs} researchers at {inst['name']}")
    return stats
