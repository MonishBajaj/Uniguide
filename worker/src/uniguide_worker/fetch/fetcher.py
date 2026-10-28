"""Fetch official pages politely and reduce them to normalised text plus a content hash.

Rules: official university and government pages only, robots.txt respected, one request per
host every few seconds, no aggregators, nothing behind a login. We store hashes and extracted
facts, never page copies.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from selectolax.lexbor import LexborHTMLParser

from .ratelimit import HostRateLimiter
from .robots import RobotsCache

# Aggregators and rankings sites whose terms forbid reuse, or which are not primary sources.
BLOCKED_DOMAINS = frozenset(
    {
        "yocket.com",
        "studyportals.com",
        "mastersportal.com",
        "bachelorsportal.com",
        "phdportal.com",
        "usnews.com",
        "niche.com",
        "topuniversities.com",
        "timeshighereducation.com",
        "leverageedu.com",
        "shiksha.com",
        "thegradcafe.com",
        "gradcafe.com",
        "collegevine.com",
        "collegedunia.com",
        "idp.com",
        "applyboard.com",
        "leapscholar.com",
        "edvoy.com",
    }
)
LOGIN_HINTS = re.compile(r"/(log-?in|sign-?in|sso|auth|account)(/|$|\?)", re.IGNORECASE)


class FetchRefused(Exception):
    """The URL must not be fetched (blocked domain, robots.txt, login wall)."""


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    status: int
    text: str
    content_hash: str
    etag: str | None
    last_modified: str | None
    not_modified: bool


def is_blocked(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in BLOCKED_DOMAINS)


def normalise_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip()


def html_to_text(html: str) -> str:
    tree = LexborHTMLParser(html)
    for node in tree.css("script, style, noscript, svg, template, iframe"):
        node.decompose()
    body = tree.body or tree.root
    return normalise_text(body.text(separator=" ") if body else "")


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Fetcher:
    def __init__(
        self,
        user_agent: str,
        client: httpx.Client | None = None,
        limiter: HostRateLimiter | None = None,
    ) -> None:
        self.user_agent = user_agent
        self.client = client or httpx.Client(timeout=30.0, follow_redirects=True)
        self.limiter = limiter or HostRateLimiter()
        self.robots = RobotsCache(self.client, user_agent)

    def check(self, url: str) -> None:
        if not url.startswith(("https://", "http://")):
            raise FetchRefused(f"Not a web URL: {url}")
        if is_blocked(url):
            raise FetchRefused(f"Aggregator or rankings site; use the official page instead: {url}")
        if LOGIN_HINTS.search(urlsplit(url).path):
            raise FetchRefused(f"Looks like a login page: {url}")
        if not self.robots.allowed(url):
            raise FetchRefused(f"Disallowed by robots.txt: {url}")

    def fetch(self, url: str, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
        self.check(url)
        host = urlsplit(url).hostname or ""
        delay = self.robots.crawl_delay(url)
        if delay and delay > self.limiter.min_interval:
            self.limiter.min_interval = delay
        self.limiter.wait(host)

        headers = {"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        response = self.client.get(url, headers=headers)

        final_url = str(response.url)
        if final_url != url and (is_blocked(final_url) or LOGIN_HINTS.search(urlsplit(final_url).path)):
            raise FetchRefused(f"Redirected to a page we do not read: {final_url}")
        if response.status_code in (401, 403):
            raise FetchRefused(f"Access restricted (HTTP {response.status_code}): {url}")

        not_modified = response.status_code == 304
        text = "" if not_modified else html_to_text(response.text)
        return FetchResult(
            url=url,
            final_url=final_url,
            status=response.status_code,
            text=text,
            content_hash=content_hash(text) if text else "",
            etag=response.headers.get("ETag"),
            last_modified=response.headers.get("Last-Modified"),
            not_modified=not_modified,
        )
