"""The seed loader against the local database."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.seed.loader import PLACEHOLDER_ROOT, SeedError, load

TEMPLATE = """
institution: {{name: "{name}", country: GB, official_domain: recheck-test.ac.uk}}
program: {{slug: "{slug}", title: MSc Recheck, level: master, delivery_mode: on_campus, duration_months: 12}}
cycles:
  - label: 2027-autumn
    intake_year: 2027
    intake_term: autumn
    starts_on: 2027-09-20
    facts:
      - subject: deadline
        fields: {{date: 2027-06-30, kind: application, owning_system: direct, original_text: "30 June 2027", applicant_category: international}}
        source_url: https://recheck-test.ac.uk/apply
        evidence_quote: "International applicants should apply by 30 June 2027."
        verified_by: Harman
        verified_at: {verified}
        second_checked_by: Asha
        second_checked_at: {verified}
"""


@pytest.fixture
def seed_dir(tmp_path: Path, operator: Connection) -> Iterator[tuple[Path, str]]:
    name = f"Recheck University {uuid.uuid4().hex[:8]}"
    yield tmp_path, name
    operator.execute("delete from institutions where name = %s", (name,))
    operator.commit()


def _write(root: Path, name: str, verified: str) -> None:
    (root / "x.yaml").write_text(TEMPLATE.format(name=name, slug=name.lower().replace(" ", "-"), verified=verified))


def _verified_at(conn: Connection, name: str) -> str:
    row = conn.execute(
        "select d.verified_at::date::text as v from deadlines d join program_cycles c on c.id = d.cycle_id "
        "join programs p on p.id = c.program_id join institutions i on i.id = p.institution_id where i.name = %s",
        (name,),
    ).fetchone()
    assert row
    return str(row["v"])


def test_reloading_after_a_recheck_refreshes_the_verified_date(
    seed_dir: tuple[Path, str], operator: Connection
) -> None:
    root, name = seed_dir
    _write(root, name, "2026-09-01")
    load(operator, [root], hosted=False)
    assert _verified_at(operator, name) == "2026-09-01"

    _write(root, name, "2026-10-20")
    report = load(operator, [root], hosted=False)

    assert report.facts_skipped == 1
    assert _verified_at(operator, name) == "2026-10-20"


def test_hosted_publish_placeholders_is_refused_before_any_write(operator: Connection) -> None:
    before = operator.execute("select count(*) as n from fact_versions").fetchone()
    with pytest.raises(SeedError, match="local development only"):
        load(operator, [PLACEHOLDER_ROOT], hosted=True, publish_placeholders=True)
    assert operator.execute("select count(*) as n from fact_versions").fetchone() == before
