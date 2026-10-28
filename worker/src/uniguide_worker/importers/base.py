"""Shared pieces for official-register importers (the Listed tier)."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from ..db import Connection


class AccessPendingError(RuntimeError):
    """The register's owner has not yet granted reuse access."""


@dataclass
class ImportStats:
    institutions: int = 0
    programs: int = 0
    skipped: int = 0
    fees: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "institutions": self.institutions,
            "programs": self.programs,
            "skipped": self.skipped,
            "fees": self.fees,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class InstitutionRecord:
    name: str
    country: str
    id_column: str  # ror_id, ipeds_unitid, ukprn, cricos_provider_code, or register_id (stored in other_ids)
    id_value: str
    city: str | None = None
    official_domain: str | None = None
    region: str | None = None


@dataclass(frozen=True)
class ProgramRecord:
    slug: str
    title: str
    level: str
    isced_level: int | None
    isced_f: str | None
    cip: str | None
    field_label: str | None
    track: str | None
    duration_months: int | None
    languages: list[str]
    register_ids: dict[str, Any]
    official_url: str | None = None


def slugify(*parts: str, max_len: int = 120) -> str:
    text = unicodedata.normalize("NFKD", " ".join(parts)).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-")


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip().lower()
    url = re.sub(r"^https?://", "", url)
    return url.split("/")[0] or None


def upsert_institution(conn: Connection, rec: InstitutionRecord, source_id: UUID) -> UUID:
    if rec.id_column == "register_id":
        return _upsert_by_register_id(conn, rec, source_id)
    allowed = {"ror_id", "ipeds_unitid", "ukprn", "cricos_provider_code"}
    if rec.id_column not in allowed:
        raise ValueError(rec.id_column)
    row = conn.execute(
        f"""
        insert into institutions (name, country, city, region, official_domain, {rec.id_column}, source_id,
                                  verification_method)
        values (%s, %s, %s, %s, %s, %s, %s, 'official_register')
        on conflict ({rec.id_column}) where {rec.id_column} is not null do update
          set name = excluded.name, city = excluded.city, region = coalesce(excluded.region, institutions.region),
              official_domain = coalesce(excluded.official_domain, institutions.official_domain),
              source_id = excluded.source_id
        returning id
        """,
        (rec.name, rec.country, rec.city, rec.region, rec.official_domain, rec.id_value, source_id),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def _upsert_by_register_id(conn: Connection, rec: InstitutionRecord, source_id: UUID) -> UUID:
    """Countries whose register has no dedicated column: the national id lives in other_ids."""
    row = conn.execute(
        """
        insert into institutions (name, country, city, region, official_domain, other_ids, source_id,
                                  verification_method)
        values (%s, %s, %s, %s, %s, %s, %s, 'official_register')
        on conflict (country, (other_ids ->> 'register_id')) where other_ids ? 'register_id' do update
          set name = excluded.name, city = coalesce(excluded.city, institutions.city),
              region = coalesce(excluded.region, institutions.region),
              official_domain = coalesce(excluded.official_domain, institutions.official_domain),
              source_id = excluded.source_id
        returning id
        """,
        (rec.name, rec.country, rec.city, rec.region, rec.official_domain, Jsonb({"register_id": rec.id_value}),
         source_id),
    ).fetchone()  # fmt: skip
    assert row is not None
    return UUID(str(row["id"]))


def upsert_program(conn: Connection, institution_id: UUID, rec: ProgramRecord, source_id: UUID) -> UUID:
    row = conn.execute(
        """
        insert into programs (institution_id, slug, title, level, isced_level, isced_f, cip, field_label, track,
                              duration_months, languages_of_instruction, register_ids, official_url, published,
                              source_id, verification_method)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s, 'official_register')
        on conflict (slug) do update
          set title = excluded.title, level = excluded.level, isced_level = excluded.isced_level,
              isced_f = coalesce(programs.isced_f, excluded.isced_f), field_label = excluded.field_label,
              track = excluded.track, duration_months = excluded.duration_months,
              languages_of_instruction = excluded.languages_of_instruction,
              register_ids = programs.register_ids || excluded.register_ids, source_id = excluded.source_id
        returning id
        """,
        (
            institution_id,
            rec.slug,
            rec.title,
            rec.level,
            rec.isced_level,
            rec.isced_f,
            rec.cip,
            rec.field_label,
            rec.track,
            rec.duration_months,
            rec.languages,
            Jsonb(rec.register_ids),
            rec.official_url,
            source_id,
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def register_source(conn: Connection, *, url: str, owner: str, rights_note: str, content_hash: str | None) -> UUID:
    row = conn.execute(
        """
        insert into sources (url, owner, rights_note, robots_ok, fetched_at, content_hash)
        values (%s, %s, %s, true, now(), %s)
        on conflict (url, coalesce(content_hash, '')) do update set fetched_at = now()
        returning id
        """,
        (url, owner, rights_note, content_hash),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


Importer = Callable[..., ImportStats]
