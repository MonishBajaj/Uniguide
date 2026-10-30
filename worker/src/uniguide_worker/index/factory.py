"""Pick the course lister that matches the EXTRACTOR setting."""

from __future__ import annotations

from ..config import Settings
from .lister import CourseLister


def make_lister(settings: Settings) -> CourseLister:
    if settings.extractor == "ollama":
        from .ollama_lister import OllamaCourseLister

        if not settings.ollama_model:
            raise ValueError("EXTRACTOR=ollama needs OLLAMA_MODEL (a model you have pulled, for example qwen2.5:7b)")
        return OllamaCourseLister(model=settings.ollama_model)
    if settings.extractor == "gemini":
        from .lister import GeminiCourseLister

        if not settings.gemini_api_key:
            raise ValueError("EXTRACTOR=gemini needs GEMINI_API_KEY (or set EXTRACTOR=ollama with OLLAMA_MODEL)")
        return GeminiCourseLister(model=settings.gemini_model, api_key=settings.gemini_api_key)
    raise ValueError(f"The index crawl works with EXTRACTOR=gemini or ollama, not {settings.extractor!r}")
