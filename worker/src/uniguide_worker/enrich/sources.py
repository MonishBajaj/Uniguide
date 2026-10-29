"""Find the official pages of a course: its own page plus the admissions, fees and deadline pages it links to."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from ..fetch.fetcher import Fetcher, FetchRefused

MAX_SOURCES = 6
# First match wins, so "tuition fees" is a fees page even though it sits under /admission/.
KINDS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("fees", re.compile(r"\b(fees?|tuition|costs?)\b", re.IGNORECASE)),
    ("deadlines", re.compile(r"\bdeadlines?\b|\bapplication dates?\b", re.IGNORECASE)),
    ("requirements", re.compile(r"\brequirements?\b|\beligibility\b|\bentry\b", re.IGNORECASE)),
    ("international", re.compile(r"\binternational\b", re.IGNORECASE)),
    ("admissions", re.compile(r"\badmissions?\b|\bhow to apply\b|\bapply\b", re.IGNORECASE)),
)


def _kind(text: str, url: str) -> str | None:
    haystack = f"{text} {urlsplit(url).path.replace('-', ' ').replace('_', ' ').replace('/', ' ')}"
    return next((kind for kind, pattern in KINDS if pattern.search(haystack)), None)


def discover_sources(fetcher: Fetcher, official_url: str) -> list[tuple[str, str]]:
    """(source_kind, url) for the course page and the same-host pages it links to, at most MAX_SOURCES."""
    found: list[tuple[str, str]] = [("course", official_url)]
    try:
        result = fetcher.fetch(official_url)
    except FetchRefused:
        return found
    if result.status >= 400:  # an error page's navigation says nothing about this course
        return found
    host = (urlsplit(official_url).hostname or "").lower()
    for text, url in result.links:
        if (urlsplit(url).hostname or "").lower() != host or url == official_url:
            continue
        kind = _kind(text, url)
        if kind and (kind, url) not in found:
            found.append((kind, url))
        if len(found) >= MAX_SOURCES:
            break
    return found
