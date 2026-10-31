"""Builds a minimal QS-style xlsx for tests, so no real QS data is needed."""

from __future__ import annotations

import zipfile
from xml.sax.saxutils import escape

HEADER = ["2026", "2025", "INSTITUTION", "COUNTRY/TERRITORY", "ACADEMIC", "ACADEMIC RANK"]


def _col(i: int) -> str:
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]


def write_workbook(path: str, sheets: dict[str, tuple[str, list[list[str]]]], edition: str = "2026") -> None:
    """sheets maps a (possibly truncated) tab name to (full subject name, data rows).

    Each data row is [rank, previous rank, institution, country, ...]. The layout follows QS: a title row, a row
    with the full subject name, the header row, then data.
    """
    strings: list[str] = []

    def s(text: str) -> int:
        if text not in strings:
            strings.append(text)
        return strings.index(text)

    def sheet_xml(rows: list[list[str]]) -> str:
        out = []
        for r, row in enumerate(rows, 1):
            cells = "".join(f'<c r="{_col(c)}{r}" t="s"><v>{s(v)}</v></c>' for c, v in enumerate(row) if v != "")
            out.append(f'<row r="{r}">{cells}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(out)}</sheetData></worksheet>'
        )

    parts: list[tuple[str, str]] = [
        ("Index", sheet_xml([["", f"{edition} QS World University Rankings by Subject"], [""], ["Index"]])),
        ("methodology", sheet_xml([["How the rankings work"]])),
    ]
    for tab, (subject, data) in sheets.items():
        rows = [["2026 QS World University Rankings by Subject", "Academic"], [subject], HEADER, *data]
        parts.append((tab, sheet_xml(rows)))

    sheet_tags = "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(parts, 1))
    rels = "".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        f'Target="worksheets/sheet{i}.xml"/>'
        for i in range(1, len(parts) + 1)
    )
    sst = "".join(f"<si><t>{escape(t)}</t></si>" for t in strings)
    with zipfile.ZipFile(path, "w") as z:
        for i, (_, xml) in enumerate(parts, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", xml)
        z.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{sheet_tags}</sheets></workbook>',
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>',
        )
        z.writestr(
            "xl/sharedStrings.xml",
            f'<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{sst}</sst>',
        )
