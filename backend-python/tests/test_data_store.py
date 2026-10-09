import httpx
import pytest
import respx

from app import data_store

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
    data_store._projects_cache.clear()
    yield
    data_store._projects_cache.clear()


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
