from datetime import date
from decimal import Decimal

import pytest

from uniguide_worker.db import Connection
from uniguide_worker.importers import fx_rates

ECB_XML = """<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
  xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube><Cube time="{day}">
    <Cube currency="USD" rate="1.25"/>
    <Cube currency="GBP" rate="0.8"/>
    <Cube currency="AUD" rate="1.6"/>
    <Cube currency="JPY" rate="150"/>
  </Cube></Cube>
</gesmes:Envelope>"""


def feed(day: str = "2099-01-03") -> str:
    return ECB_XML.format(day=day)


# The tests use days in 2099: they are never counted with the real rates a local database holds, and as the newest
# rates they are the ones fx_convert uses (the tests run in a transaction that is rolled back).
def stored(conn: Connection) -> dict[tuple[str, str], tuple[Decimal, date]]:
    rows = conn.execute(
        "select base, quote, rate, as_of from fx_rates where source like 'ECB%' and extract(year from as_of) = 2099"
    ).fetchall()
    return {(r["base"], r["quote"]): (r["rate"], r["as_of"]) for r in rows}


def test_parse_reads_the_date_and_every_currency() -> None:
    day, rates = fx_rates.parse_ecb(feed())
    assert day == date(2099, 1, 3)
    assert rates == {"USD": Decimal("1.25"), "GBP": Decimal("0.8"), "AUD": Decimal("1.6"), "JPY": Decimal("150")}


@pytest.mark.parametrize("xml", ["", "<not-ecb/>", "<a><b>oops"])
def test_parse_rejects_what_is_not_the_ecb_feed(xml: str) -> None:
    with pytest.raises(ValueError):
        fx_rates.parse_ecb(xml)


def test_pairs_are_stored_once_per_currency_pair_in_alphabetical_order() -> None:
    _, rates = fx_rates.parse_ecb(feed())
    pairs, missing = fx_rates.build_pairs(rates, ["EUR", "USD", "GBP", "AUD"])
    assert missing == []
    assert set(pairs) == {
        ("AUD", "EUR"),
        ("AUD", "GBP"),
        ("AUD", "USD"),
        ("EUR", "GBP"),
        ("EUR", "USD"),
        ("GBP", "USD"),
    }
    assert pairs[("EUR", "USD")] == Decimal("1.25")
    assert pairs[("AUD", "EUR")] == Decimal(1) / Decimal("1.6")  # 1 AUD in euros
    assert pairs[("GBP", "USD")] == Decimal("1.25") / Decimal("0.8")  # 1 GBP in dollars, crossed through the euro


def test_a_currency_the_feed_lacks_is_reported_not_invented() -> None:
    _, rates = fx_rates.parse_ecb(feed())
    pairs, missing = fx_rates.build_pairs(rates, ["USD", "AED"])
    assert missing == ["AED"]
    assert all("AED" not in pair for pair in pairs)


def test_run_stores_the_rates_and_the_database_can_convert_with_them(worker: Connection) -> None:
    stats = fx_rates.run(worker, xml=feed(), currencies=["EUR", "USD", "GBP"])
    assert stats.pairs == 3 and stats.as_of == "2099-01-03" and stats.missing == []
    assert stored(worker)[("GBP", "USD")] == (Decimal("1.5625"), date(2099, 1, 3))
    converted = worker.execute("select public.fx_convert(100, 'USD', 'GBP') as v").fetchone()
    assert converted is not None and abs(converted["v"] - Decimal("64")) < Decimal("0.0001")


def test_running_twice_on_one_day_leaves_one_row_per_pair(worker: Connection) -> None:
    fx_rates.run(worker, xml=feed(), currencies=["EUR", "USD"])
    fx_rates.run(worker, xml=feed(), currencies=["EUR", "USD"])
    assert len(stored(worker)) == 1


def test_a_new_day_adds_rows_and_keeps_the_old_ones(worker: Connection) -> None:
    fx_rates.run(worker, xml=feed("2099-01-02"), currencies=["EUR", "USD"])
    fx_rates.run(worker, xml=feed("2099-01-03"), currencies=["EUR", "USD"])
    count = worker.execute(
        "select count(*) as n from fx_rates where source like 'ECB%' and base = 'EUR' and extract(year from as_of) = 2099"
    ).fetchone()
    assert count is not None and count["n"] == 2
