import shutil
from pathlib import Path
from typing import Any

import pytest

from uniguide_worker.seed.loader import (
    PLACEHOLDER_ROOT,
    SEED_ROOT,
    SeedError,
    check_placeholders,
    check_sources,
    read_seed_files,
)

SEEDS = PLACEHOLDER_ROOT


def test_repository_seed_files_are_valid() -> None:
    docs = read_seed_files(SEEDS)
    assert len(docs) >= 6
    countries = {d["institution"]["country"] for _, d in docs}
    assert {"US", "GB", "CA", "AU", "DE", "IE"} <= countries


def test_placeholders_never_load_into_a_hosted_database() -> None:
    docs = read_seed_files(SEEDS)
    check_placeholders(docs, hosted=False)
    with pytest.raises(SeedError, match="placeholder"):
        check_placeholders(docs, hosted=True)


def test_placeholder_files_use_reserved_example_domains() -> None:
    for path, doc in read_seed_files(SEEDS):
        if doc.get("placeholder"):
            urls = [f["source_url"] for c in doc["cycles"] for f in c["facts"]]
            assert all(".example.org/" in u for u in urls), path


def test_facts_without_evidence_are_rejected(tmp_path: Path) -> None:
    (tmp_path / "bad.yaml").write_text(
        """
institution: {name: X University, country: GB}
program: {slug: x-msc, title: MSc X, level: master}
cycles:
  - label: 2027-autumn
    intake_year: 2027
    intake_term: autumn
    facts:
      - subject: deadline
        fields: {date: 2027-06-30}
        source_url: https://x.example.org
        verified_by: me
        verified_at: 2026-10-28
"""
    )
    with pytest.raises(SeedError, match="evidence_quote"):
        read_seed_files(tmp_path)


def test_real_folder_rejects_placeholder_files(tmp_path: Path) -> None:
    shutil.copy(next(PLACEHOLDER_ROOT.rglob("*.yaml")), tmp_path / "x.yaml")
    with pytest.raises(SeedError, match="placeholder"):
        check_placeholders(read_seed_files(tmp_path), hosted=True)


def test_repository_real_folder_holds_no_placeholders() -> None:
    check_placeholders(read_seed_files(SEED_ROOT), hosted=True)


def test_read_seed_files_reads_several_roots() -> None:
    both = read_seed_files(SEED_ROOT, PLACEHOLDER_ROOT)
    assert len(both) == len(read_seed_files(SEED_ROOT)) + len(read_seed_files(PLACEHOLDER_ROOT))


def _doc(official_domain: str | None, url: str, extra: list[str] | None = None) -> tuple[Path, dict[str, Any]]:
    inst: dict[str, Any] = {"name": "X University", "country": "GB"}
    if official_domain:
        inst["official_domain"] = official_domain
    if extra:
        inst["extra_official_domains"] = extra
    fact = {"subject": "deadline", "fields": {}, "source_url": url}
    doc = {"institution": inst, "program": {"slug": "x"}, "cycles": [{"label": "2027-autumn", "facts": [fact]}]}
    return Path("courses/gb/x.yaml"), doc


def test_blocked_aggregator_sources_are_rejected() -> None:
    with pytest.raises(SeedError, match=r"yocket\.com"):
        check_sources([_doc("uni.ac.uk", "https://yocket.com/uni/msc")])


def test_sources_off_the_official_domain_are_rejected() -> None:
    with pytest.raises(SeedError, match="not an official domain"):
        check_sources([_doc("uni.ac.uk", "https://other.edu/msc")])


def test_real_files_need_an_official_domain() -> None:
    with pytest.raises(SeedError, match="official_domain"):
        check_sources([_doc(None, "https://uni.ac.uk/msc")])


def test_subdomains_and_declared_domains_pass() -> None:
    check_sources([_doc("uni.ac.uk", "https://finance.uni.ac.uk/fees")])
    check_sources([_doc("uni.ac.uk", "https://www.gov.uk/student-visa", extra=["gov.uk"])])


def test_lookalike_domains_do_not_pass() -> None:
    with pytest.raises(SeedError):
        check_sources([_doc("uni.ac.uk", "https://fakeuni.ac.uk/msc")])


def test_placeholders_are_skipped_by_the_source_check() -> None:
    path, doc = _doc(None, "https://x.example.org/p")
    check_sources([(path, {**doc, "placeholder": True})])
