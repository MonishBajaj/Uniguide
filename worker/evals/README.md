# Extraction evals

Each case in `fixtures/<case>/` is one official-style page with hand labels:

- `page.html`: the page (synthetic institutions on reserved example domains)
- `labels.yaml`: the cycle, country and the deadlines and fees a careful human would record
- `recorded_response.json`: a model response, so the scoring runs offline in CI

Metrics (`metrics.py`), computed over facts that would be published (no validator errors):

| Metric | Gate |
|---|---|
| Deadline exact match (date and kind) | ≥ 95% |
| Fee exact match (kind, basis, amount, currency) | ≥ 95% |
| False publications (published deadlines/fees that match no label) | 0 |

```bash
uv run pytest evals              # offline: 200 cases with recorded responses
uv run pytest evals -m live      # calls Claude Haiku 5.5 and Gemini; each is skipped without its key
                                 # (ANTHROPIC_API_KEY, GEMINI_API_KEY; costs cents)
uv run python evals/generate_fixtures.py  # regenerate synthetic cases
```

The benchmark suite contains 200 labelled synthetic pages across 10 destinations (US, GB, CA, AU, DE, NL, IE, FR, NZ, SG) and degree levels (undergraduate, master's, doctoral). These test single and multi-round deadlines, varied fee bases, domestic vs. international fees, and edge cases including stale cycles and prompt injection attacks. All synthetic pages use reserved domains (`example.org`) in compliance with the data policy forbidding copies of live copyrighted university pages.

## Comparing Gemini with Claude

Gemini is the default extractor for on-demand enrichment, so it has to pass the same gates as Claude. Run both live and compare the printed per-case deadline and fee match:

```bash
GEMINI_API_KEY=... ANTHROPIC_API_KEY=... uv run pytest evals -m live -s
```

Record the result here before relying on a new model. Not yet measured: no Gemini key was available when the extractor was written, so `GeminiExtractor` is untested against the live API.
