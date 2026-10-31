"""Calls a local Ollama model with the same JSON schema and prompt as the Claude extractor."""

from __future__ import annotations

import os
import time

import httpx
from pydantic import ValidationError

from .extractor import ExtractionRun
from .prompt import PROMPT_VERSION, SYSTEM, user_message
from .schema import PageExtraction

DEFAULT_HOST = "http://127.0.0.1:11434"
# A local model on one GPU is slow, but a stalled request must still not hold a job's heartbeat forever.
TIMEOUT_S = 300
# Ollama silently cuts the prompt to its context window (a few thousand tokens by default), so ask for
# room for the page and keep the page below it (about 4 characters per token, plus schema and prompt).
NUM_CTX = 16_384
MAX_PAGE_CHARS = 40_000


class OllamaExtractor:
    def __init__(self, model: str, client: httpx.Client | None = None, host: str | None = None) -> None:
        self.client = client or httpx.Client(
            base_url=host or os.environ.get("OLLAMA_HOST") or DEFAULT_HOST, timeout=TIMEOUT_S
        )
        self.model = model
        self.version = f"{model}/{PROMPT_VERSION}"

    def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun:
        started = time.monotonic()
        try:
            response = self.client.post(
                "/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "format": PageExtraction.model_json_schema(),
                    "options": {"temperature": 0, "num_ctx": NUM_CTX},
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": user_message(url, cycle_label, page_text[:MAX_PAGE_CHARS])},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            return self._failed(started, f"HTTP {exc.response.status_code}: {exc.response.text[:200]}")
        except (httpx.HTTPError, ValueError) as exc:  # unreachable server or a body that is not JSON
            return self._failed(started, f"connection error: {exc}")

        stop = data.get("done_reason")
        extraction: PageExtraction | None = None
        error: str | None = None
        if stop == "length":
            error = "stop_reason=length"
        else:
            try:
                extraction = PageExtraction.model_validate_json(data.get("message", {}).get("content") or "")
            except ValidationError as exc:
                error = f"unparseable output: {exc.error_count()} errors"
        return ExtractionRun(
            extraction=extraction,
            model=self.model,
            prompt_version=PROMPT_VERSION,
            stop_reason=stop,
            input_tokens=data.get("prompt_eval_count") or 0,
            output_tokens=data.get("eval_count") or 0,
            cost_usd=0.0,
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
