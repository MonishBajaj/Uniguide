"""Settings from the environment (and an optional worker/.env file)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = WORKER_ROOT.parent


def load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=VALUE lines; never overrides variables already set."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


@dataclass(frozen=True)
class Settings:
    worker_database_url: str | None
    operator_database_url: str | None
    data_gov_api_key: str | None
    crawler_contact: str
    notifier_database_url: str | None = None
    analyst_database_url: str | None = None
    site_url: str = "http://localhost:3000"
    extractor: str = "gemini"
    gemini_model: str | None = None
    gemini_api_key: str | None = None
    ollama_model: str | None = None
    enrich_fresh_days: int = 7

    @property
    def user_agent(self) -> str:
        return f"UniguideBot/0.1 (+mailto:{self.crawler_contact}; official pages only)"


def get_settings() -> Settings:
    load_dotenv(WORKER_ROOT / ".env")
    return Settings(
        worker_database_url=os.environ.get("WORKER_DATABASE_URL") or None,
        operator_database_url=os.environ.get("OPERATOR_DATABASE_URL") or None,
        data_gov_api_key=os.environ.get("DATA_GOV_API_KEY") or None,
        crawler_contact=os.environ.get("CRAWLER_CONTACT") or "ops@example.com",
        notifier_database_url=os.environ.get("NOTIFIER_DATABASE_URL") or None,
        analyst_database_url=os.environ.get("ANALYST_DATABASE_URL") or None,
        site_url=os.environ.get("SITE_URL") or os.environ.get("NEXT_PUBLIC_SITE_URL") or "http://localhost:3000",
        extractor=(os.environ.get("EXTRACTOR") or "gemini").lower(),
        gemini_model=os.environ.get("GEMINI_MODEL") or None,
        gemini_api_key=os.environ.get("GEMINI_API_KEY") or None,
        ollama_model=os.environ.get("OLLAMA_MODEL") or None,
        enrich_fresh_days=int(os.environ.get("ENRICH_FRESH_DAYS") or 7),
    )
