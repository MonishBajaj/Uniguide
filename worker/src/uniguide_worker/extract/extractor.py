"""Calls Claude Haiku 5.5 with a strict JSON schema to propose facts from one page."""

from __future__ import annotations

import time
from dataclasses import dataclass

import anthropic

from .prompt import PROMPT_VERSION, SYSTEM, user_message
from .schema import PageExtraction

MODEL = "claude-haiku-5-5"
EXTRACTOR_VERSION = f"{MODEL}/{PROMPT_VERSION}"

# USD per million tokens for prompts up to 100K tokens (Oct 2026 list price).
INPUT_PRICE = 0.10
OUTPUT_PRICE = 0.50
# Longer prompts are billed at the >100K rate; pages are truncated well below it.
MAX_PAGE_CHARS = 120_000


@dataclass(frozen=True)
class ExtractionRun:
    extraction: PageExtraction | None
    model: str
    prompt_version: str
    stop_reason: str | None
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    error: str | None = None


class Extractor:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL) -> None:
        self.client = client or anthropic.Anthropic()
        self.model = model

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        started = time.monotonic()
        try:
            response = self.client.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=SYSTEM,
                messages=[{"role": "user", "content": user_message(url, cycle_label, page_text[:MAX_PAGE_CHARS])}],
                output_format=PageExtraction,
                output_config={"effort": "low"},
            )
        except anthropic.APIStatusError as exc:
            return self._failed(started, f"HTTP {exc.status_code}: {exc.message}")
        except anthropic.APIConnectionError as exc:
            return self._failed(started, f"connection error: {exc}")

        latency = int((time.monotonic() - started) * 1000)
        usage = response.usage
        cost = (usage.input_tokens * INPUT_PRICE + usage.output_tokens * OUTPUT_PRICE) / 1_000_000
        # Refusals and truncated output carry no usable extraction.
        usable = response.stop_reason not in ("refusal", "max_tokens")
        return ExtractionRun(
            extraction=response.parsed_output if usable else None,
            model=self.model,
            prompt_version=PROMPT_VERSION,
            stop_reason=response.stop_reason,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=cost,
            latency_ms=latency,
            error=None if usable else f"stop_reason={response.stop_reason}",
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
