"""Asks a local Ollama model which courses an institution's index page lists (same prompt and checks as Gemini)."""

from __future__ import annotations

import os
import re
import time

import httpx
from pydantic import ValidationError

from ..extract.ollama import DEFAULT_HOST, NUM_CTX
from ..validate.quotes import normalise
from .lister import SYSTEM, CourseList, CourseListRun, ListedCourse, _message

# A small local model has a window of NUM_CTX tokens for the page, the link list and the answer, so the
# page and its links are cut well below what Gemini takes. A longer index lists only its first courses.
MAX_PAGE_CHARS = 20_000
MAX_LINKS = 250
# Listing a long page means writing a long answer (a 150-course page took over four minutes), so the lister waits
# much longer than the one-page extractor does.
LISTER_TIMEOUT_S = 900

# A 7B model tends to expand "Computer Science" to "Master of Science in Computer Science", and the crawl then
# rejects the course because its quote does not contain the title.
SYSTEM_FOR_SMALL_MODELS = (
    SYSTEM
    + "\n- Copy each title exactly as the page writes it in your quote: never add or expand degree wording "
    "(do not turn "
    "'Computer Science' into 'Master of Science in Computer Science'). The quote must contain the whole title."
)


_DEGREE_PREFIX = re.compile(
    r"^(?:(?:master|doctor|bachelor)s? of [\w&' ]+?"
    r"|(?:M\.?S\.?c?|M\.?A\.?|M\.?Eng|M\.?F\.?A|MBA|Ph\.?D\.?|B\.?S\.?|B\.?A\.?)) in ",
    re.IGNORECASE,
)


_DEGREE_SUFFIX = re.compile(
    r"(?:\s*\([^)]*\)|\s+(?:PhD|Ph\.?D\.?|MS|M\.S\.|MA|M\.A\.|MSc|MFA|MBA|MEng|BS|BA|BFA))$", re.IGNORECASE
)


def repair_title(title: str, quote: str) -> str:
    """Undo a small model's habit of rewriting a title: 'Robotics' becomes 'Master of Science in Robotics' or
    'Robotics (MS)', and '&' becomes 'and'.

    A rewritten title is replaced by one of its plain forms only when the quote really contains that form, so the
    crawl's check stays strict.
    """
    heard = normalise(quote)
    plain = _DEGREE_PREFIX.sub("", title, count=1)
    candidates = [title, plain]
    for form in (title, plain):
        stripped = _DEGREE_SUFFIX.sub("", form).strip()
        candidates += [stripped, _DEGREE_PREFIX.sub("", stripped, count=1)]
    for form in list(candidates):
        candidates += [form.replace(" and ", " & "), form.replace(" & ", " and ")]
    for candidate in candidates:
        if candidate and normalise(candidate) in heard:
            return candidate
    return title


class OllamaCourseLister:
    def __init__(self, model: str, client: httpx.Client | None = None, host: str | None = None) -> None:
        self.client = client or httpx.Client(
            base_url=host or os.environ.get("OLLAMA_HOST") or DEFAULT_HOST, timeout=LISTER_TIMEOUT_S
        )
        self.model = model

    def list_courses(self, url: str, page_text: str, links: tuple[tuple[str, str], ...]) -> CourseListRun:
        started = time.monotonic()

        def ms() -> int:
            return int((time.monotonic() - started) * 1000)

        try:
            response = self.client.post(
                "/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "format": CourseList.model_json_schema(),
                    "options": {"temperature": 0, "num_ctx": NUM_CTX},
                    "messages": [
                        {"role": "system", "content": SYSTEM_FOR_SMALL_MODELS},
                        {"role": "user", "content": _message(url, page_text, links, MAX_PAGE_CHARS, MAX_LINKS)},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            return CourseListRun(
                None, self.model, 0, 0, 0.0, f"HTTP {exc.response.status_code}: {exc.response.text[:200]}", ms()
            )
        except (httpx.HTTPError, ValueError) as exc:  # unreachable server or a body that is not JSON
            return CourseListRun(None, self.model, 0, 0, 0.0, f"connection error: {exc}", ms())

        tin, tout = data.get("prompt_eval_count") or 0, data.get("eval_count") or 0
        if data.get("done_reason") == "length":
            msg = "the answer was cut off: this index is too long for one answer, split it into several index URLs"
            return CourseListRun(None, self.model, tin, tout, 0.0, msg, ms())
        try:
            courses = CourseList.model_validate_json(data.get("message", {}).get("content") or "").courses
        except ValidationError as exc:
            msg = f"unparseable output: {exc.error_count()} errors"
            return CourseListRun(None, self.model, tin, tout, 0.0, msg, ms())
        courses = [
            ListedCourse(title=repair_title(c.title, c.quote), level=c.level, url=c.url, quote=c.quote) for c in courses
        ]
        return CourseListRun(courses, self.model, tin, tout, 0.0, None, ms())
