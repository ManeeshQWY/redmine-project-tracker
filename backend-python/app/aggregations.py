"""Pure aggregation functions mirroring frontend/src/utils/aggregations.ts. Not wired
into any route (the frontend computes these client-side from already-fetched data,
same as the Node backend) — kept here, tested, as the reusable/testable business logic
the original spec asked for."""

from dataclasses import dataclass
from datetime import datetime, timezone

from .models import Issue


def count_closed(issues: list[Issue]) -> int:
    return sum(1 for i in issues if i.statusIsClosed)


def count_not_closed(issues: list[Issue]) -> int:
    return len(issues) - count_closed(issues)


@dataclass
class CountBucket:
    key: str
    count: int
    percent: float


def _group_by_key(issues: list[Issue], key_fn) -> list[CountBucket]:
    counts: dict[str, int] = {}
    for issue in issues:
        key = key_fn(issue) or "(blank)"
        counts[key] = counts.get(key, 0) + 1
    total = len(issues) or 1
    buckets = [CountBucket(key=k, count=c, percent=(c / total) * 100) for k, c in counts.items()]
    return sorted(buckets, key=lambda b: b.count, reverse=True)


def aggregate_by_status(issues: list[Issue]) -> list[CountBucket]:
    return _group_by_key(issues, lambda i: i.status or None)


def aggregate_by_tracker(issues: list[Issue]) -> list[CountBucket]:
    return _group_by_key(issues, lambda i: i.tracker or None)


def aggregate_by_priority(issues: list[Issue]) -> list[CountBucket]:
    return _group_by_key(issues, lambda i: i.priority or None)


def aggregate_by_target_version(issues: list[Issue]) -> list[CountBucket]:
    return _group_by_key(issues, lambda i: i.targetVersion or "No Target Version")


AGING_BUCKETS = [
    ("0-3 Days", 0, 3),
    ("4-7 Days", 4, 7),
    ("8-15 Days", 8, 15),
    ("16-30 Days", 16, 30),
    ("31-60 Days", 31, 60),
    ("60+ Days", 61, float("inf")),
]


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def days_between(start: str, end: datetime) -> int:
    diff = end - _parse_iso(start)
    return max(0, diff.days)


def ticket_age_days(issue: Issue, now: datetime | None = None) -> int | None:
    if issue.statusIsClosed or not issue.createdOn:
        return None
    return days_between(issue.createdOn, now or datetime.now(timezone.utc))


def resolution_time_days(issue: Issue) -> int | None:
    if not issue.statusIsClosed or not issue.closedOn or not issue.createdOn:
        return None
    return days_between(issue.createdOn, _parse_iso(issue.closedOn))


def bucket_aging_open_tickets(issues: list[Issue], now: datetime | None = None) -> list[CountBucket]:
    now = now or datetime.now(timezone.utc)
    counts = {label: 0 for label, _, _ in AGING_BUCKETS}
    total = 0
    for issue in issues:
        age = ticket_age_days(issue, now)
        if age is None:
            continue
        for label, lo, hi in AGING_BUCKETS:
            if lo <= age <= hi:
                counts[label] += 1
                total += 1
                break
    total = total or 1
    return [CountBucket(key=label, count=counts[label], percent=(counts[label] / total) * 100) for label, _, _ in AGING_BUCKETS]


@dataclass
class ResolutionTimeStats:
    average: float | None
    median: float | None
    minimum: int | None
    maximum: int | None
    sample_size: int


def resolution_time_stats(issues: list[Issue]) -> ResolutionTimeStats:
    times = [t for t in (resolution_time_days(i) for i in issues) if t is not None]
    if not times:
        return ResolutionTimeStats(average=None, median=None, minimum=None, maximum=None, sample_size=0)
    times.sort()
    n = len(times)
    mid = n // 2
    median = (times[mid - 1] + times[mid]) / 2 if n % 2 == 0 else times[mid]
    return ResolutionTimeStats(average=sum(times) / n, median=median, minimum=times[0], maximum=times[-1], sample_size=n)


@dataclass
class EstimateVsActual:
    issue_id: int
    estimated_hours: float | None
    actual_hours: float | None
    variance: float | None
    variance_percent: float | None


def estimate_vs_actual(issue: Issue) -> EstimateVsActual:
    """Actual hours use totalSpentHours (primary effort metric per spec), falling back
    to spentHours if totalSpentHours is unavailable."""
    estimated = issue.estimatedHours
    actual = issue.totalSpentHours if issue.totalSpentHours is not None else issue.spentHours
    if estimated is None or actual is None:
        return EstimateVsActual(issue_id=issue.id, estimated_hours=estimated, actual_hours=actual, variance=None, variance_percent=None)
    variance = actual - estimated
    variance_percent = None if estimated == 0 else (variance / estimated) * 100
    return EstimateVsActual(issue_id=issue.id, estimated_hours=estimated, actual_hours=actual, variance=variance, variance_percent=variance_percent)
