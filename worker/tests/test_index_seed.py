"""Index seed files: shape, official-domain rule, and loading as inactive until a person has verified them."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from uniguide_worker.db import Connection
from uniguide_worker.index.seed import INDEX_ROOT, IndexSeed, SeedError, load_indexes, read_index_seeds


def seed(**overrides: Any) -> IndexSeed:
    data: dict[str, Any] = {
        "institution": "Index Test University",
        "country": "US",
        "official_domain": "idx-test.example.org",
        "indexes": [{"url": "https://www.idx-test.example.org/programs"}],
    }
    return IndexSeed.model_validate({**data, **overrides})


def test_shipped_us_seeds_are_valid_and_cover_thirty_universities() -> None:
    seeds = read_index_seeds(INDEX_ROOT / "us")
    assert len(seeds) == 30
    assert len({s.official_domain for _, s in seeds}) == 30
    assert all(s.country == "US" for _, s in seeds)


def test_nothing_ships_verified_before_a_person_has_checked_it() -> None:
    for path, s in read_index_seeds(INDEX_ROOT):
        assert all(i.verified_by is None for i in s.indexes), f"{path} claims a check nobody did"


def test_every_index_url_is_on_the_institutions_own_domain() -> None:
    with pytest.raises(ValidationError, match="official domain"):
        seed(indexes=[{"url": "https://evil.example.com/programs"}])
    with pytest.raises(ValidationError, match="official domain"):
        seed(indexes=[{"url": "https://idx-test.example.org.evil.com/programs"}])


def test_a_verification_needs_both_the_name_and_the_date() -> None:
    with pytest.raises(ValidationError, match="verified_by and verified_at"):
        seed(indexes=[{"url": "https://idx-test.example.org/p", "verified_by": "A. Person"}])
    ok = seed(
        indexes=[{"url": "https://idx-test.example.org/p", "verified_by": "A. Person", "verified_at": "2026-10-29"}]
    )
    assert ok.indexes[0].verified


def test_bad_files_name_the_file(tmp_path: Path) -> None:
    (tmp_path / "bad.yaml").write_text("institution: X\ncountry: US\n")
    with pytest.raises(SeedError, match=r"bad\.yaml"):
        read_index_seeds(tmp_path)


@pytest.fixture
def cleanup(operator: Connection) -> Iterator[list[str]]:
    domains: list[str] = []
    yield domains
    for d in domains:
        operator.execute("delete from institutions where official_domain = %s", (d,))
    operator.commit()


def test_unverified_index_loads_inactive_and_verified_loads_active(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    s = seed(
        institution=f"Index U {tag}",
        official_domain=domain,
        indexes=[
            {"url": f"https://{domain}/unchecked"},
            {"url": f"https://{domain}/checked", "verified_by": "A. Person", "verified_at": "2026-10-29"},
        ],
    )
    report = load_indexes(operator, [s])
    assert report.institutions_new == 1 and report.indexes_new == 2 and report.indexes_active == 1
    rows = operator.execute(
        "select url, active from institution_indexes ix join institutions i on i.id = ix.institution_id "
        "where i.official_domain = %s order by url",
        (domain,),
    ).fetchall()
    assert [(r["url"].rsplit("/", 1)[1], r["active"]) for r in rows] == [("checked", True), ("unchecked", False)]


def test_loading_twice_changes_nothing_and_reuses_the_institution(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    existing = operator.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'US', %s) returning id",
        (f"Index U {tag}", domain),
    ).fetchone()
    operator.commit()
    s = seed(institution=f"A Different Name {tag}", official_domain=domain, indexes=[{"url": f"https://{domain}/p"}])
    first = load_indexes(operator, [s])
    second = load_indexes(operator, [s])
    assert first.institutions_new == 0 and first.indexes_new == 1
    assert second.indexes_new == 0
    n = operator.execute("select count(*) as n from institutions where official_domain = %s", (domain,)).fetchone()
    assert n == {"n": 1} and existing


def test_a_later_unverified_file_switches_the_index_off(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    url = f"https://{domain}/p"
    load_indexes(
        operator,
        [
            seed(
                institution=f"Index U {tag}",
                official_domain=domain,
                indexes=[{"url": url, "verified_by": "A", "verified_at": "2026-10-29"}],
            )
        ],
    )
    load_indexes(operator, [seed(institution=f"Index U {tag}", official_domain=domain, indexes=[{"url": url}])])
    row = operator.execute("select active from institution_indexes where url = %s", (url,)).fetchone()
    assert row == {"active": False}


def _inst(operator: Connection, name: str, domain: str | None) -> Any:
    row = operator.execute(
        "insert into institutions (name, country, official_domain) values (%s, 'US', %s) returning id", (name, domain)
    ).fetchone()
    operator.commit()
    assert row
    return row["id"]


def test_a_www_domain_recorded_by_a_register_still_matches(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(f"www.{domain}")
    cleanup.append(domain)
    _inst(operator, f"Register Name {tag}", f"www.{domain}")
    report = load_indexes(
        operator,
        [seed(institution=f"Seed Name {tag}", official_domain=domain, indexes=[{"url": f"https://{domain}/p"}])],
    )
    assert report.institutions_new == 0


def test_a_recorded_subdomain_is_widened_to_the_seed_domain(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    cleanup.append(f"campus.{domain}")
    inst = _inst(operator, f"Index U {tag}", f"campus.{domain}")
    load_indexes(
        operator,
        [seed(institution=f"Index U {tag}", official_domain=domain, indexes=[{"url": f"https://grad.{domain}/p"}])],
    )
    row = operator.execute("select official_domain from institutions where id = %s", (inst,)).fetchone()
    assert row == {"official_domain": domain}


def test_a_recorded_domain_unrelated_to_the_seed_is_an_error(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    cleanup.append(f"other-{tag}.example.org")
    _inst(operator, f"Index U {tag}", f"other-{tag}.example.org")
    with pytest.raises(SeedError, match="differs"):
        load_indexes(
            operator,
            [
                seed(
                    institution=f"Index U {tag}",
                    official_domain=f"idx-{tag}.example.org",
                    indexes=[{"url": f"https://idx-{tag}.example.org/p"}],
                )
            ],
        )


def test_the_row_with_the_matching_domain_beats_a_same_name_row_without_one(
    operator: Connection, cleanup: list[str]
) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    nameless = _inst(operator, f"Index U {tag}", None)
    right = _inst(operator, f"Something Else {tag}", domain)
    load_indexes(
        operator, [seed(institution=f"Index U {tag}", official_domain=domain, indexes=[{"url": f"https://{domain}/p"}])]
    )
    owner = operator.execute(
        "select institution_id from institution_indexes where url = %s", (f"https://{domain}/p",)
    ).fetchone()
    assert owner == {"institution_id": right}
    unchanged = operator.execute("select official_domain from institutions where id = %s", (nameless,)).fetchone()
    assert unchanged == {"official_domain": None}
    operator.execute("delete from institutions where id = %s", (nameless,))
    operator.commit()


def test_urls_removed_from_the_file_are_switched_off(operator: Connection, cleanup: list[str]) -> None:
    tag = uuid.uuid4().hex[:8]
    domain = f"idx-{tag}.example.org"
    cleanup.append(domain)
    both = [
        {"url": f"https://{domain}/one", "verified_by": "A", "verified_at": "2026-10-29"},
        {"url": f"https://{domain}/two", "verified_by": "A", "verified_at": "2026-10-29"},
    ]
    load_indexes(operator, [seed(institution=f"Index U {tag}", official_domain=domain, indexes=both)])
    load_indexes(operator, [seed(institution=f"Index U {tag}", official_domain=domain, indexes=both[:1])])
    rows = operator.execute(
        "select url, active from institution_indexes where url like %s order by url", (f"https://{domain}/%",)
    ).fetchall()
    assert [(r["url"].rsplit("/", 1)[1], r["active"]) for r in rows] == [("one", True), ("two", False)]
