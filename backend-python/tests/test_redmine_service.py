import httpx
import pytest
import respx

from app.redmine_service import get_issue_count, get_versions_by_ids

BASE_URL = "https://redmine.test"


class TestGetIssueCount:
    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_total_count_for_a_single_project_without_fetching_all_pages(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [{"id": 1}], "total_count": 2326, "offset": 0, "limit": 1})
        )
        total = await get_issue_count("qwqer-india-erp", "test-key")
        assert total == 2326
        assert route.call_count == 1
        # confirms it asked for exactly one record, not the whole page size used elsewhere
        assert "limit=1" in str(route.calls[0].request.url)
        assert "project_id=qwqer-india-erp" in str(route.calls[0].request.url)

    @pytest.mark.asyncio
    @respx.mock
    async def test_omits_project_id_for_all_projects(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [], "total_count": 19639, "offset": 0, "limit": 1})
        )
        total = await get_issue_count(None, "test-key")
        assert total == 19639
        assert "project_id" not in str(route.calls[0].request.url)


class TestGetVersionsByIds:
    @pytest.mark.asyncio
    @respx.mock
    async def test_fetches_each_distinct_version_once_and_maps_due_date(self):
        route7 = respx.get(f"{BASE_URL}/versions/7.json").mock(
            return_value=httpx.Response(200, json={"version": {"id": 7, "name": "Sprint 7", "due_date": "2026-03-31", "status": "closed"}})
        )
        respx.get(f"{BASE_URL}/versions/8.json").mock(
            return_value=httpx.Response(200, json={"version": {"id": 8, "name": "Sprint 8", "due_date": None, "status": "open"}})
        )
        versions = await get_versions_by_ids([7, 8, 7, 7], "test-key")
        by_id = {v.id: v for v in versions}
        assert route7.call_count == 1  # duplicates collapsed
        assert by_id[7].dueDate == "2026-03-31"
        assert by_id[7].status == "closed"
        assert by_id[8].dueDate is None  # version exists but has no date set

    @pytest.mark.asyncio
    @respx.mock
    async def test_a_version_that_fails_to_load_is_skipped_not_fatal(self):
        respx.get(f"{BASE_URL}/versions/1.json").mock(return_value=httpx.Response(403, json={}))
        respx.get(f"{BASE_URL}/versions/2.json").mock(
            return_value=httpx.Response(200, json={"version": {"id": 2, "name": "Ok", "due_date": "2026-01-01", "status": "open"}})
        )
        versions = await get_versions_by_ids([1, 2], "test-key")
        assert [v.id for v in versions] == [2]

    @pytest.mark.asyncio
    async def test_no_ids_makes_no_requests(self):
        assert await get_versions_by_ids([], "test-key") == []
