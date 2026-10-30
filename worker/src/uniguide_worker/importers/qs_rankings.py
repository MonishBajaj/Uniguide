"""QS World University Rankings by Subject: institution ranks used only to order courses.

The workbook is downloaded by hand and never committed or shown to students. Each sheet after `Index` and
`methodology` is one subject; its full name is the first cell of the second row (tab names are cut at 31
characters).
"""

from __future__ import annotations

import re
import unicodedata
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree as ET

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
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\([^)]*\)", " ", text).replace("&", " and ")
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
