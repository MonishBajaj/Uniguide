from datetime import date
from pathlib import Path
from typing import Any

from uniguide_worker.seed.status import seed_status

Doc = tuple[Path, dict[str, Any]]


def _course(
    country: str, deadline_verified: str = "2026-10-30", second_checked: str | None = None, placeholder: bool = False
) -> Doc:
    fact: dict[str, Any] = {"subject": "deadline", "fields": {}, "verified_at": deadline_verified}
    if second_checked:
        fact["second_checked_at"] = second_checked
    slug = f"{country.lower()}-{deadline_verified}-{second_checked}-{placeholder}"
    doc: dict[str, Any] = {
        "institution": {"country": country},
        "program": {"slug": slug},
        "cycles": [{"label": "2027-autumn", "facts": [fact]}],
    }
    if placeholder:
        doc["placeholder"] = True
    return Path(f"courses/{slug}.yaml"), doc


def test_counts_real_courses_by_country() -> None:
    docs = [_course("GB"), _course("GB", "2026-10-29"), _course("US"), _course("DE", placeholder=True)]
    s = seed_status(docs, date(2026, 11, 2))
    assert (s.total, s.by_country, s.target) == (3, {"GB": 2, "US": 1}, 50)


def test_stale_boundary_is_thirty_days() -> None:
    fresh = _course("GB", deadline_verified="2026-10-03")
    stale = _course("US", deadline_verified="2026-10-02")
    result = seed_status([fresh, stale], date(2026, 11, 2))
    assert [f.slug for f in result.stale] == [stale[1]["program"]["slug"]]


def test_later_second_look_refreshes_a_deadline() -> None:
    doc = _course("GB", deadline_verified="2026-09-01", second_checked="2026-10-20")
    assert seed_status([doc], date(2026, 11, 2)).stale == []
