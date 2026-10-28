"""Per-host politeness: at most one request every `min_interval` seconds to the same host."""

from __future__ import annotations

import time
from collections.abc import Callable


class HostRateLimiter:
    def __init__(
        self,
        min_interval: float = 5.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.min_interval = min_interval
        self._clock = clock
        self._sleep = sleep
        self._last: dict[str, float] = {}

    def wait(self, host: str) -> float:
        """Block until `host` may be contacted again. Returns the seconds waited."""
        now = self._clock()
        last = self._last.get(host)
        waited = 0.0
        if last is not None and now - last < self.min_interval:
            waited = self.min_interval - (now - last)
            self._sleep(waited)
        self._last[host] = self._clock()
        return waited
