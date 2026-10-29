from google.genai import errors

from uniguide_worker.extract.gemini import GeminiExtractor
from uniguide_worker.extract.schema import PageExtraction

from .conftest import FakeGenai, FakeGenaiResponse
from .test_extractor import EMPTY


def test_returns_parsed_extraction_and_cost() -> None:
    client = FakeGenai(FakeGenaiResponse(EMPTY.model_dump_json()))
    run = GeminiExtractor(client=client, model="gemini-test").extract("https://x.example.org", "2027-fall", "page text")  # type: ignore[arg-type]
    call = client.models.calls[0]
    assert call["model"] == "gemini-test"
    assert "<page>\npage text\n</page>" in call["contents"]
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema == PageExtraction.model_json_schema()
    assert run.extraction == EMPTY
    assert run.error is None
    assert run.input_tokens == 1000 and run.output_tokens == 200
    assert run.cost_usd > 0


def test_failed_call_returns_error_run() -> None:
    client = FakeGenai(RuntimeError("boom"))
    run = GeminiExtractor(client=client).extract("https://x.example.org", "2027-fall", "text")  # type: ignore[arg-type]
    assert run.extraction is None
    assert run.error is not None and "boom" in run.error


def test_quota_error_is_marked_rate_limited() -> None:
    client = FakeGenai(errors.APIError(429, {"error": {"message": "quota exceeded"}}))
    run = GeminiExtractor(client=client).extract("https://x.example.org", "2027-fall", "text")  # type: ignore[arg-type]
    assert run.extraction is None
    assert run.error is not None and run.error.startswith("rate_limited")


def test_unparseable_or_truncated_output_yields_no_extraction() -> None:
    for response in (
        FakeGenaiResponse("not json"),
        FakeGenaiResponse(EMPTY.model_dump_json(), finish_reason="MAX_TOKENS"),
    ):
        run = GeminiExtractor(client=FakeGenai(response)).extract("https://x.example.org", "2027-fall", "text")  # type: ignore[arg-type]
        assert run.extraction is None
        assert run.error


def test_version_names_model_and_prompt() -> None:
    extractor = GeminiExtractor(client=FakeGenai(FakeGenaiResponse("{}")), model="gemini-test")
    assert extractor.version.startswith("gemini-test/")
