"""Dry run of what `uniguide-worker index crawl` does for index pages, without touching the database.

    uv run python scripts/dry_run_index.py name=domain.edu|https://domain.edu/programs [...]

Fetches each page with the crawler's own fetcher, lists its courses with the model named by EXTRACTOR (set
OLLAMA_MODEL to try another one), and applies the crawl's acceptance checks. Prints how many courses were listed and
accepted, with the first rejection reasons. A tiny accepted count (1 to 3) is usually navigation, not courses.
"""

import sys

from uniguide_worker.config import get_settings
from uniguide_worker.fetch.fetcher import Fetcher, FetchRefused
from uniguide_worker.index.crawl import _reject_reason
from uniguide_worker.index.factory import make_lister


def main(args: list[str]) -> None:
    settings = get_settings()
    fetcher, lister = Fetcher(settings.user_agent), make_lister(settings)
    for arg in args:
        name, rest = arg.split("=", 1)
        domain, url = rest.split("|", 1)
        try:
            page = fetcher.fetch(url)
        except FetchRefused as exc:
            print(f"{name}: REFUSED {str(exc)[:80]}", flush=True)
            continue
        if page.status >= 400 or not page.text:
            print(f"{name}: HTTP {page.status}, {len(page.text)} chars", flush=True)
            continue
        run = lister.list_courses(url, page.text, page.links)
        if run.courses is None:
            print(f"{name}: lister failed: {run.error}", flush=True)
            continue
        links = {href.split("#")[0] for _, href in page.links}
        reasons = [r for c in run.courses if (r := _reject_reason(c, page.text, links, domain))]
        accepted = [c for c in run.courses if _reject_reason(c, page.text, links, domain) is None]
        sample = " / ".join(c.title[:40] for c in accepted[:3])
        why = " | rejected: " + " ; ".join(r[:230] for r in reasons[:3]) if reasons else ""
        seconds = run.latency_ms // 1000
        print(f"{name}: listed {len(run.courses)}, accepted {len(accepted)} ({seconds}s) e.g. {sample}{why}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
