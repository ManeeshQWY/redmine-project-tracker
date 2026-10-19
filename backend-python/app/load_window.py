"""The period of data to load: tickets by last-updated date, time entries by date spent.

Either "the last N days" or an explicit from/to range; no bounds at all means everything.
Routers turn the query string into a LoadWindow (`load_window_params`), and everything
below them — Redmine queries and the cache keys — works from its resolved start/end dates."""

import datetime
import re
from dataclasses import dataclass

from fastapi import HTTPException, Query

from .config import DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class LoadWindow:
    start: str | None = None  # YYYY-MM-DD, inclusive
    end: str | None = None  # YYYY-MM-DD, inclusive

    @property
    def key(self) -> str:
        """Part of every cache key — different windows are different datasets."""
        return f"{self.start or ''}~{self.end or ''}"

    @classmethod
    def last_days(cls, days: int) -> "LoadWindow":
        if days <= 0:
            return cls()
        today = datetime.datetime.now(datetime.timezone.utc).date()
        return cls(start=(today - datetime.timedelta(days=days)).isoformat())


ALL_TIME = LoadWindow()


def _check_date(value: str, label: str) -> str:
    if not _DATE_RE.match(value):
        raise ValueError(f'"{label}" must be a date like 2026-03-31.')
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        raise ValueError(f'"{label}" is not a real date.') from None
    return value


def resolve_window(days: int, date_from: str | None, date_to: str | None) -> LoadWindow:
    """An explicit from/to range wins over `days`."""
    if date_from or date_to:
        start = _check_date(date_from, "from") if date_from else None
        end = _check_date(date_to, "to") if date_to else None
        if start and end and start > end:
            raise ValueError('"from" must not be after "to".')
        return LoadWindow(start=start, end=end)
    return LoadWindow.last_days(days)


def load_window_params(
    days: int = Query(DEFAULT_WINDOW_DAYS, ge=0, le=MAX_WINDOW_DAYS),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
) -> LoadWindow:
    """FastAPI dependency: ?days=30 (0 = everything) or ?from=2026-01-01&to=2026-03-31."""
    try:
        return resolve_window(days, date_from, date_to)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
