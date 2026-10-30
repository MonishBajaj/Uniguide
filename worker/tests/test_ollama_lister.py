import json

import httpx
import pytest

from uniguide_worker.config import Settings
from uniguide_worker.index.factory import make_lister
from uniguide_worker.index.lister import CourseList, ListedCourse
from uniguide_worker.index.ollama_lister import (
    LISTER_TIMEOUT_S,
    MAX_LINKS,
    MAX_PAGE_CHARS,
    OllamaCourseLister,
    repair_title,
)

COURSES = CourseList(
    courses=[ListedCourse(title="MSc Robotics", level="master", url="https://u.example/robotics", quote="MSc Robotics")]
)
LINKS = (("MSc Robotics", "https://u.example/robotics"),)


def _lister(handler: httpx.MockTransport) -> OllamaCourseLister:
    return OllamaCourseLister(model="ollama-test", client=httpx.Client(transport=handler, base_url="http://ollama.test"))


def _reply(content: str, done_reason: str = "stop") -> dict[str, object]:
    return {"message": {"content": content}, "done_reason": done_reason, "prompt_eval_count": 900, "eval_count": 120}


def test_lists_courses_from_the_model_answer() -> None:
    seen: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json=_reply(COURSES.model_dump_json()))

    run = _lister(httpx.MockTransport(handler)).list_courses("https://u.example/courses", "page text", LINKS)
    body = seen[0]
    assert body["model"] == "ollama-test" and body["stream"] is False
    assert body["format"] == CourseList.model_json_schema()
    user = body["messages"][1]["content"]  # type: ignore[index]
    assert "<page>\npage text\n</page>" in user and "1. MSc Robotics -> https://u.example/robotics" in user
    assert run.courses == COURSES.courses
    assert run.error is None
    assert run.input_tokens == 900 and run.output_tokens == 120 and run.cost_usd == 0


def test_the_prompt_tells_a_small_model_to_copy_titles_as_the_page_writes_them() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["messages"][0]["content"])
        return httpx.Response(200, json=_reply('{"courses": []}'))

    _lister(httpx.MockTransport(handler)).list_courses("https://u.example", "t", LINKS)
    assert "Copy each title exactly as the page writes it" in seen[0]
    assert "The quote must contain the whole title" in seen[0]


def test_long_pages_and_link_lists_are_cut_to_fit_the_model_window() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["messages"][1]["content"])
        return httpx.Response(200, json=_reply('{"courses": []}'))

    links = tuple((f"c{i}", f"https://u.example/{i}") for i in range(MAX_LINKS + 50))
    _lister(httpx.MockTransport(handler)).list_courses("https://u.example", "Z" * (MAX_PAGE_CHARS + 500), links)
    assert seen[0].count("Z") == MAX_PAGE_CHARS
    assert f"{MAX_LINKS}. c{MAX_LINKS - 1}" in seen[0] and f"{MAX_LINKS + 1}. " not in seen[0]


def test_unreachable_ollama_returns_error_run() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    run = _lister(httpx.MockTransport(handler)).list_courses("https://u.example", "t", LINKS)
    assert run.courses is None and run.error is not None and "refused" in run.error


def test_http_error_returns_error_run() -> None:
    handler = httpx.MockTransport(lambda request: httpx.Response(404, json={"error": "model not found"}))
    run = _lister(handler).list_courses("https://u.example", "t", LINKS)
    assert run.courses is None and run.error is not None and "404" in run.error and "model not found" in run.error


def test_cut_off_or_unparseable_answers_yield_no_courses() -> None:
    for payload in (_reply("not json"), _reply(COURSES.model_dump_json(), done_reason="length")):
        handler = httpx.MockTransport(lambda request, payload=payload: httpx.Response(200, json=payload))
        run = _lister(handler).list_courses("https://u.example", "t", LINKS)
        assert run.courses is None and run.error


def _settings(**kwargs: object) -> Settings:
    return Settings(
        worker_database_url=None, operator_database_url=None, data_gov_api_key=None, crawler_contact="x", **kwargs  # type: ignore[arg-type]
    )


def test_factory_builds_the_lister_for_the_configured_extractor() -> None:
    assert isinstance(make_lister(_settings(extractor="ollama", ollama_model="m")), OllamaCourseLister)
    assert type(make_lister(_settings(extractor="gemini", gemini_api_key="k"))).__name__ == "GeminiCourseLister"


def test_factory_explains_what_is_missing() -> None:
    with pytest.raises(ValueError, match="OLLAMA_MODEL"):
        make_lister(_settings(extractor="ollama"))
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        make_lister(_settings(extractor="gemini"))
    with pytest.raises(ValueError, match="gemini or ollama"):
        make_lister(_settings(extractor="anthropic"))


@pytest.mark.parametrize(
    ("title", "quote", "expected"),
    [
        ("Master of Science in Robotics", "Robotics (MS)", "Robotics"),
        ("Master of Arts in History", "History", "History"),
        ("Doctor of Philosophy in Chemistry", "Chemistry PhD", "Chemistry"),
        ("PhD in Physics", "Physics", "Physics"),
        ("MS in Data Science", "Data Science", "Data Science"),
        ("Master of Science in Robotics", "Robotic Systems", "Master of Science in Robotics"),
        ("Robotics", "Robotics", "Robotics"),
        ("Master of Science in Robotics", "Master of Science in Robotics", "Master of Science in Robotics"),
    ],
)
def test_expanded_degree_titles_are_repaired_only_when_the_quote_has_the_plain_name(
    title: str, quote: str, expected: str
) -> None:
    assert repair_title(title, quote) == expected


def test_a_repaired_title_reaches_the_caller_with_its_quote_unchanged() -> None:
    reply = CourseList(
        courses=[ListedCourse(title="Master of Science in Robotics", level="master", url="https://u.example/r", quote="Robotics")]
    )
    handler = httpx.MockTransport(lambda request: httpx.Response(200, json=_reply(reply.model_dump_json())))
    run = _lister(handler).list_courses("https://u.example", "t", LINKS)
    assert run.courses is not None
    assert [(c.title, c.quote) for c in run.courses] == [("Robotics", "Robotics")]


def test_the_lister_waits_longer_for_the_model_than_the_extractor_does() -> None:
    assert LISTER_TIMEOUT_S >= 900
    assert OllamaCourseLister(model="m").client.timeout.read == LISTER_TIMEOUT_S
