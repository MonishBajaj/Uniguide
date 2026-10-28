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
uv run pytest evals              # offline: recorded responses
uv run pytest evals -m live      # calls Claude Haiku 5.5 (needs ANTHROPIC_API_KEY; costs cents)
```

The plan calls for 200 labelled pages across countries and levels. Add a case by copying a
folder, writing the labels by hand from the page, and saving a model response as
`recorded_response.json` (the live run prints what it sees; check it against the labels).
