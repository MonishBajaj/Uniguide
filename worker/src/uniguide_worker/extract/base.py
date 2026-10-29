"""What the pipeline needs from an extractor, whichever model sits behind it."""

from __future__ import annotations

from typing import Protocol

from .extractor import ExtractionRun


class PageExtractor(Protocol):
    version: str

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun: ...
