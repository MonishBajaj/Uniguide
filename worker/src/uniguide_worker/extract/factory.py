"""Pick the extractor named by the EXTRACTOR setting."""

from __future__ import annotations

from ..config import Settings
from .base import PageExtractor


def make_extractor(settings: Settings) -> PageExtractor:
    if settings.extractor == "anthropic":
        from .extractor import Extractor

        return Extractor()
    if settings.extractor == "gemini":
        from .gemini import GeminiExtractor

        if not settings.gemini_api_key:
            raise ValueError(
                "EXTRACTOR=gemini needs GEMINI_API_KEY (or set EXTRACTOR=anthropic with ANTHROPIC_API_KEY)"
            )
        return GeminiExtractor(model=settings.gemini_model, api_key=settings.gemini_api_key)
    raise ValueError(f"Unknown EXTRACTOR {settings.extractor!r}; use 'gemini' or 'anthropic'")
