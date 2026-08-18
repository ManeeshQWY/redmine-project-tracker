import httpx
import pytest
import respx

from app.redmine_service import get_issue_count

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
