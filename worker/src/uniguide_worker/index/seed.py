"""Curated course-index pages: data/seed/indexes/<country>/<slug>.yaml.

An index is the official page where an institution lists its courses. It is crawled only after a person has
checked the URL (`verified_by` and `verified_at`); until then it loads switched off.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator, model_validator

from ..config import REPO_ROOT
from ..db import Connection
from ..enrich.candidates import DOMAIN, host_matches_domain

INDEX_ROOT = REPO_ROOT / "data" / "seed" / "indexes"


class SeedError(Exception):
    pass


class IndexEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    kind: str = "programs"
    verified_by: str | None = None
    verified_at: date | None = None

    @field_validator("url")
    @classmethod
    def _web_url(cls, v: str) -> str:
        if not re.match(r"^https?://", v):
            raise ValueError("url must start with http:// or https://")
        return v

    @model_validator(mode="after")
    def _both_or_neither(self) -> Self:
        if (self.verified_by is None) != (self.verified_at is None):
            raise ValueError("verified_by and verified_at go together")
        return self

    @property
    def verified(self) -> bool:
        return self.verified_by is not None


class IndexSeed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    institution: str
    country: str
    official_domain: str
    ror_id: str | None = None
    indexes: list[IndexEntry]

    @field_validator("country")
    @classmethod
    def _country(cls, v: str) -> str:
        if not re.match(r"^[A-Z]{2}$", v):
            raise ValueError("country is a two-letter code such as US")
        return v

    @field_validator("official_domain")
    @classmethod
    def _domain(cls, v: str) -> str:
        v = v.lower().strip()
        if not DOMAIN.match(v):
            raise ValueError("official_domain must be a plain domain name such as mit.edu")
        return v

    @model_validator(mode="after")
    def _urls_on_the_official_domain(self) -> Self:
        if not self.indexes:
            raise ValueError("list at least one index URL")
        for entry in self.indexes:
            if not host_matches_domain(entry.url, self.official_domain):
                raise ValueError(f"{entry.url} is not on the official domain {self.official_domain}")
        return self


def read_index_seeds(root: Path = INDEX_ROOT) -> list[tuple[Path, IndexSeed]]:
    out: list[tuple[Path, IndexSeed]] = []
    for path in sorted(root.rglob("*.yaml")):
        try:
            out.append((path, IndexSeed.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))))
        except (ValidationError, yaml.YAMLError, TypeError) as exc:
            raise SeedError(f"{path}: {exc}") from exc
    return out


@dataclass
class IndexLoadReport:
    institutions_new: int = 0
    indexes_new: int = 0
    indexes_active: int = 0


def _plain(domain: str) -> str:
    return domain.lower().strip().removeprefix("www.")


def load_indexes(conn: Connection, seeds: list[IndexSeed]) -> IndexLoadReport:
    """Upsert institutions and their index pages. The file is the source of truth for `active`."""
    report = IndexLoadReport()
    for s in seeds:
        inst = conn.execute(
            """
            select id, official_domain from institutions
            where regexp_replace(lower(official_domain), '^www\\.', '') = %(d)s
               or (%(ror)s::text is not null and ror_id = %(ror)s::text)
               or (country = %(c)s and lower(name) = lower(%(n)s))
            order by (regexp_replace(lower(coalesce(official_domain, '')), '^www\\.', '') = %(d)s) desc,
                     (ror_id is not distinct from %(ror)s::text) desc, created_at
            limit 1
            """,
            {"d": s.official_domain, "ror": s.ror_id, "c": s.country, "n": s.institution},
        ).fetchone()
        if inst is None:
            inst = conn.execute(
                """
                insert into institutions (name, country, official_domain, ror_id, verification_method)
                values (%s, %s, %s, %s, 'seed_manual') returning id
                """,
                (s.institution, s.country, s.official_domain, s.ror_id),
            ).fetchone()
            report.institutions_new += 1
        assert inst is not None
        recorded = _plain(inst["official_domain"]) if inst.get("official_domain") else None
        if recorded is None or recorded.endswith("." + s.official_domain):
            # A register often records one campus host; the seed's broader domain is the one to trust.
            conn.execute("update institutions set official_domain = %s where id = %s", (s.official_domain, inst["id"]))
        elif recorded != s.official_domain and not s.official_domain.endswith("." + recorded):
            raise SeedError(
                f"{s.institution}: the domain recorded in the database ({recorded}) differs from the seed's "
                f"({s.official_domain}); fix one of them before loading"
            )
        for entry in s.indexes:
            row = conn.execute(
                """
                insert into institution_indexes (institution_id, url, kind, active) values (%s, %s, %s, %s)
                on conflict (institution_id, url) do update set kind = excluded.kind, active = excluded.active
                returning (xmax = 0) as inserted
                """,
                (inst["id"], entry.url, entry.kind, entry.verified),
            ).fetchone()
            assert row is not None
            report.indexes_new += int(row["inserted"])
            report.indexes_active += int(entry.verified)
        # A URL taken out of the file must stop being crawled.
        conn.execute(
            "update institution_indexes set active = false where institution_id = %s and not (url = any(%s))",
            (inst["id"], [e.url for e in s.indexes]),
        )
    conn.commit()
    return report
