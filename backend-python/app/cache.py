import asyncio
import time
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    """Minimal in-memory TTL cache. Avoids re-fetching thousands of issues on every
    filter/UI interaction — only a project switch or explicit refresh triggers a re-fetch."""

    def __init__(self, ttl_seconds: float):
        self._ttl_seconds = ttl_seconds
        self._store: dict[str, tuple[T, float]] = {}

    def get(self, key: str) -> T | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: T) -> None:
        self._store[key] = (value, time.monotonic() + self._ttl_seconds)

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


class InFlightGuard(Generic[T]):
    """Deduplicates concurrent fetches for the same key so simultaneous requests don't
    trigger duplicate upstream calls."""

    def __init__(self):
        self._in_flight: dict[str, asyncio.Task[T]] = {}

    async def run(self, key: str, fn: Callable[[], Awaitable[T]]) -> T:
        existing = self._in_flight.get(key)
        if existing is not None:
            return await existing

        task: asyncio.Task[T] = asyncio.ensure_future(fn())
        self._in_flight[key] = task
        try:
            return await task
        finally:
            self._in_flight.pop(key, None)
