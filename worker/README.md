# uniguide-worker

The one Python process in Uniguide: register importers (Listed tier), the official-page fetcher and extractor (Extracted tier), deterministic validators, the seed loader and the extraction evals. It never publishes a fact as verified; that only happens through the admin review queue.

```bash
uv sync
uv run uniguide-worker --help
uv run pytest
```

See `docs/SETUP.md` for credentials and `docs/ARCHITECTURE.md` for how facts move from a page to a student.
