"""Gemini candidate fallback: only candidates on the institution's own host become courses."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.enrich.candidates import Candidate, create_from_candidates, host_matches_domain, propose_candidates

from .conftest import FakeGenai, FakeGenaiResponse


def test_host_matches_exact_and_subdomain() -> None:
    assert host_matches_domain("https://tum.de/en/studies", "tum.de")
    assert host_matches_domain("https://www.tum.de/en/studies", "tum.de")
    assert host_matches_domain("https://www.cit.tum.de/", "TUM.de")


@pytest.mark.parametrize(
    "url",
    [
        "https://tum.de.evil.com/x",
        "https://evil-tum.de/x",
        "https://tum.de@evil.com/x",
        "https://evil.com/tum.de",
        "ftp://tum.de/x",
        "not a url",
    ],
)
def test_lookalike_hosts_rejected(url: str) -> None:
    assert not host_matches_domain(url, "tum.de")


@pytest.fixture
def tag() -> Iterator[str]:
    yield uuid.uuid4().hex[:8]


def candidate(tag: str, **overrides: str) -> Candidate:
    data = {
        "institution": f"Candidate University {tag}",
        "programme": "MSc Robotics",
        "level": "master",
        "country": "DE",
        "url": f"https://www.cand-{tag}.example.org/robotics",
        "domain": f"cand-{tag}.example.org",
    }
    return Candidate(**{**data, **overrides})


def test_create_skips_bad_host_and_duplicates(worker: Connection, operator: Connection, tag: str) -> None:
    good = candidate(tag)
    bad = candidate(tag, programme="MSc Evil", url=f"https://cand-{tag}.example.org.evil.com/x")
    invalid_level = candidate(tag, programme="Weird", level="wizardry")
    try:
        ids = create_from_candidates(worker, [good, good, bad, invalid_level])
        assert len(ids) == 1
        row = operator.execute(
            """
            select p.coverage_tier, p.published, p.official_url, i.official_domain
            from programs p join institutions i on i.id = p.institution_id where p.id = %s
            """,
            (ids[0],),
        ).fetchone()
        assert row == {
            "coverage_tier": "extracted",
            "published": True,
            "official_url": good.url,
            "official_domain": good.domain,
        }
        # A second search proposing the same course reuses it instead of adding another.
        assert create_from_candidates(worker, [good]) == ids
        n = operator.execute(
            "select count(*) as n from programs p join institutions i on i.id = p.institution_id where i.official_domain = %s",
            (good.domain,),
        ).fetchone()
        assert n == {"n": 1}
    finally:
        operator.execute("delete from institutions where official_domain = %s", (good.domain,))
        operator.commit()


def test_snapshot_is_the_only_profile_data_sent() -> None:
    reply = json.dumps({"candidates": []})
    client = FakeGenai(FakeGenaiResponse(reply))
    snapshot = {
        "target_countries": ["DE"],
        "target_levels": ["master"],
        "target_fields": ["computer_science"],
        "email": "student@example.com",
        "name": "Asha Rao",
    }
    assert propose_candidates(client, "gemini-test", snapshot, limit=5) == []  # type: ignore[arg-type]
    prompt = client.models.calls[0]["contents"]
    assert "DE" in prompt and "master" in prompt and "computer_science" in prompt
    assert "student@example.com" not in prompt and "Asha" not in prompt


def test_propose_drops_countries_outside_the_snapshot_and_survives_errors() -> None:
    reply = json.dumps(
        {
            "candidates": [
                candidate("a").model_dump(),
                candidate("b", country="FR").model_dump(),
            ]
        }
    )
    snapshot = {"target_countries": ["DE"], "target_levels": ["master"], "target_fields": []}
    found = propose_candidates(FakeGenai(FakeGenaiResponse(reply)), "gemini-test", snapshot, limit=5)  # type: ignore[arg-type]
    assert [c.country for c in found] == ["DE"]
    assert propose_candidates(FakeGenai(RuntimeError("down")), "gemini-test", snapshot, limit=5) == []  # type: ignore[arg-type]
