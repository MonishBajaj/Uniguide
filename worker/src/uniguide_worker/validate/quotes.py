"""The main defence against hallucinated facts: every quote must appear in the page text."""

from __future__ import annotations

import re
import unicodedata

_TRANSLATE = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        "–": "-",
        "—": "-",
        "−": "-",
        " ": " ",
    }
)
MIN_QUOTE_CHARS = 8


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_TRANSLATE)
    return re.sub(r"\s+", " ", text).strip().casefold()


def quote_in_text(quote: str, page_text: str) -> bool:
    q = normalise(quote).strip(" .…")
    return len(q) >= MIN_QUOTE_CHARS and q in normalise(page_text)
