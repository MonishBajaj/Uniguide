"""Deterministic checks on proposed facts. Findings are stored on the fact version.

level "error" blocks publication (the fact never reaches students unreviewed);
"warning" is shown to the reviewer.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .quotes import quote_in_text

# Currencies we expect on admissions pages (destinations plus main source countries).
KNOWN_CURRENCIES = frozenset(
    {
        "AED",
        "AUD",
        "BDT",
        "BRL",
        "CAD",
        "CHF",
        "CNY",
        "CZK",
        "DKK",
        "EGP",
        "EUR",
        "GBP",
        "HKD",
        "HUF",
        "IDR",
        "ILS",
        "INR",
        "JPY",
        "KES",
        "KRW",
        "LKR",
        "MXN",
        "MYR",
        "NGN",
        "NOK",
        "NPR",
        "NZD",
        "PHP",
        "PKR",
        "PLN",
        "QAR",
        "RUB",
        "SAR",
        "SEK",
        "SGD",
        "THB",
        "TRY",
        "TWD",
        "USD",
        "VND",
        "ZAR",
    }
)

# (min, max) per exam and version. TOEFL iBT moved to a 1-6 band scale on 2026-01-21.
SCORE_RANGES: dict[tuple[str, str | None], tuple[float, float]] = {
    ("ielts_academic", None): (0, 9),
    ("ielts_ukvi", None): (0, 9),
    ("toefl_ibt", "legacy"): (0, 120),
    ("toefl_ibt", "2026-01"): (1, 6),
    ("toefl_ibt_home", "legacy"): (0, 120),
    ("toefl_ibt_home", "2026-01"): (1, 6),
    ("pte_academic", None): (10, 90),
    ("duolingo", None): (10, 160),
    ("cambridge_c1_c2", None): (80, 230),
    ("gre", None): (260, 340),
    ("gmat", None): (205, 805),
    ("sat", None): (400, 1600),
    ("act", None): (1, 36),
}


@dataclass(frozen=True)
class Issue:
    level: str  # "error" | "warning"
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass(frozen=True)
class CycleInfo:
    label: str
    intake_year: int
    starts_on: date | None


def check_quote(quote: str, page_text: str | None) -> list[Issue]:
    if page_text is None:
        return []
    if not quote_in_text(quote, page_text):
        return [Issue("error", "quote_not_found", "The evidence quote does not appear on the page.")]
    return []


def check_cycle(stated_year: int | None, cycle: CycleInfo) -> list[Issue]:
    if stated_year is None:
        return [Issue("warning", "cycle_not_stated", "The page does not say which intake this applies to.")]
    if stated_year != cycle.intake_year:
        return [
            Issue(
                "error",
                "cycle_mismatch",
                f"The page describes the {stated_year} intake, not {cycle.label}.",
            )
        ]
    return []


def check_timezone(tz: str | None) -> list[Issue]:
    if tz is None:
        return []
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return [Issue("error", "bad_timezone", f"Unknown time zone {tz!r}.")]
    return []


def check_deadline(due_at: datetime, cycle: CycleInfo) -> list[Issue]:
    """Application deadlines fall between about two years before the intake and its start."""
    earliest = date(cycle.intake_year - 2, 1, 1)
    latest = cycle.starts_on or date(cycle.intake_year, 12, 31)
    if not (earliest <= due_at.date() <= latest):
        return [
            Issue(
                "error",
                "date_outside_window",
                f"{due_at.date()} is outside the plausible window {earliest}..{latest} for {cycle.label}.",
            )
        ]
    return []


def check_cost(proposed: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    if proposed["currency"] not in KNOWN_CURRENCIES:
        issues.append(Issue("error", "unknown_currency", f"Currency {proposed['currency']!r} is not recognised."))
    if not (0 <= proposed["low"] <= proposed["base"] <= proposed["high"]):
        issues.append(Issue("error", "cost_order", "Costs must satisfy 0 <= low <= base <= high."))
    if proposed["base"] == 0 and proposed["kind"] == "tuition":
        issues.append(Issue("warning", "zero_tuition", "Tuition of zero; check whether fees are waived or missing."))
    return issues


def check_score(exam: str, version: str | None, value: float | None, what: str = "minimum") -> list[Issue]:
    if value is None:
        return []
    if exam.startswith("toefl"):
        ranges = {v: r for (e, v), r in SCORE_RANGES.items() if e == exam}
        if version in ranges:
            lo, hi = ranges[version]
        else:
            fits = [v for v, (lo_, hi_) in ranges.items() if lo_ <= value <= hi_]
            if not fits:
                return [Issue("error", "score_out_of_range", f"TOEFL {what} {value} fits neither scale.")]
            return [
                Issue(
                    "warning",
                    "exam_version_ambiguous",
                    f"TOEFL version not stated; {value} fits the {', '.join(sorted(v or '' for v in fits))} scale.",
                )
            ]
    else:
        bounds = SCORE_RANGES.get((exam, None))
        if bounds is None:
            return []
        lo, hi = bounds
    if not (lo <= value <= hi):
        return [Issue("error", "score_out_of_range", f"{exam} {what} {value} is outside {lo}-{hi}.")]
    return []


def check_changed(proposed: dict[str, Any], previous: dict[str, Any] | None, keys: list[str]) -> list[Issue]:
    """Flag values that differ from the last cycle's, so the reviewer looks twice."""
    if previous is None:
        return []
    changed = [k for k in keys if k in proposed and previous.get(k) != proposed.get(k)]
    if not changed:
        return []
    return [Issue("warning", "changed_since_last_cycle", f"Changed since the previous cycle: {', '.join(changed)}.")]
