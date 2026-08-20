from datetime import datetime, timezone

import pytest

from app.aggregations import (
    aggregate_by_assignee,
    aggregate_by_priority,
    aggregate_by_status,
    aggregate_by_tracker,
    bucket_aging_open_tickets,
    count_closed,
    count_not_closed,
    estimate_vs_actual,
    resolution_time_days,
    resolution_time_stats,
    ticket_age_days,
)
from app.models import Issue


def make_issue(**overrides) -> Issue:
    defaults = dict(
        id=1,
        project="P",
        tracker="Bug",
        status="New",
        statusIsClosed=False,
        priority="Normal",
        author="A",
        subject="S",
        description=None,
        doneRatio=0,
        createdOn="2026-01-01T00:00:00Z",
        updatedOn="2026-01-01T00:00:00Z",
        assignedTo=None,
        targetVersion=None,
        startDate=None,
        dueDate=None,
        closedOn=None,
        estimatedHours=None,
        spentHours=None,
        totalSpentHours=None,
        totalEstimatedHours=None,
        assignedQA=None,
        platform=None,
        additionalAssignee=None,
        estimatedTimeForQA=None,
        customFields=[],
    )
    defaults.update(overrides)
    return Issue(**defaults)


class TestClosedNotClosed:
    def test_counts_closed_based_on_status_is_closed_not_hardcoded_id(self):
        issues = [
            make_issue(id=1, status="Closed", statusIsClosed=True),
            make_issue(id=2, status="Not a Defect", statusIsClosed=True),
            make_issue(id=3, status="New", statusIsClosed=False),
            make_issue(id=4, status="In Progress", statusIsClosed=False),
        ]
        assert count_closed(issues) == 2
        assert count_not_closed(issues) == 2
        assert count_closed(issues) + count_not_closed(issues) == len(issues)

    def test_handles_empty_issue_list(self):
        assert count_closed([]) == 0
        assert count_not_closed([]) == 0


class TestAggregation:
    issues = [
        make_issue(id=1, status="New", tracker="Bug", priority="High"),
        make_issue(id=2, status="New", tracker="Feature", priority="Normal"),
        make_issue(id=3, status="Closed", tracker="Bug", priority="High"),
    ]

    def test_aggregates_by_status_with_counts_and_percentages(self):
        result = aggregate_by_status(self.issues)
        new_bucket = next(b for b in result if b.key == "New")
        assert new_bucket.count == 2
        assert new_bucket.percent == pytest.approx(66.67, abs=0.1)

    def test_aggregates_by_tracker(self):
        result = aggregate_by_tracker(self.issues)
        assert next(b for b in result if b.key == "Bug").count == 2
        assert next(b for b in result if b.key == "Feature").count == 1

    def test_aggregates_by_priority(self):
        result = aggregate_by_priority(self.issues)
        assert next(b for b in result if b.key == "High").count == 2

    def test_aggregates_by_assignee(self):
        issues = [
            make_issue(id=1, assignedTo="Alice"),
            make_issue(id=2, assignedTo="Alice"),
            make_issue(id=3, assignedTo="Bob"),
            make_issue(id=4, assignedTo=None),
        ]
        result = aggregate_by_assignee(issues)
        assert next(b for b in result if b.key == "Alice").count == 2
        assert next(b for b in result if b.key == "Bob").count == 1
        assert next(b for b in result if b.key == "(blank)").count == 1


class TestNullHandling:
    def test_does_not_throw_and_groups_blanks(self):
        issues = [make_issue(id=1, status="")]
        result = aggregate_by_status(issues)
        assert any(b.key == "(blank)" for b in result)


class TestAging:
    def test_computes_ticket_age_only_for_open_tickets(self):
        now = datetime(2026, 8, 13, tzinfo=timezone.utc)
        open_issue = make_issue(id=1, statusIsClosed=False, createdOn="2026-08-05T00:00:00Z")
        closed_issue = make_issue(id=2, statusIsClosed=True, createdOn="2026-08-01T00:00:00Z")
        assert ticket_age_days(open_issue, now) == 8
        assert ticket_age_days(closed_issue, now) is None

    def test_buckets_open_tickets_into_correct_ranges(self):
        now = datetime(2026, 8, 13, tzinfo=timezone.utc)
        issues = [
            make_issue(id=1, createdOn="2026-08-12T00:00:00Z"),  # 1 day -> 0-3
            make_issue(id=2, createdOn="2026-08-06T00:00:00Z"),  # 7 days -> 4-7
            make_issue(id=3, createdOn="2026-05-01T00:00:00Z"),  # >60 -> 60+
            make_issue(id=4, statusIsClosed=True, closedOn="2026-08-10T00:00:00Z"),  # excluded (closed)
        ]
        buckets = bucket_aging_open_tickets(issues, now)
        assert next(b for b in buckets if b.key == "0-3 Days").count == 1
        assert next(b for b in buckets if b.key == "4-7 Days").count == 1
        assert next(b for b in buckets if b.key == "60+ Days").count == 1
        assert sum(b.count for b in buckets) == 3


class TestResolutionTime:
    def test_only_calculates_for_closed_tickets_with_closed_on(self):
        no_closed_on = make_issue(id=1, statusIsClosed=True, closedOn=None)
        open_issue = make_issue(id=2, statusIsClosed=False, closedOn=None)
        resolved = make_issue(id=3, statusIsClosed=True, createdOn="2026-08-01T00:00:00Z", closedOn="2026-08-05T00:00:00Z")
        assert resolution_time_days(no_closed_on) is None
        assert resolution_time_days(open_issue) is None
        assert resolution_time_days(resolved) == 4

    def test_computes_average_median_min_max(self):
        issues = [
            make_issue(id=1, statusIsClosed=True, createdOn="2026-08-01T00:00:00Z", closedOn="2026-08-03T00:00:00Z"),  # 2
            make_issue(id=2, statusIsClosed=True, createdOn="2026-08-01T00:00:00Z", closedOn="2026-08-05T00:00:00Z"),  # 4
            make_issue(id=3, statusIsClosed=True, createdOn="2026-08-01T00:00:00Z", closedOn="2026-08-11T00:00:00Z"),  # 10
            make_issue(id=4, statusIsClosed=False),  # excluded
        ]
        stats = resolution_time_stats(issues)
        assert stats.sample_size == 3
        assert stats.minimum == 2
        assert stats.maximum == 10
        assert stats.median == 4
        assert stats.average == pytest.approx(16 / 3, abs=1e-5)

    def test_returns_none_when_no_resolvable_tickets(self):
        stats = resolution_time_stats([make_issue(id=1, statusIsClosed=False)])
        assert stats.sample_size == 0
        assert stats.average is None


class TestEstimateVsActual:
    def test_prefers_total_spent_hours(self):
        issue = make_issue(estimatedHours=10, spentHours=3, totalSpentHours=8)
        result = estimate_vs_actual(issue)
        assert result.actual_hours == 8
        assert result.variance == -2
        assert result.variance_percent == pytest.approx(-20, abs=1e-5)

    def test_handles_zero_estimate_safely(self):
        issue = make_issue(estimatedHours=0, totalSpentHours=5)
        result = estimate_vs_actual(issue)
        assert result.variance == 5
        assert result.variance_percent is None

    def test_handles_none_estimate_or_actual_safely(self):
        issue = make_issue(estimatedHours=None, totalSpentHours=None, spentHours=None)
        result = estimate_vs_actual(issue)
        assert result.variance is None
        assert result.variance_percent is None
