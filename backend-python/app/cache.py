import asyncio
import time
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    """Minimal in-memory TTL cache. Avoids re-fetching thousands of issues on every
    filter/UI interaction — only a project switch or explicit refresh triggers a re-fetch."""

    def __init__(self, ttl_seconds: float, max_entries: int | None = None):
        self._ttl_seconds = ttl_seconds
        # When set, the oldest entries are dropped once there are more than this many — a
        # memory guard for caches whose values are large (thousands of tickets each).
        self._max_entries = max_entries
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
        self._store.pop(key, None)  # re-inserting moves it to the "newest" end
        self._store[key] = (value, time.monotonic() + self._ttl_seconds)
        if self._max_entries is not None:
            while len(self._store) > self._max_entries:
                del self._store[next(iter(self._store))]

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


class InFlightGuard(Generic[T]):
    """Deduplicates concurrent fetches for the same key so simultaneous requests don't
    trigger duplicate upstream calls. If every request waiting on a fetch goes away (the
    person cancelled), the fetch itself is cancelled instead of carrying on in the
    background; while at least one still waits, cancelling another leaves it running."""

    def __init__(self):
        # key -> [shared task, number of requests waiting on it]
        self._in_flight: dict[str, list] = {}

    async def run(self, key: str, fn: Callable[[], Awaitable[T]]) -> T:
        entry = self._in_flight.get(key)
        if entry is None or entry[0].done():
            entry = [asyncio.ensure_future(fn()), 0]
            self._in_flight[key] = entry
        task: asyncio.Task[T] = entry[0]
        entry[1] += 1
        try:
            # shield: cancelling THIS waiter must not cancel the fetch the others share
            return await asyncio.shield(task)
        finally:
            entry[1] -= 1
            if entry[1] == 0:
                if not task.done():
                    task.cancel()
                if self._in_flight.get(key) is entry:
                    del self._in_flight[key]
