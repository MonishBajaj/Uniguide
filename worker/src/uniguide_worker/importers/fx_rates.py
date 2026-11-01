"""Exchange rates from the European Central Bank's euro foreign exchange reference rates (daily, free to reuse).

The ECB publishes every rate against the euro. Matching and the database convert with a direct or an inverse rate only,
never through a third currency, so every pair among the wanted currencies is derived here and stored once, in
alphabetical order: ("GBP", "USD") holds the dollars one pound buys.
"""

from __future__ import annotations

import itertools
import xml.etree.ElementTree as ET
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

import httpx

from ..db import Connection

FEED_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
SOURCE = "ECB euro foreign exchange reference rates"
# The currencies students can budget in, plus Japan and South Korea. The ECB does not publish AED or QAR.
DEFAULT_CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "INR", "NZD", "SGD", "JPY", "KRW"]
_NS = "{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}"


@dataclass
class FxStats:
    as_of: str = ""
    pairs: int = 0
    missing: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"as_of": self.as_of, "pairs": self.pairs, "missing": self.missing}


def fetch_ecb(user_agent: str) -> str:
    response = httpx.get(FEED_URL, headers={"User-Agent": user_agent}, timeout=30, follow_redirects=True)
    response.raise_for_status()
    return response.text


def parse_ecb(xml: str) -> tuple[date, dict[str, Decimal]]:
    """The feed's date and its rates (units of each currency per euro)."""
    if "<!DOCTYPE" in xml or "<!ENTITY" in xml:  # the real feed has neither; refuse entity tricks
        raise ValueError("Not the ECB reference-rate feed")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ValueError(f"Not the ECB reference-rate feed: {exc}") from exc
    day = next((c for c in root.iter(f"{_NS}Cube") if c.get("time")), None)
    if day is None:
        raise ValueError("Not the ECB reference-rate feed: no dated rates")
    rates = {c.get("currency", ""): Decimal(c.get("rate", "0")) for c in day.iter(f"{_NS}Cube") if c.get("currency")}
    if not rates:
        raise ValueError("Not the ECB reference-rate feed: no rates")
    return date.fromisoformat(day.get("time", "")), rates


def build_pairs(
    rates: dict[str, Decimal], currencies: Sequence[str]
) -> tuple[dict[tuple[str, str], Decimal], list[str]]:
    """Every pair among the wanted currencies the feed covers, plus the wanted ones it does not."""
    per_euro = {"EUR": Decimal(1), **rates}
    wanted = list(dict.fromkeys(c.upper() for c in currencies))
    missing = [c for c in wanted if c not in per_euro]
    have = sorted(c for c in wanted if c in per_euro)
    return {(a, b): per_euro[b] / per_euro[a] for a, b in itertools.combinations(have, 2)}, missing


def run(
    conn: Connection,
    *,
    xml: str | None = None,
    currencies: Sequence[str] = DEFAULT_CURRENCIES,
    user_agent: str = "UniguideBot/0.1",
) -> FxStats:
    """Store today's rates. Does not commit: the CLI's run wrapper does. Older days are kept."""
    day, rates = parse_ecb(xml if xml is not None else fetch_ecb(user_agent))
    pairs, missing = build_pairs(rates, currencies)
    for (base, quote), rate in pairs.items():
        conn.execute(
            """
            insert into fx_rates (base, quote, rate, as_of, source) values (%s, %s, %s, %s, %s)
            on conflict (base, quote, as_of) do update set rate = excluded.rate, source = excluded.source
            """,
            (base, quote, rate, day, SOURCE),
        )
    return FxStats(as_of=day.isoformat(), pairs=len(pairs), missing=missing)
