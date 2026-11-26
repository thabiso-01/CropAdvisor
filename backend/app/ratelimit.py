"""In-memory sliding-window request limits, so one device or address cannot use up the AI quota.

Limits are kept per process: fine for the single API container this app runs. Several API
replicas would need a shared store such as Redis instead.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

WINDOW_SECONDS = 3600


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, keys: list[str], limit: int, window: int = WINDOW_SECONDS) -> None:
        """Record one request for every key, or raise 429 if any key is over `limit` per `window` seconds."""
        if limit <= 0:
            return
        now = time.monotonic()
        with self._lock:
            for key in keys:
                q = self._hits[key]
                while q and now - q[0] >= window:
                    q.popleft()
                if len(q) >= limit:
                    retry = int(window - (now - q[0])) + 1
                    raise HTTPException(
                        429,
                        f"Too many requests. Please try again in {max(1, retry // 60)} min.",
                        headers={"Retry-After": str(retry)},
                    )
            for key in keys:
                self._hits[key].append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """The caller's address. nginx sets X-Real-IP; the API port is not published, so it can't be spoofed."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
