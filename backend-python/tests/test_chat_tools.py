from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app.chat_tools import build_tools
from app.models import Issue

BASE_URL = "https://redmine.test"


def make_issue(**overrides) -> Issue:
    defaults = dict(
        id=1,
        project="P",
        tracker="Bug",
        status="New",
        statusIsClosed=False,
        priority="Normal",
        author="A",
        subject="Something broke",
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


def tools_by_name(issues):
    tools, _recorder = build_tools(issues, "fake-key", "fake-project")
    return {fn.__name__: fn for fn in tools}


class TestGetTicketById:
    def test_finds_ticket_by_exact_id_with_full_detail(self):
        issue = make_issue(id=25132, subject="Fix login crash", tracker="Bug", assignedTo="Rangeen Suresh", estimatedHours=5.0, totalSpentHours=3.5)
        result = tools_by_name([issue])["get_ticket_by_id"](25132)
        assert result["found"] is True
        assert result["id"] == 25132
        assert result["subject"] == "Fix login crash"
        assert result["assignedTo"] == "Rangeen Suresh"
        assert result["estimatedHours"] == 5.0
        assert result["totalSpentHours"] == 3.5

    def test_falls_back_to_spent_hours_when_total_spent_hours_is_none(self):
        issue = make_issue(id=1, totalSpentHours=None, spentHours=2.0)
        result = tools_by_name([issue])["get_ticket_by_id"](1)
        assert result["totalSpentHours"] == 2.0

    def test_unknown_id_returns_found_false(self):
        result = tools_by_name([make_issue(id=1)])["get_ticket_by_id"](99999)
        assert result == {"found": False}

    def test_search_tickets_search_text_does_not_match_a_ticket_id(self):
        # Regression guard: search_tickets must NOT silently "work" for ID lookups —
        # get_ticket_by_id is the only reliable path, per the model instructions.
        issue = make_issue(id=25132, subject="Fix login crash")
        result = tools_by_name([issue])["search_tickets"](search_text="25132")
        assert result["totalMatches"] == 0


class TestGetTicketCounts:
    def test_counts_total_open_closed(self):
        issues = [
            make_issue(id=1, statusIsClosed=False),
            make_issue(id=2, statusIsClosed=False),
            make_issue(id=3, statusIsClosed=True),
        ]
        result = tools_by_name(issues)["get_ticket_counts"]()
        assert result == {"total": 3, "open": 2, "closed": 1}


class TestGetAssigneeBreakdown:
    def test_defaults_to_open_tickets_only(self):
        issues = [
            make_issue(id=1, assignedTo="Alice", statusIsClosed=False),
            make_issue(id=2, assignedTo="Alice", statusIsClosed=True),
            make_issue(id=3, assignedTo="Bob", statusIsClosed=False),
        ]
        result = tools_by_name(issues)["get_assignee_breakdown"]()
        counts = {row["key"]: row["count"] for row in result}
        assert counts == {"Alice": 1, "Bob": 1}

    def test_only_open_false_includes_closed(self):
        issues = [
            make_issue(id=1, assignedTo="Alice", statusIsClosed=False),
            make_issue(id=2, assignedTo="Alice", statusIsClosed=True),
        ]
        result = tools_by_name(issues)["get_assignee_breakdown"](only_open=False)
        counts = {row["key"]: row["count"] for row in result}
        assert counts == {"Alice": 2}


class TestGetOverdueTickets:
    def test_finds_open_tickets_past_due_date_sorted_soonest_first(self):
        today = datetime.now(timezone.utc).date()
        issues = [
            make_issue(id=1, dueDate=(today - timedelta(days=1)).isoformat(), statusIsClosed=False),
            make_issue(id=2, dueDate=(today - timedelta(days=10)).isoformat(), statusIsClosed=False),
            make_issue(id=3, dueDate=(today - timedelta(days=1)).isoformat(), statusIsClosed=True),  # closed, excluded
            make_issue(id=4, dueDate=(today + timedelta(days=5)).isoformat(), statusIsClosed=False),  # not overdue yet
        ]
        result = tools_by_name(issues)["get_overdue_tickets"]()
        assert result["totalMatches"] == 2
        assert [t["id"] for t in result["tickets"]] == [2, 1]

    def test_limit_caps_returned_tickets_but_not_the_total(self):
        today = datetime.now(timezone.utc).date()
        issues = [make_issue(id=i, dueDate=(today - timedelta(days=i)).isoformat(), statusIsClosed=False) for i in range(1, 4)]
        result = tools_by_name(issues)["get_overdue_tickets"](limit=1)
        assert result["totalMatches"] == 3
        assert len(result["tickets"]) == 1


class TestSearchTickets:
    def test_filters_are_case_insensitive_and_combine_with_and(self):
        issues = [
            make_issue(id=1, tracker="Bug", priority="High", assignedTo="Alice"),
            make_issue(id=2, tracker="Bug", priority="Low", assignedTo="Alice"),
            make_issue(id=3, tracker="Feature", priority="High", assignedTo="Alice"),
        ]
        result = tools_by_name(issues)["search_tickets"](tracker="bug", priority="high")
        assert result["totalMatches"] == 1
        assert result["tickets"][0]["id"] == 1

    def test_search_text_matches_subject_substring(self):
        issues = [
            make_issue(id=1, subject="Login page crashes on submit"),
            make_issue(id=2, subject="Export button misaligned"),
        ]
        result = tools_by_name(issues)["search_tickets"](search_text="crash")
        assert result["totalMatches"] == 1
        assert result["tickets"][0]["id"] == 1

    def test_no_filters_returns_everything_up_to_limit(self):
        issues = [make_issue(id=i) for i in range(1, 4)]
        result = tools_by_name(issues)["search_tickets"]()
        assert result["totalMatches"] == 3
        assert len(result["tickets"]) == 3


class TestFilterRecorder:
    """The recorder is auto-populated by search_tickets itself, only when a call
    actually truncates its results — not by a separate bookkeeping tool the model has
    to remember to call, and not for a call that already shows everything."""

    def test_recorder_is_empty_until_a_truncating_call_happens(self):
        tools, recorder = build_tools([make_issue(id=1)], "fake-key", "fake-project")
        assert recorder == {}

    def test_a_fully_shown_result_does_not_populate_the_recorder(self):
        issues = [make_issue(id=i, assignedTo="Alice") for i in range(1, 4)]  # well under MAX_RESULTS
        tools, recorder = build_tools(issues, "fake-key", "fake-project")
        search = {fn.__name__: fn for fn in tools}["search_tickets"]
        search(assigned_to="Alice")
        assert recorder == {}

    def test_a_truncating_call_records_its_own_filter_args(self):
        issues = [make_issue(id=i, assignedTo="Alice") for i in range(1, 25)]  # exceeds MAX_RESULTS
        tools, recorder = build_tools(issues, "fake-key", "fake-project")
        search = {fn.__name__: fn for fn in tools}["search_tickets"]
        search(assigned_to="Alice", tracker="Bug")
        assert recorder == {"assignee": "Alice", "tracker": "Bug", "status": None, "priority": None, "search": None}

    def test_the_most_recent_truncating_call_wins(self):
        # 20 tickets each for Alice and Bob — each individually exceeds MAX_RESULTS, so
        # both calls below truncate and the second one should overwrite the first.
        issues = [make_issue(id=i, assignedTo="Alice") for i in range(1, 21)] + [
            make_issue(id=i, assignedTo="Bob") for i in range(21, 41)
        ]
        tools, recorder = build_tools(issues, "fake-key", "fake-project")
        search = {fn.__name__: fn for fn in tools}["search_tickets"]
        search(assigned_to="Alice")
        search(assigned_to="Bob")
        assert recorder["assignee"] == "Bob"


class TestGetTimeEntriesForTicket:
    def _tool(self, issues, project_identifier):
        tools, _recorder = build_tools(issues, "test-key", project_identifier)
        return {fn.__name__: fn for fn in tools}["get_time_entries_for_ticket"]

    @pytest.mark.asyncio
    async def test_unknown_ticket_id_short_circuits_without_a_redmine_call(self):
        tool = self._tool([make_issue(id=1)], "time-entries-unknown-id")
        result = await tool(99999)
        assert result == {"found": False, "entries": []}

    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_only_entries_for_the_requested_ticket_with_a_summed_total(self):
        respx.get(url__regex=rf"{BASE_URL}/time_entries\.json.*").mock(
            return_value=httpx.Response(
                200,
                json={
                    "time_entries": [
                        {"id": 1, "project": {"name": "P"}, "issue": {"id": 25132}, "user": {"name": "Rangeen Suresh"}, "activity": {"name": "Development"}, "hours": 4.5, "spent_on": "2026-02-01"},
                        {"id": 2, "project": {"name": "P"}, "issue": {"id": 25132}, "user": {"name": "Amal Prasad"}, "activity": {"name": "QA"}, "hours": 1.0, "spent_on": "2026-02-02"},
                        {"id": 3, "project": {"name": "P"}, "issue": {"id": 999}, "user": {"name": "Someone Else"}, "activity": {"name": "Development"}, "hours": 10.0, "spent_on": "2026-02-01"},
                    ],
                    "total_count": 3,
                    "offset": 0,
                    "limit": 100,
                },
            )
        )
        tool = self._tool([make_issue(id=25132)], "time-entries-mixed")
        result = await tool(25132)
        assert result["found"] is True
        assert result["totalHours"] == 5.5
        assert {e["user"] for e in result["entries"]} == {"Rangeen Suresh", "Amal Prasad"}
