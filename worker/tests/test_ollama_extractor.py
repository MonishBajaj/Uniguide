import json

import httpx
import pytest

from uniguide_worker.config import Settings
from uniguide_worker.extract.factory import make_extractor
from uniguide_worker.extract.ollama import OllamaExtractor
from uniguide_worker.extract.schema import PageExtraction

from .test_extractor import EMPTY


def _extractor(handler: httpx.MockTransport | None = None, model: str = "ollama-test") -> OllamaExtractor:
    return OllamaExtractor(client=httpx.Client(transport=handler, base_url="http://ollama.test"), model=model)


def _reply(content: str, done_reason: str = "stop") -> dict[str, object]:
    return {"message": {"content": content}, "done_reason": done_reason, "prompt_eval_count": 1000, "eval_count": 200}


def test_returns_parsed_extraction_at_zero_cost() -> None:
    seen: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json=_reply(EMPTY.model_dump_json()))

    run = _extractor(httpx.MockTransport(handler)).extract("https://x.example.org", "2027-fall", "page text")
    body = seen[0]
    assert body["model"] == "ollama-test"
    assert body["stream"] is False
    assert body["format"] == PageExtraction.model_json_schema()
    assert "<page>\npage text\n</page>" in body["messages"][1]["content"]  # type: ignore[index]
    assert run.extraction == EMPTY
    assert run.error is None
    assert run.input_tokens == 1000 and run.output_tokens == 200
    assert run.cost_usd == 0


def test_unreachable_ollama_returns_error_run() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    run = _extractor(httpx.MockTransport(handler)).extract("https://x.example.org", "2027-fall", "text")
    assert run.extraction is None
    assert run.error is not None and "refused" in run.error


def test_http_error_returns_error_run() -> None:
    handler = httpx.MockTransport(lambda request: httpx.Response(404, json={"error": "model not found"}))
    run = _extractor(handler).extract("https://x.example.org", "2027-fall", "text")
    assert run.extraction is None
    assert run.error is not None and "404" in run.error and "model not found" in run.error


def test_unparseable_or_truncated_output_yields_no_extraction() -> None:
    for payload in (_reply("not json"), _reply(EMPTY.model_dump_json(), done_reason="length")):
        handler = httpx.MockTransport(lambda request, payload=payload: httpx.Response(200, json=payload))
        run = _extractor(handler).extract("https://x.example.org", "2027-fall", "text")
        assert run.extraction is None
        assert run.error


def test_version_names_model_and_prompt() -> None:
    assert _extractor().version.startswith("ollama-test/")


def _settings(**kwargs: object) -> Settings:
    return Settings(
        worker_database_url=None, operator_database_url=None, data_gov_api_key=None, crawler_contact="x", **kwargs  # type: ignore[arg-type]
    )


def test_factory_builds_ollama_extractor_with_configured_model() -> None:
    extractor = make_extractor(_settings(extractor="ollama", ollama_model="qwen-test"))
    assert isinstance(extractor, OllamaExtractor)
    assert extractor.model == "qwen-test"


@pytest.mark.parametrize("model", [None, ""])
def test_ollama_without_a_model_fails_with_a_clear_message(model: str | None) -> None:
    with pytest.raises(ValueError, match="OLLAMA_MODEL"):
        make_extractor(_settings(extractor="ollama", ollama_model=model))
