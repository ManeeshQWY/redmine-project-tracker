import httpx
import pytest
import respx

from app import data_store
from app.models import Issue, ProjectIssuesResult, TimeEntriesResult, TimeEntry

BASE_URL = "https://redmine.test"


def projects_for_key(request: httpx.Request) -> httpx.Response:
    """Redmine only returns the projects the calling API key can see."""
    key = request.headers["X-Redmine-API-Key"]
    visible = {
        "narrow-key": [{"id": 1, "name": "Alpha", "identifier": "alpha", "status": 1}],
        "broad-key": [
            {"id": 1, "name": "Alpha", "identifier": "alpha", "status": 1},
            {"id": 2, "name": "Beta", "identifier": "beta", "status": 1},
        ],
    }[key]
    return httpx.Response(200, json={"projects": visible, "total_count": len(visible), "offset": 0, "limit": 100})


@pytest.fixture(autouse=True)
def clean_caches():
    caches = [
        data_store._projects_cache,
        data_store._issues_cache,
        data_store._time_entries_cache,
        data_store._versions_cache,
    ]
    for cache in caches:
        cache.clear()
    yield
    for cache in caches:
        cache.clear()


def issues_result(*issue_ids: int) -> ProjectIssuesResult:
    issues = [
        Issue(
            id=i, parentId=None, project="P", tracker="Bug", status="New", statusIsClosed=False,
            priority="Normal", author="A", subject=f"t{i}", description=None, doneRatio=0,
            createdOn="2026-01-01T00:00:00Z", updatedOn="2026-01-01T00:00:00Z", assignedTo=None,
            targetVersion=None, targetVersionId=None, startDate=None, dueDate=None, closedOn=None,
            estimatedHours=None, spentHours=None, totalSpentHours=None, totalEstimatedHours=None,
            assignedQA=None, platform=None, additionalAssignee=None, estimatedTimeForQA=None,
            customFields=[],
        )
        for i in issue_ids
    ]
    return ProjectIssuesResult(
        issues=issues, totalCount=len(issues), fetchedCount=len(issues), durationMs=1, fetchedAt="now"
    )


def entries_result(*entry_ids: int) -> TimeEntriesResult:
    entries = [
        TimeEntry(id=i, project="P", issueId=None, user="U", activity="Dev", hours=1, comments=None,
                  spentOn="2026-01-01")
        for i in entry_ids
    ]
    return TimeEntriesResult(timeEntries=entries, totalCount=len(entries), durationMs=1, fetchedAt="now")


class TestIssuesAndTimeEntriesArePerUser:
    """Redmine returns only what the calling key may see, so these must never be served
    from another user's cache entry."""

    @pytest.mark.asyncio
    async def test_issues_are_not_shared_between_users(self, monkeypatch):
        visible = {"narrow-key": issues_result(1), "broad-key": issues_result(1, 2, 3)}

        async def fake_get_project_issues(project_identifier, api_key, on_progress=None, window=None):
            return visible[api_key]

        monkeypatch.setattr(data_store, "get_project_issues", fake_get_project_issues)

        narrow = await data_store.load_project_issues("narrow-key", 10, "alpha", False)
        broad = await data_store.load_project_issues("broad-key", 20, "alpha", False)

        assert [i.id for i in narrow.issues] == [1]
        assert [i.id for i in broad.issues] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_same_user_is_served_from_cache_and_refresh_refetches(self, monkeypatch):
        calls = []

        async def fake_get_project_issues(project_identifier, api_key, on_progress=None, window=None):
            calls.append(api_key)
            return issues_result(1)

        monkeypatch.setattr(data_store, "get_project_issues", fake_get_project_issues)

        await data_store.load_project_issues("k", 10, "alpha", False)
        await data_store.load_project_issues("k", 10, "alpha", False)
        assert len(calls) == 1

        await data_store.load_project_issues("k", 10, "alpha", True)
        assert len(calls) == 2

    @pytest.mark.asyncio
    async def test_refresh_by_one_user_does_not_evict_another_users_cache(self, monkeypatch):
        calls = []

        async def fake_get_project_issues(project_identifier, api_key, on_progress=None, window=None):
            calls.append(api_key)
            return issues_result(1)

        monkeypatch.setattr(data_store, "get_project_issues", fake_get_project_issues)

        await data_store.load_project_issues("k-a", 10, "alpha", False)
        await data_store.load_project_issues("k-b", 20, "alpha", False)
        await data_store.load_project_issues("k-a", 10, "alpha", True)  # A refreshes
        await data_store.load_project_issues("k-b", 20, "alpha", False)  # B still cached

        assert calls == ["k-a", "k-b", "k-a"]

    @pytest.mark.asyncio
    async def test_time_entries_are_not_shared_between_users(self, monkeypatch):
        visible = {"narrow-key": entries_result(1), "broad-key": entries_result(1, 2, 3)}

        async def fake_get_time_entries(project_identifier, api_key, on_progress=None, window=None):
            return visible[api_key]

        monkeypatch.setattr(data_store, "get_time_entries", fake_get_time_entries)

        narrow = await data_store.load_time_entries("narrow-key", 10, "alpha", False)
        broad = await data_store.load_time_entries("broad-key", 20, "alpha", False)

        assert [e.id for e in narrow.timeEntries] == [1]
        assert [e.id for e in broad.timeEntries] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_concurrent_requests_from_different_users_do_not_share_one_fetch(self, monkeypatch):
        import asyncio

        visible = {"narrow-key": issues_result(1), "broad-key": issues_result(1, 2)}

        async def slow_get_project_issues(project_identifier, api_key, on_progress=None, window=None):
            await asyncio.sleep(0.01)
            return visible[api_key]

        monkeypatch.setattr(data_store, "get_project_issues", slow_get_project_issues)

        narrow, broad = await asyncio.gather(
            data_store.load_project_issues("narrow-key", 10, "alpha", False),
            data_store.load_project_issues("broad-key", 20, "alpha", False),
        )

        assert [i.id for i in narrow.issues] == [1]
        assert [i.id for i in broad.issues] == [1, 2]


class TestLoadProjectsIsPerUser:
    @pytest.mark.asyncio
    @respx.mock
    async def test_a_user_with_wider_access_is_not_given_another_users_narrower_list(self):
        respx.get(url__regex=rf"{BASE_URL}/projects\.json.*").mock(side_effect=projects_for_key)

        first = await data_store.load_projects("narrow-key", user_id=10)
        second = await data_store.load_projects("broad-key", user_id=20)

        assert [p.identifier for p in first] == ["alpha"]
        assert [p.identifier for p in second] == ["alpha", "beta"]

    @pytest.mark.asyncio
    @respx.mock
    async def test_the_same_user_is_still_served_from_cache(self):
        route = respx.get(url__regex=rf"{BASE_URL}/projects\.json.*").mock(side_effect=projects_for_key)

        await data_store.load_projects("broad-key", user_id=20)
        await data_store.load_projects("broad-key", user_id=20)

        assert route.call_count == 1
