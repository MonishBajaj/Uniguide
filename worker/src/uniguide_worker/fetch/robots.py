"""robots.txt handling with protego (the stdlib parser mishandles several real-world files)."""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx
from protego import Protego


class RobotsCache:
    def __init__(self, client: httpx.Client, user_agent: str) -> None:
        self._client = client
        self._user_agent = user_agent
        self._parsers: dict[str, Protego | None] = {}

    def _load(self, origin: str) -> Protego | None:
        """None means "do not crawl this host"."""
        try:
            response = self._client.get(f"{origin}/robots.txt", headers={"User-Agent": self._user_agent})
        except httpx.HTTPError:
            return None  # cannot read robots.txt: stay away
        if response.status_code in (401, 403) or response.status_code >= 500:
            return None
        if response.status_code >= 400:
            return Protego.parse("")  # no robots.txt: everything allowed
        return Protego.parse(response.text)

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._parsers:
            self._parsers[origin] = self._load(origin)
        parser = self._parsers[origin]
        return parser is not None and bool(parser.can_fetch(url, self._user_agent))

    def crawl_delay(self, url: str) -> float | None:
        parts = urlsplit(url)
        parser = self._parsers.get(f"{parts.scheme}://{parts.netloc}")
        delay = parser.crawl_delay(self._user_agent) if parser else None
        return float(delay) if delay is not None else None
