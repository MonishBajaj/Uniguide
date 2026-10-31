"""QS World University Rankings by Subject: institution ranks used only to order courses.

The workbook is downloaded by hand and never committed or shown to students. Each sheet after `Index` and
`methodology` is one subject; its full name is the first cell of the second row (tab names are cut at 31
characters).
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

import yaml

from ..db import Connection
from .base import ImportStats, register_source

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
_SKIPPED_TABS = {"Index", "methodology"}

# QS country spelling -> ISO code, for the countries students can target.
COUNTRY_ISO = {
    "United States of America": "US",
    "United Kingdom": "GB",
    "Canada": "CA",
    "Australia": "AU",
    "Germany": "DE",
    "Ireland": "IE",
    "Netherlands": "NL",
    "France": "FR",
    "New Zealand": "NZ",
    "Singapore": "SG",
    "Japan": "JP",
    "Republic of Korea": "KR",
    "United Arab Emirates": "AE",
    "Qatar": "QA",
}


@dataclass(frozen=True)
class RankedRow:
    institution: str
    country: str
    rank_low: int
    rank_high: int


@dataclass(frozen=True)
class SubjectSheet:
    subject: str
    rows: list[RankedRow]


@dataclass(frozen=True)
class Workbook:
    edition: str
    sheets: list[SubjectSheet]


def parse_rank(text: str) -> tuple[int, int]:
    """A QS rank: `7`, `=7`, `501+` or a band such as `751-850`."""
    cleaned = text.strip().lstrip("=").rstrip("+").strip()
    low, _, high = cleaned.partition("-")
    try:
        lo = int(float(low))
        hi = int(float(high)) if high else lo
    except ValueError:
        raise ValueError(f"Not a QS rank: {text!r}") from None
    if lo < 1 or hi < lo:
        raise ValueError(f"Not a QS rank: {text!r}")
    return lo, hi


def normalize_name(name: str) -> str:
    """A comparison key: no accents, punctuation, bracketed text, campus suffix or filler words."""
    text = re.sub(r"\s*-\s*main campus$", "", name.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\([^)]*\)", " ", text)
    # Punctuation of any script (en dashes, curly apostrophes) separates words, as an ASCII one does.
    text = "".join(" " if unicodedata.category(c)[0] in "PSZ" else c for c in unicodedata.normalize("NFKD", text))
    text = text.encode("ascii", "ignore").decode().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return " ".join(w for w in text.split() if w not in {"the", "of", "and", "at"})


def _column(ref: str) -> str:
    return re.match(r"[A-Z]+", ref).group(0)  # type: ignore[union-attr]


def _sheet_rows(z: zipfile.ZipFile, part: str, strings: list[str]) -> list[dict[str, str]]:
    rows = []
    for row in ET.fromstring(z.read(part)).iter(f"{_NS}row"):
        cells = {}
        for c in row.findall(f"{_NS}c"):
            v = c.find(f"{_NS}v")
            if v is not None and v.text is not None:
                cells[_column(c.get("r", "A"))] = strings[int(v.text)] if c.get("t") == "s" else v.text
        rows.append(cells)
    return rows


def read_workbook(path: str) -> Workbook:
    with zipfile.ZipFile(path) as z:
        strings = [
            "".join(t.text or "" for t in si.iter(f"{_NS}t"))
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_NS}si")
        ]
        targets = {
            r.get("Id"): r.get("Target", "")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).iter(f"{_REL_NS}Relationship")
        }
        tabs = [
            (s.get("name", ""), "xl/" + targets[s.get(_REL_ID, "")].removeprefix("/xl/").removeprefix("xl/"))
            for s in ET.fromstring(z.read("xl/workbook.xml")).iter(f"{_NS}sheet")
        ]
        edition = ""
        sheets = []
        for tab, part in tabs:
            rows = _sheet_rows(z, part, strings)
            if tab == "Index":
                year = re.search(r"\b(20\d\d)\b", " ".join(v for r in rows[:3] for v in r.values()))
                edition = year.group(1) if year else ""
            if tab in _SKIPPED_TABS or len(rows) < 3:
                continue
            subject = rows[1].get("A", "").strip()
            header = next((i for i, r in enumerate(rows) if "INSTITUTION" in r.values()), None)
            if not subject or header is None:
                continue
            col = {v: k for k, v in rows[header].items()}
            ranked = []
            for r in rows[header + 1 :]:
                country = COUNTRY_ISO.get(r.get(col["COUNTRY/TERRITORY"], ""))
                name = r.get(col["INSTITUTION"], "").strip()
                try:
                    low, high = parse_rank(r.get("A", ""))
                except ValueError:
                    continue
                if country and name:
                    ranked.append(RankedRow(name, country, low, high))
            sheets.append(SubjectSheet(subject, ranked))
    return Workbook(edition, sheets)


SOURCE_URL = "https://www.topuniversities.com/subject-rankings"
RIGHTS = "QS World University Rankings by Subject; used only to order courses, never displayed or redistributed."
# Unmatched institutions at or better than this rank are listed so an alias can be added.
REPORT_RANK = 200


def _aliases(path: str | None) -> dict[str, str]:
    """QS name -> institution name, both reduced to comparison keys."""
    if not path or not Path(path).exists():
        return {}
    raw = yaml.safe_load(Path(path).read_text()) or {}
    return {normalize_name(qs): normalize_name(ours) for qs, ours in raw.items()}


def run(conn: Connection, *, file: str, aliases_file: str | None = None) -> ImportStats:
    """Replace this edition's rankings. Does not commit: the CLI's run wrapper does, so a failure rolls it all back."""
    book = read_workbook(file)
    aliases = _aliases(aliases_file)
    countries = sorted({r.country for s in book.sheets for r in s.rows})
    known: dict[tuple[str, str], list[str]] = defaultdict(list)
    for inst in conn.execute("select id, name, country from institutions where country = any(%s)", (countries,)):
        known[(inst["country"], normalize_name(inst["name"]))].append(str(inst["id"]))

    ranks: dict[tuple[str, str], tuple[int, int]] = {}
    best: dict[tuple[str, str], int] = {}
    unmatched: set[tuple[str, str]] = set()
    ambiguous: set[tuple[str, str]] = set()
    for sheet in book.sheets:
        for row in sheet.rows:
            key = normalize_name(row.institution)
            ids = known.get((row.country, aliases.get(key, key)), [])
            who = (row.institution, row.country)
            if len(ids) > 1:
                ambiguous.add(who)
            elif not ids:
                unmatched.add(who)
                best[who] = min(best.get(who, row.rank_low), row.rank_low)
            else:
                current = ranks.get((ids[0], sheet.subject))
                if current is None or row.rank_low < current[0]:
                    ranks[(ids[0], sheet.subject)] = (row.rank_low, row.rank_high)

    source_id = register_source(
        conn, url=SOURCE_URL, owner="QS Quacquarelli Symonds", rights_note=RIGHTS,
        content_hash=hashlib.sha256(Path(file).read_bytes()).hexdigest(),
    )
    conn.execute("delete from institution_rankings where edition = %s", (book.edition,))
    for (institution_id, subject), (low, high) in ranks.items():
        conn.execute(
            """
            insert into institution_rankings (institution_id, subject, rank_low, rank_high, edition, source_id)
            values (%s, %s, %s, %s, %s, %s)
            """,
            (institution_id, subject, low, high, book.edition, source_id),
        )

    stats = ImportStats(institutions=len({i for i, _ in ranks}), programs=len(ranks), skipped=len(unmatched))
    stats.notes = [f"ambiguous: {name} ({country})" for name, country in sorted(ambiguous)] + [
        f"{name} ({country}) best rank {best[(name, country)]}"
        for name, country in sorted(unmatched, key=lambda w: best[w])
        if best[(name, country)] <= REPORT_RANK
    ]
    return stats
