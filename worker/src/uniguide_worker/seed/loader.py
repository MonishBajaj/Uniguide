"""Load hand-verified courses from data/seed/courses/**/*.yaml.

Real entries go through the same path as everything else: a fact version, then
promote_fact_version with method seed_manual. Placeholder files load as unverified and
unpublished, and the loader refuses to put them into a hosted database at all.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, time
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import jsonschema
import yaml
from psycopg.types.json import Jsonb

from ..config import REPO_ROOT
from ..db import Connection
from ..fetch.fetcher import is_blocked
from ..proposals import deadline_proposal
from ..validate.checks import CycleInfo

SCHEMA = json.loads((Path(__file__).with_name("schema.json")).read_text())
SEED_ROOT = REPO_ROOT / "data" / "seed" / "courses"
PLACEHOLDER_ROOT = REPO_ROOT / "data" / "seed" / "placeholders"
PLACEHOLDER_OWNER = "PLACEHOLDER - illustrative data, not verified"


class SeedError(Exception):
    pass


@dataclass
class SeedReport:
    files: int = 0
    placeholders: int = 0
    facts_new: int = 0
    facts_skipped: int = 0
    errors: list[str] = field(default_factory=list)


def read_seed_files(*roots: Path) -> list[tuple[Path, dict[str, Any]]]:
    out = []
    for root in roots:
        for path in sorted(root.rglob("*.yaml")) + sorted(root.rglob("*.yml")):
            # YAML turns bare dates into date objects; validate and load the JSON-shaped document.
            doc = json.loads(json.dumps(yaml.safe_load(path.read_text(encoding="utf-8")), default=str))
            try:
                jsonschema.validate(doc, SCHEMA, format_checker=jsonschema.FormatChecker())
            except jsonschema.ValidationError as exc:
                raise SeedError(f"{path}: {exc.message} at {'/'.join(map(str, exc.absolute_path))}") from exc
            out.append((path, doc))
    return out


def check_placeholders(docs: list[tuple[Path, dict[str, Any]]], *, hosted: bool) -> None:
    if hosted:
        placeholders = [str(p) for p, d in docs if d.get("placeholder")]
        if placeholders:
            raise SeedError("Refusing to load placeholder courses into a hosted database: " + ", ".join(placeholders))


def _host_matches(host: str, domain: str) -> bool:
    domain = domain.lower().lstrip(".")
    return host == domain or host.endswith("." + domain)


def check_sources(docs: list[tuple[Path, dict[str, Any]]]) -> None:
    """Real files cite only the institution's official domains, never an aggregator."""
    problems: list[str] = []
    for path, doc in docs:
        if doc.get("placeholder"):
            continue
        inst = doc["institution"]
        if not inst.get("official_domain"):
            problems.append(f"{path}: institution needs official_domain")
            continue
        allowed = [inst["official_domain"], *inst.get("extra_official_domains", [])]
        for cycle in doc["cycles"]:
            for fact in cycle["facts"]:
                url = fact["source_url"]
                host = (urlsplit(url).hostname or "").lower()
                if is_blocked(url):
                    problems.append(f"{path}: {host} is a blocked source ({url})")
                elif not any(_host_matches(host, d) for d in allowed):
                    problems.append(f"{path}: {host} is not an official domain ({url})")
    if problems:
        raise SeedError("; ".join(problems))


def _seed_key(slug: str, cycle: str, fact: dict[str, Any]) -> str:
    payload = json.dumps(
        [slug, cycle, fact["subject"], fact["fields"], fact["source_url"]], sort_keys=True, default=str
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _upsert_institution(conn: Connection, inst: dict[str, Any], source_owner_note: str | None) -> UUID:
    ids = inst.get("ids") or {}
    for column in ("ror_id", "ipeds_unitid", "ukprn", "cricos_provider_code"):
        if column in ids:
            row = conn.execute(f"select id from institutions where {column} = %s", (ids[column],)).fetchone()
            if row:
                return UUID(str(row["id"]))
    row = conn.execute(
        "select id from institutions where lower(name) = lower(%s) and country = %s", (inst["name"], inst["country"])
    ).fetchone()
    if row:
        return UUID(str(row["id"]))
    row = conn.execute(
        """
        insert into institutions (name, country, city, region, official_domain, ror_id, ipeds_unitid, ukprn,
                                  cricos_provider_code, verification_method)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'seed_manual')
        returning id
        """,
        (
            inst["name"],
            inst["country"],
            inst.get("city"),
            inst.get("region"),
            inst.get("official_domain"),
            ids.get("ror_id"),
            ids.get("ipeds_unitid"),
            ids.get("ukprn"),
            ids.get("cricos_provider_code"),
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def _upsert_program(conn: Connection, institution_id: UUID, prog: dict[str, Any], publish: bool) -> UUID:
    row = conn.execute(
        """
        insert into programs (institution_id, slug, title, level, isced_level, isced_f, cip, field_label, track,
                              delivery_mode, duration_months, required_credits, credit_system,
                              languages_of_instruction, official_url, published, verification_method)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, 'on_campus')::delivery_mode, %s, %s, %s,
                coalesce(%s, '{en}'::text[]), %s, %s, 'seed_manual')
        on conflict (slug) do update set
          title = excluded.title, level = excluded.level, isced_level = excluded.isced_level,
          isced_f = excluded.isced_f, cip = excluded.cip, field_label = excluded.field_label,
          track = excluded.track, delivery_mode = excluded.delivery_mode,
          duration_months = excluded.duration_months, required_credits = excluded.required_credits,
          credit_system = excluded.credit_system, languages_of_instruction = excluded.languages_of_instruction,
          official_url = excluded.official_url, published = excluded.published
        returning id
        """,
        (
            institution_id,
            prog["slug"],
            prog["title"],
            prog["level"],
            prog.get("isced_level"),
            prog.get("isced_f"),
            prog.get("cip"),
            prog.get("field_label"),
            prog.get("track"),
            prog.get("delivery_mode"),
            prog.get("duration_months"),
            prog.get("required_credits"),
            prog.get("credit_system"),
            prog.get("languages_of_instruction"),
            prog.get("official_url"),
            publish,
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def _upsert_cycle(conn: Connection, program_id: UUID, cycle: dict[str, Any]) -> UUID:
    row = conn.execute(
        """
        insert into program_cycles (program_id, label, intake_year, intake_term, starts_on)
        values (%s, %s, %s, %s, %s)
        on conflict (program_id, label) do update
          set intake_year = excluded.intake_year, intake_term = excluded.intake_term, starts_on = excluded.starts_on
        returning id
        """,
        (program_id, cycle["label"], cycle["intake_year"], cycle["intake_term"], cycle.get("starts_on")),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))


def _fact_fields(
    fact: dict[str, Any], cycle: dict[str, Any], country: str, region: str | None = None
) -> tuple[dict[str, Any], list[str]]:
    fields = dict(fact["fields"])
    if fact["subject"] != "deadline":
        if fact["subject"] == "cost_item":
            fields.setdefault("low", fields.get("base"))
            fields.setdefault("high", fields.get("base"))
        return fields, []
    day = fields.pop("date")
    at = fields.pop("time", None)
    tz = fields.pop("timezone", None)
    starts_on = cycle.get("starts_on")
    proposal = deadline_proposal(
        day=day if isinstance(day, date) else date.fromisoformat(str(day)),
        at=time.fromisoformat(str(at)) if at else None,
        timezone=tz,
        country=country,
        quote=fact["evidence_quote"],
        cycle=CycleInfo(
            cycle["label"],
            cycle["intake_year"],
            starts_on if isinstance(starts_on, date) or starts_on is None else date.fromisoformat(str(starts_on)),
        ),
        page_text=None,  # the reviewer checked the page by hand
        extra=fields,
        region=region,
    )
    return proposal.proposed, [f"{i.code}: {i.message}" for i in proposal.issues if i.level == "error"]


def load(conn: Connection, roots: Sequence[Path], *, hosted: bool, publish_placeholders: bool = False) -> SeedReport:
    docs = read_seed_files(*roots)
    check_placeholders(docs, hosted=hosted)
    check_sources(docs)
    if hosted and publish_placeholders:
        raise SeedError("--publish-placeholders is for local development only")

    report = SeedReport()
    for path, doc in docs:
        placeholder = bool(doc.get("placeholder"))
        report.files += 1
        report.placeholders += placeholder
        inst = doc["institution"]
        institution_id = _upsert_institution(conn, inst, None)
        program_id = _upsert_program(
            conn, institution_id, doc["program"], publish=not placeholder or publish_placeholders
        )
        for cycle in doc["cycles"]:
            cycle_id = _upsert_cycle(conn, program_id, cycle)
            for fact in cycle["facts"]:
                key = _seed_key(doc["program"]["slug"], cycle["label"], fact)
                exists = conn.execute(
                    "select 1 from fact_versions where proposed ->> '_seed_key' = %s and review_state <> 'rejected'",
                    (key,),
                ).fetchone()
                if exists:
                    report.facts_skipped += 1
                    continue
                fields, errors = _fact_fields(fact, cycle, inst["country"], inst.get("region"))
                if errors:
                    report.errors += [f"{path.name}: {e}" for e in errors]
                    continue
                version_id = _insert_version(conn, fact, fields, key, cycle_id, inst["name"], placeholder)
                if placeholder:
                    if publish_placeholders:
                        conn.execute("select public.publish_extracted_version(%s)", (version_id,))
                else:
                    conn.execute(
                        "select public.promote_fact_version(%s, %s, 'seed_manual', %s, %s)",
                        (version_id, fact.get("status", "verified"), str(fact["verified_at"]), fact["verified_by"]),
                    )
                report.facts_new += 1
    if report.errors:
        conn.rollback()
        raise SeedError("Seed files have invalid facts:\n" + "\n".join(report.errors))
    conn.commit()
    return report


def _insert_version(
    conn: Connection,
    fact: dict[str, Any],
    fields: dict[str, Any],
    key: str,
    cycle_id: UUID,
    institution_name: str,
    placeholder: bool,
) -> UUID:
    source = conn.execute(
        """
        insert into sources (url, owner, rights_note, robots_ok, fetched_at)
        values (%s, %s, %s, true, %s)
        on conflict (url, coalesce(content_hash, '')) do update set owner = excluded.owner
        returning id
        """,
        (
            fact["source_url"],
            PLACEHOLDER_OWNER if placeholder else institution_name,
            "Checked by hand on the official page; facts and short quotes only.",
            str(fact["verified_at"]),
        ),
    ).fetchone()
    assert source is not None
    row = conn.execute(
        """
        insert into fact_versions (subject, cycle_id, proposed, evidence, evidence_quote, source_id, created_by)
        values (%s, %s, %s, %s, %s, %s, 'seed')
        returning id
        """,
        (
            fact["subject"],
            cycle_id,
            Jsonb({**json.loads(json.dumps(fields, default=str)), "_seed_key": key}),
            Jsonb({"quote": fact["evidence_quote"], "verified_by": fact["verified_by"]}),
            fact["evidence_quote"],
            source["id"],
        ),
    ).fetchone()
    assert row is not None
    return UUID(str(row["id"]))
