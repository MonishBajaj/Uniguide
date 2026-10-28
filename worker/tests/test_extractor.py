from uniguide_worker.extract.extractor import EXTRACTOR_VERSION, Extractor
from uniguide_worker.extract.schema import PageExtraction

from .conftest import FakeAnthropic, FakeResponse

EMPTY = PageExtraction(
    effective_intake=None,
    effective_intake_year=None,
    language_tests=[],
    entry_qualifications=[],
    admissions_tests=[],
    deadlines=[],
    costs=[],
)


def test_request_uses_haiku_with_schema_and_low_effort() -> None:
    client = FakeAnthropic(FakeResponse(EMPTY))
    run = Extractor(client=client).extract("https://x.example.org", "2027-fall", "page text")  # type: ignore[arg-type]
    call = client.messages.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_format"] is PageExtraction
    assert call["output_config"] == {"effort": "low"}
    assert "temperature" not in call
    assert "<page>\npage text\n</page>" in call["messages"][0]["content"]
    assert run.extraction == EMPTY
    assert run.cost_usd == (1000 * 0.10 + 200 * 0.50) / 1_000_000
    assert EXTRACTOR_VERSION.startswith("claude-haiku-5-5/")


def test_refusal_yields_no_extraction() -> None:
    client = FakeAnthropic(FakeResponse(EMPTY, stop_reason="refusal"))
    run = Extractor(client=client).extract("https://x.example.org", "2027-fall", "text")  # type: ignore[arg-type]
    assert run.extraction is None
    assert run.error == "stop_reason=refusal"


def test_truncated_output_yields_no_extraction() -> None:
    client = FakeAnthropic(FakeResponse(EMPTY, stop_reason="max_tokens"))
    run = Extractor(client=client).extract("https://x.example.org", "2027-fall", "text")  # type: ignore[arg-type]
    assert run.extraction is None
