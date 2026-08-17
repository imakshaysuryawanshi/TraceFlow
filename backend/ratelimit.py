"""
Minimal in-process rate limiter for TraceFlow (no external dependencies).
===========================================================================

Protects the expensive /api/execute (which can spend paid LLM tokens) and
/api/parse endpoints from being spammed by a single client. Uses a
sliding-window counter keyed by client IP.

Notes:
  - State is per-process: each uvicorn worker carries its own budget. For a
    lightweight teaching tool this is an acceptable trade-off (no Redis).
  - The client key is the direct socket peer address by default. Only when the
    direct peer is a configured trusted proxy is the X-Forwarded-For header
    honoured (using the rightmost entry, which the trusted proxy itself
    appended). This stops a client from rotating spoofed X-Forwarded-For
    values to bypass the budget.

Configuration (environment variables):
  RATE_LIMIT_EXECUTE_PER_MINUTE  requests/min for /api/execute (default 30)
  RATE_LIMIT_PARSE_PER_MINUTE    requests/min for /api/parse   (default 60)
  RATE_LIMIT_ENABLED             set "false" to disable         (default true)
  TRUSTED_PROXIES                comma-separated IPs whose forwarded
                                 X-Forwarded-For values are trusted (default none)
"""

import os
import threading
import time
from typing import Dict, List

from fastapi import HTTPException, Request


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


class SlidingWindowLimiter:
    """Fixed-limit sliding-window counter keyed by an arbitrary string."""

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Return True if `key` is within budget, recording the request."""
        if self.limit <= 0:
            return False
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                # Keep memory bounded: prune dead keys when the table grows.
                if len(self._hits) > 10_000:
                    self._gc()
                self._hits[key] = [now]
                return True
            # Timestamps are appended in order, so prune from the front.
            while bucket and bucket[0] <= cutoff:
                bucket.pop(0)
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True

    def _gc(self) -> None:
        for k, bucket in list(self._hits.items()):
            if not bucket:
                del self._hits[k]


# ---------------------------------------------------------------------------
# FastAPI dependency factories
# ---------------------------------------------------------------------------

_execute_limiter = SlidingWindowLimiter(limit=_env_int("RATE_LIMIT_EXECUTE_PER_MINUTE", 30))
_parse_limiter = SlidingWindowLimiter(limit=_env_int("RATE_LIMIT_PARSE_PER_MINUTE", 60))


def _trusted_proxies() -> set:
    raw = os.environ.get("TRUSTED_PROXIES", "").strip()
    if not raw:
        return set()
    return {ip.strip() for ip in raw.split(",") if ip.strip()}


def _client_key(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if peer in _trusted_proxies():
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            # The rightmost entry is the one appended by the trusted proxy
            # (closest to us); anything to its left could be client-forged.
            entries = [e.strip() for e in fwd.split(",") if e.strip()]
            if entries:
                return entries[-1]
    return peer


async def rate_limit_execute(request: Request) -> None:
    if not _env_bool("RATE_LIMIT_ENABLED", True):
        return
    if not _execute_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
        )


async def rate_limit_parse(request: Request) -> None:
    if not _env_bool("RATE_LIMIT_ENABLED", True):
        return
    if not _parse_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment and try again.",
        )
