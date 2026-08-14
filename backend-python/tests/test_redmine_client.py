import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from app.redmine_client import RedmineApiError, fetch_all_paginated, request_json

BASE_URL = "https://redmine.test"


def _offset_from(request: httpx.Request) -> int:
    qs = parse_qs(urlparse(str(request.url)).query)
    return int(qs.get("offset", ["0"])[0])


class TestFetchAllPaginated:
    @pytest.mark.asyncio
    @respx.mock
    async def test_follows_total_count_offset_limit_until_all_pages_retrieved(self):
        total_count = 250
        page_size = 100

        def handler(request: httpx.Request) -> httpx.Response:
            offset = _offset_from(request)
            count = min(page_size, total_count - offset)
            items = [{"id": offset + i + 1, "name": f"item-{offset + i + 1}"} for i in range(count)]
            return httpx.Response(200, json={"items": items, "total_count": total_count, "offset": offset, "limit": page_size})

        respx.get(url__regex=rf"{BASE_URL}/items\.json.*").mock(side_effect=handler)

        items = await fetch_all_paginated("/items.json", "items", "test-key", page_size)
        assert len(items) == total_count
        ids = sorted(i["id"] for i in items)
        assert ids[0] == 1
        assert ids[-1] == total_count

    @pytest.mark.asyncio
    @respx.mock
    async def test_does_not_assume_first_page_contains_everything(self):
        total_count = 2268
        page_size = 100
        request_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal request_count
            request_count += 1
            offset = _offset_from(request)
            count = min(page_size, total_count - offset)
            items = [{"id": offset + i + 1, "name": "x"} for i in range(count)]
            return httpx.Response(200, json={"items": items, "total_count": total_count, "offset": offset, "limit": page_size})

        respx.get(url__regex=rf"{BASE_URL}/items\.json.*").mock(side_effect=handler)

        items = await fetch_all_paginated("/items.json", "items", "test-key", page_size)
        assert len(items) == total_count
        assert request_count == -(-total_count // page_size)

    @pytest.mark.asyncio
    @respx.mock
    async def test_deduplicates_items_appearing_on_multiple_pages(self):
        def handler(request: httpx.Request) -> httpx.Response:
            offset = _offset_from(request)
            if offset == 0:
                return httpx.Response(200, json={"items": [{"id": 1}, {"id": 2}], "total_count": 3, "offset": 0, "limit": 2})
            return httpx.Response(200, json={"items": [{"id": 2}, {"id": 3}], "total_count": 3, "offset": 2, "limit": 2})

        respx.get(url__regex=rf"{BASE_URL}/items\.json.*").mock(side_effect=handler)

        items = await fetch_all_paginated("/items.json", "items", "test-key", 2)
        ids = sorted(i["id"] for i in items)
        assert ids == [1, 2, 3]

    @pytest.mark.asyncio
    @respx.mock
    async def test_handles_zero_total_count_without_error(self):
        respx.get(url__regex=rf"{BASE_URL}/items\.json.*").mock(
            return_value=httpx.Response(200, json={"items": [], "total_count": 0, "offset": 0, "limit": 100})
        )
        items = await fetch_all_paginated("/items.json", "items", "test-key", 100)
        assert items == []


class TestErrorHandling:
    @pytest.mark.asyncio
    @respx.mock
    @pytest.mark.parametrize("status", [401, 403, 404, 429, 500, 503])
    async def test_wraps_http_error_into_friendly_redmine_api_error(self, status):
        respx.get(url__regex=rf"{BASE_URL}/x\.json").mock(return_value=httpx.Response(status, json={"error": "boom"}))

        with pytest.raises(RedmineApiError) as exc_info:
            await request_json("/x.json", "test-key")

        err = exc_info.value
        assert err.status == status
        assert "boom" not in err.user_message
        assert len(err.user_message) > 0

    @pytest.mark.asyncio
    @respx.mock
    async def test_wraps_network_failures_as_friendly_error(self):
        respx.get(url__regex=rf"{BASE_URL}/x\.json").mock(side_effect=httpx.ConnectError("connection refused"))

        with pytest.raises(RedmineApiError):
            await request_json("/x.json", "test-key")

    @pytest.mark.asyncio
    @respx.mock
    async def test_wraps_invalid_json_as_friendly_error(self):
        respx.get(url__regex=rf"{BASE_URL}/x\.json").mock(
            return_value=httpx.Response(200, content=b"not json", headers={"Content-Type": "application/json"})
        )

        with pytest.raises(RedmineApiError):
            await request_json("/x.json", "test-key")
