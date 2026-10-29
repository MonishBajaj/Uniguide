"""Calls Gemini with the same JSON schema and prompt as the Claude extractor."""

from __future__ import annotations

import os
import time
from typing import Any

from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from .extractor import MAX_PAGE_CHARS, ExtractionRun
from .prompt import PROMPT_VERSION, SYSTEM, user_message
from .schema import PageExtraction

DEFAULT_MODEL = "gemini-2.5-flash"
# USD per million tokens, approximate list price for the Flash tier; only used for the cost log.
INPUT_PRICE = 0.30
OUTPUT_PRICE = 2.50


class GeminiExtractor:
    def __init__(self, client: genai.Client | None = None, model: str | None = None) -> None:
        self.client = client or genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        self.model = model or DEFAULT_MODEL
        self.version = f"{self.model}/{PROMPT_VERSION}"

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        started = time.monotonic()
        try:
            response: Any = self.client.models.generate_content(
                model=self.model,
                contents=user_message(url, cycle_label, page_text[:MAX_PAGE_CHARS]),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM,
                    response_mime_type="application/json",
                    response_json_schema=PageExtraction.model_json_schema(),
                ),
            )
        except errors.APIError as exc:
            prefix = "rate_limited: " if exc.code == 429 else ""
            return self._failed(started, f"{prefix}HTTP {exc.code}: {exc.message}")
        except Exception as exc:  # network and SDK errors must not take down a job
            return self._failed(started, f"connection error: {exc}")

        usage = response.usage_metadata
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        finish = str(getattr(response.candidates[0], "finish_reason", "")) if response.candidates else ""
        stop = finish.split(".")[-1] or None
        extraction: PageExtraction | None = None
        error: str | None = None
        if stop == "MAX_TOKENS":
            error = "stop_reason=MAX_TOKENS"
        else:
            try:
                extraction = PageExtraction.model_validate_json(response.text or "")
            except ValidationError as exc:
                error = f"unparseable output: {exc.error_count()} errors"
        return ExtractionRun(
            extraction=extraction,
            model=self.model,
            prompt_version=PROMPT_VERSION,
            stop_reason=stop,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=(input_tokens * INPUT_PRICE + output_tokens * OUTPUT_PRICE) / 1_000_000,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=error,
        )

    def _failed(self, started: float, error: str) -> ExtractionRun:
        return ExtractionRun(
            extraction=None,
            model=self.model,
            prompt_version=PROMPT_VERSION,
            stop_reason=None,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=error,
        )
