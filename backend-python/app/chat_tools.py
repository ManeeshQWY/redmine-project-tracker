"""Read-only 'tools' the chatbot can call to answer questions about a project's
tickets. Each function closes over that project's already-cached Issue list (see
data_store.load_project_issues) so a chat turn never triggers an extra Redmine call —
it just runs the same pure aggregation logic the dashboard itself uses. Scoped to the
whole project's tickets, not whatever tracker/etc. filters happen to be active in the
UI right now.

Passed directly to the Gemini SDK's "automatic function calling" (plain Python
functions as tools) — the SDK derives each tool's schema from its type hints and
docstring, so both matter: the docstring is what the model reads to decide when to
call the tool."""

from datetime import datetime, timezone
from typing import Callable

from .aggregations import (
    CountBucket,
    aggregate_by_assignee,
    aggregate_by_priority,
    aggregate_by_status,
    aggregate_by_target_version,
    aggregate_by_tracker,
    bucket_aging_open_tickets,
    count_closed,
    count_not_closed,
    resolution_time_stats,
)
from .data_store import load_time_entries
from .models import Issue

MAX_RESULTS = 15


def _bucket_dicts(buckets: list[CountBucket]) -> list[dict]:
    return [{"key": b.key, "count": b.count, "percent": round(b.percent, 1)} for b in buckets]


def _summarize(issue: Issue) -> dict:
    return {
        "id": issue.id,
        "subject": issue.subject,
        "tracker": issue.tracker,
        "status": issue.status,
        "priority": issue.priority,
        "assignedTo": issue.assignedTo,
        "dueDate": issue.dueDate,
        "createdOn": issue.createdOn,
    }


def _detail(issue: Issue) -> dict:
    return {
        "found": True,
        "id": issue.id,
        "subject": issue.subject,
        "tracker": issue.tracker,
        "status": issue.status,
        "priority": issue.priority,
        "assignedTo": issue.assignedTo,
        "additionalAssignees": [a.name for a in issue.additionalAssignees],
        "targetVersion": issue.targetVersion,
        "createdOn": issue.createdOn,
        "updatedOn": issue.updatedOn,
        "dueDate": issue.dueDate,
        "closedOn": issue.closedOn,
        "doneRatio": issue.doneRatio,
        "estimatedHours": issue.estimatedHours,
        # totalSpentHours is the ticket's total logged time across everyone who worked
        # on it — Redmine tracks who-logged-what separately (time entries), which isn't
        # exposed to this chatbot, so per-person time breakdowns aren't answerable here.
        "totalSpentHours": issue.totalSpentHours if issue.totalSpentHours is not None else issue.spentHours,
    }


def build_tools(issues: list[Issue], api_key: str, project_identifier: str) -> tuple[list[Callable], dict]:
    """Builds a fresh set of tool functions closing over this exact issue snapshot —
    called once per chat request, never shared or mutated across requests. Also returns
    a `filter_recorder` dict, auto-populated with search_tickets' filter args whenever a
    call actually truncates its results (more matches than the `limit`-capped list
    returned) — read it back after the chat turn completes to offer a "view these in
    the Ticket Table" deep link. Tied directly to "there's more to see than what's
    shown inline" rather than relying on the model remembering to separately report
    what it searched for, so it can't drift out of sync with what was actually shown.

    api_key/project_identifier are only needed for get_time_entries_for_ticket, which —
    unlike every other tool here — isn't a pure computation over the already-loaded
    `issues` list: time entries are a separate, potentially large Redmine dataset
    (deliberately not preloaded, same as the Time Spent by User tab), so that one tool
    is async and lazily fetches (and caches, via data_store) only when actually called."""
    filter_recorder: dict = {}
    by_id = {issue.id: issue for issue in issues}

    def get_ticket_by_id(ticket_id: int) -> dict:
        """Look up one specific ticket by its numeric ID (e.g. "ticket #123", "issue
        123", or a pasted Redmine URL ending in /issues/123 — extract the number).
        ALWAYS use this instead of search_tickets when the user references a specific
        ticket number; search_tickets' search_text only matches the subject text, never
        the ID. Returns {"found": false} if no ticket with that ID exists in this
        project (it may belong to a different project, or not exist)."""
        issue = by_id.get(ticket_id)
        return _detail(issue) if issue else {"found": False}

    async def get_time_entries_for_ticket(ticket_id: int) -> dict:
        """Look up individual time-log entries for one specific ticket — who logged how
        many hours, and when. Use this (not get_ticket_by_id) whenever asked to break a
        ticket's time down by person, since a ticket's own totalSpentHours is a sum
        across everyone, not a per-person breakdown. Only works for a ticket_id that
        exists in this project. May take a few seconds the first time it's called for
        this project, since time entries aren't preloaded."""
        if ticket_id not in by_id:
            return {"found": False, "entries": []}
        result = await load_time_entries(api_key, project_identifier, False)
        matching = [e for e in result.timeEntries if e.issueId == ticket_id]
        return {
            "found": True,
            "totalHours": round(sum(e.hours for e in matching), 2),
            "entries": [{"user": e.user, "hours": e.hours, "activity": e.activity, "spentOn": e.spentOn} for e in matching],
        }

    def get_ticket_counts() -> dict:
        """Total, open, and closed ticket counts for the current project."""
        return {"total": len(issues), "open": count_not_closed(issues), "closed": count_closed(issues)}

    def get_status_breakdown() -> list[dict]:
        """Ticket counts grouped by status (e.g. New, In Progress, Closed)."""
        return _bucket_dicts(aggregate_by_status(issues))

    def get_tracker_breakdown() -> list[dict]:
        """Ticket counts grouped by tracker/type (e.g. Bug, Feature, Task)."""
        return _bucket_dicts(aggregate_by_tracker(issues))

    def get_priority_breakdown() -> list[dict]:
        """Ticket counts grouped by priority (e.g. Low, Normal, High, Urgent)."""
        return _bucket_dicts(aggregate_by_priority(issues))

    def get_target_version_breakdown() -> list[dict]:
        """Ticket counts grouped by target version / release."""
        return _bucket_dicts(aggregate_by_target_version(issues))

    def get_assignee_breakdown(only_open: bool = True) -> list[dict]:
        """Ticket counts grouped by assignee. By default counts only currently open
        tickets (only_open=True) — pass only_open=False to include closed tickets too.
        Useful for "who has the most tickets" style questions."""
        scoped = [i for i in issues if not i.statusIsClosed] if only_open else issues
        return _bucket_dicts(aggregate_by_assignee(scoped))

    def get_aging_breakdown() -> list[dict]:
        """How long currently-open tickets have been open, grouped into age buckets:
        0-3, 4-7, 8-15, 16-30, 31-60, and 60+ days."""
        return _bucket_dicts(bucket_aging_open_tickets(issues))

    def get_resolution_time_stats() -> dict:
        """Average/median/min/max number of days it took to close tickets that have
        actually been closed."""
        stats = resolution_time_stats(issues)
        return {
            "averageDays": round(stats.average, 1) if stats.average is not None else None,
            "medianDays": stats.median,
            "minDays": stats.minimum,
            "maxDays": stats.maximum,
            "sampleSize": stats.sample_size,
        }

    def get_overdue_tickets(limit: int = MAX_RESULTS) -> dict:
        """Open tickets whose due date has already passed, soonest-overdue first.
        Returns up to `limit` tickets plus the total number of matches — mention the
        total if it's larger than the number of tickets shown."""
        today = datetime.now(timezone.utc).date().isoformat()
        matches = [i for i in issues if not i.statusIsClosed and i.dueDate and i.dueDate < today]
        matches.sort(key=lambda i: i.dueDate or "")
        return {"totalMatches": len(matches), "tickets": [_summarize(i) for i in matches[:limit]]}

    def search_tickets(
        status: str | None = None,
        tracker: str | None = None,
        priority: str | None = None,
        assigned_to: str | None = None,
        closed_only: bool | None = None,
        search_text: str | None = None,
        limit: int = MAX_RESULTS,
    ) -> dict:
        """Search/filter tickets by any combination of status, tracker, priority,
        assignee name, whether they're closed, and free-text search over the ticket
        subject. All filters are optional (omit ones you don't need) and matched
        case-insensitively. Returns up to `limit` matching tickets plus the total
        number of matches — mention the total if it's larger than the number shown."""

        def matches(issue: Issue) -> bool:
            if status and (issue.status or "").lower() != status.lower():
                return False
            if tracker and (issue.tracker or "").lower() != tracker.lower():
                return False
            if priority and (issue.priority or "").lower() != priority.lower():
                return False
            if assigned_to and (issue.assignedTo or "").lower() != assigned_to.lower():
                return False
            if closed_only is not None and issue.statusIsClosed != closed_only:
                return False
            if search_text and search_text.lower() not in (issue.subject or "").lower():
                return False
            return True

        found = [i for i in issues if matches(i)]
        shown = found[:limit]
        # Only worth a "view more in the Ticket Table" link when there's actually more
        # to see than what's already shown inline — a fully-shown small result doesn't
        # need it. The most recent truncating call wins if search_tickets is called
        # more than once in a turn (typically the model's final, most-refined query).
        if len(found) > len(shown):
            filter_recorder.clear()
            filter_recorder.update({"assignee": assigned_to, "tracker": tracker, "status": status, "priority": priority, "search": search_text})
        return {"totalMatches": len(found), "tickets": [_summarize(i) for i in shown]}

    return [
        get_ticket_by_id,
        get_time_entries_for_ticket,
        get_ticket_counts,
        get_status_breakdown,
        get_tracker_breakdown,
        get_priority_breakdown,
        get_target_version_breakdown,
        get_assignee_breakdown,
        get_aging_breakdown,
        get_resolution_time_stats,
        get_overdue_tickets,
        search_tickets,
    ], filter_recorder
