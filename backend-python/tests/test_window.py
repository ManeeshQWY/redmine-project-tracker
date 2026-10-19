"""The load window (last N days or an explicit from/to range): what is asked of Redmine, how it
is validated and cached — and that abandoning a load stops the server-side work."""

import asyncio
import datetime
import socket

import httpx
import pytest
import respx
import uvicorn

from app import data_store
from app.cache import InFlightGuard, TtlCache
from app.load_window import ALL_TIME, LoadWindow, resolve_window
from app.main import app
from app.redmine_service import CurrentRedmineUser, get_issue_count, get_project_issues, get_time_entries
from app.session_store import create_session

BASE_URL = "https://redmine.test"


def raw_issue(i: int) -> dict:
    return {
        "id": i, "project": {"id": 1, "name": "P"}, "tracker": {"id": 1, "name": "Bug"},
        "status": {"id": 1, "name": "New", "is_closed": False}, "priority": {"id": 2, "name": "Normal"},
        "author": {"id": 1, "name": "A"}, "subject": f"S{i}", "description": "d" * 50, "done_ratio": 0,
        "created_on": "2026-01-01T00:00:00Z", "updated_on": "2026-01-01T00:00:00Z", "closed_on": None,
    }


def raw_entry(i: int) -> dict:
    return {
        "id": i, "project": {"id": 1, "name": "P"}, "issue": {"id": 1}, "user": {"id": 1, "name": "U"},
        "activity": {"id": 1, "name": "Dev"}, "hours": 1.0, "comments": "", "spent_on": "2026-01-01",
    }


class TestLoadWindow:
    def test_no_bounds_means_everything(self):
        assert ALL_TIME.start is None and ALL_TIME.end is None

    def test_last_days_starts_n_days_before_today_utc(self):
        today = datetime.datetime.now(datetime.timezone.utc).date()
        assert LoadWindow.last_days(30).start == (today - datetime.timedelta(days=30)).isoformat()
        assert LoadWindow.last_days(30).end is None

    def test_zero_or_negative_days_is_everything(self):
        assert LoadWindow.last_days(0) == ALL_TIME
        assert LoadWindow.last_days(-3) == ALL_TIME

    def test_different_windows_have_different_keys(self):
        keys = {LoadWindow.last_days(30).key, LoadWindow.last_days(90).key, ALL_TIME.key, LoadWindow("2026-01-01", "2026-03-31").key}
        assert len(keys) == 4


class TestResolveWindow:
    def test_defaults_to_days(self):
        assert resolve_window(30, None, None) == LoadWindow.last_days(30)

    def test_an_explicit_range_wins_over_days(self):
        assert resolve_window(30, "2026-01-01", "2026-03-31") == LoadWindow("2026-01-01", "2026-03-31")

    def test_either_end_may_be_open(self):
        assert resolve_window(30, "2026-01-01", None) == LoadWindow("2026-01-01", None)
        assert resolve_window(30, None, "2026-03-31") == LoadWindow(None, "2026-03-31")

    def test_same_day_is_allowed(self):
        assert resolve_window(30, "2026-03-31", "2026-03-31") == LoadWindow("2026-03-31", "2026-03-31")

    @pytest.mark.parametrize("bad", ["31-03-2026", "2026/03/31", "tomorrow", "2026-3-1", "2026-13-01", "2026-02-30"])
    def test_rejects_malformed_or_impossible_dates(self, bad):
        with pytest.raises(ValueError):
            resolve_window(30, bad, None)

    def test_rejects_from_after_to(self):
        with pytest.raises(ValueError):
            resolve_window(30, "2026-04-01", "2026-03-01")


class TestWindowQueries:
    @pytest.mark.asyncio
    @respx.mock
    async def test_issue_count_asks_for_tickets_updated_since(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [], "total_count": 5, "offset": 0, "limit": 1})
        )
        window = LoadWindow.last_days(30)
        await get_issue_count("alpha", "k", window)
        url = str(route.calls[0].request.url)
        assert f"updated_on=%3E%3D{window.start}" in url
        assert "limit=1" in url and "project_id=alpha" in url

    @pytest.mark.asyncio
    @respx.mock
    async def test_a_date_range_uses_redmines_between_operator(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [], "total_count": 1, "offset": 0, "limit": 1})
        )
        await get_issue_count("alpha", "k", LoadWindow("2026-01-01", "2026-03-31"))
        assert "updated_on=%3E%3C2026-01-01%7C2026-03-31" in str(route.calls[0].request.url)  # ><start|end

    @pytest.mark.asyncio
    @respx.mock
    async def test_an_end_only_range_uses_less_than_or_equal(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [], "total_count": 1, "offset": 0, "limit": 1})
        )
        await get_issue_count("alpha", "k", LoadWindow(None, "2026-03-31"))
        assert "updated_on=%3C%3D2026-03-31" in str(route.calls[0].request.url)

    @pytest.mark.asyncio
    @respx.mock
    async def test_no_window_has_no_date_filter(self):
        route = respx.get(url__regex=rf"{BASE_URL}/issues\.json.*").mock(
            return_value=httpx.Response(200, json={"issues": [], "total_count": 5, "offset": 0, "limit": 1})
        )
        await get_issue_count("alpha", "k", ALL_TIME)
        assert "updated_on" not in str(route.calls[0].request.url)

    @pytest.mark.asyncio
    @respx.mock
    async def test_issues_are_fetched_with_the_window_and_keep_their_order(self):
        respx.get(url__regex=rf"{BASE_URL}/(projects/.*/memberships|issues)\.json.*").mock(
            side_effect=lambda req: httpx.Response(200, json={"memberships": [], "total_count": 0, "offset": 0, "limit": 100})
            if "memberships" in str(req.url)
            else httpx.Response(200, json={"issues": [raw_issue(i) for i in (3, 1, 2)], "total_count": 3, "offset": 0, "limit": 100})
        )
        window = LoadWindow.last_days(30)
        result = await get_project_issues("alpha", "k", window=window)
        assert [i.id for i in result.issues] == [3, 1, 2]  # same order as Redmine returned
        assert result.totalCount == 3 and result.fetchedCount == 3
        issues_calls = [c for c in respx.calls if "/issues.json" in str(c.request.url)]
        assert all(f"updated_on=%3E%3D{window.start}" in str(c.request.url) for c in issues_calls)

    @pytest.mark.asyncio
    @respx.mock
    async def test_time_entries_use_from_and_keep_their_order(self):
        route = respx.get(url__regex=rf"{BASE_URL}/time_entries\.json.*").mock(
            return_value=httpx.Response(200, json={"time_entries": [raw_entry(i) for i in (9, 4, 7)], "total_count": 3, "offset": 0, "limit": 100})
        )
        window = LoadWindow.last_days(30)
        result = await get_time_entries("alpha", "k", window=window)
        assert [e.id for e in result.timeEntries] == [9, 4, 7]
        url = str(route.calls[0].request.url)
        assert f"from={window.start}" in url and "project_id=alpha" in url and "to=" not in url

    @pytest.mark.asyncio
    @respx.mock
    async def test_time_entries_for_a_range_send_both_ends(self):
        route = respx.get(url__regex=rf"{BASE_URL}/time_entries\.json.*").mock(
            return_value=httpx.Response(200, json={"time_entries": [], "total_count": 0, "offset": 0, "limit": 100})
        )
        await get_time_entries(None, "k", window=LoadWindow("2026-01-01", "2026-03-31"))
        assert "/time_entries.json?from=2026-01-01&to=2026-03-31" in str(route.calls[0].request.url)

    @pytest.mark.asyncio
    @respx.mock
    async def test_time_entries_without_a_window_have_no_date_filter(self):
        route = respx.get(url__regex=rf"{BASE_URL}/time_entries\.json.*").mock(
            return_value=httpx.Response(200, json={"time_entries": [], "total_count": 0, "offset": 0, "limit": 100})
        )
        await get_time_entries("alpha", "k", window=ALL_TIME)
        url = str(route.calls[0].request.url)
        assert "from=" not in url and "to=" not in url


class TestCacheCap:
    def test_drops_the_oldest_entries_beyond_the_cap(self):
        cache: TtlCache[int] = TtlCache(60, max_entries=2)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        assert cache.get("a") is None
        assert cache.get("b") == 2 and cache.get("c") == 3

    def test_refreshing_a_key_makes_it_the_newest(self):
        cache: TtlCache[int] = TtlCache(60, max_entries=2)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("a", 10)  # a is now newer than b
        cache.set("c", 3)
        assert cache.get("b") is None
        assert cache.get("a") == 10 and cache.get("c") == 3

    def test_unbounded_by_default(self):
        cache: TtlCache[int] = TtlCache(60)
        for i in range(50):
            cache.set(str(i), i)
        assert cache.get("0") == 0 and cache.get("49") == 49


class TestWindowKeysTheCache:
    @pytest.fixture(autouse=True)
    def clean(self):
        data_store._issues_cache.clear()
        yield
        data_store._issues_cache.clear()

    @pytest.mark.asyncio
    async def test_each_window_is_its_own_dataset(self, monkeypatch):
        seen = []

        async def fake_get_project_issues(project_identifier, api_key, on_progress=None, window=None):
            seen.append(window)
            return data_store.ProjectIssuesResult(issues=[], totalCount=len(seen), fetchedCount=0, durationMs=1, fetchedAt="now")

        monkeypatch.setattr(data_store, "get_project_issues", fake_get_project_issues)
        thirty, ninety, rng = LoadWindow.last_days(30), LoadWindow.last_days(90), LoadWindow("2026-01-01", "2026-03-31")

        first = await data_store.load_project_issues("k", 10, "alpha", False, thirty)
        await data_store.load_project_issues("k", 10, "alpha", False, ninety)
        await data_store.load_project_issues("k", 10, "alpha", False, rng)
        again = await data_store.load_project_issues("k", 10, "alpha", False, thirty)

        assert seen == [thirty, ninety, rng]  # the repeat 30-day request came from cache
        assert again is first


class TestInFlightGuardCancellation:
    @pytest.mark.asyncio
    async def test_cancelling_the_only_waiter_cancels_the_fetch(self):
        guard: InFlightGuard[int] = InFlightGuard()
        cancelled = asyncio.Event()

        async def slow():
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                cancelled.set()
                raise

        waiter = asyncio.ensure_future(guard.run("k", slow))
        await asyncio.sleep(0.05)
        waiter.cancel()
        await asyncio.wait_for(cancelled.wait(), timeout=2)

    @pytest.mark.asyncio
    async def test_cancelling_one_of_two_waiters_keeps_the_fetch_for_the_other(self):
        guard: InFlightGuard[int] = InFlightGuard()
        calls = 0

        async def fetch():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.2)
            return 42

        first = asyncio.ensure_future(guard.run("k", fetch))
        second = asyncio.ensure_future(guard.run("k", fetch))
        await asyncio.sleep(0.05)
        first.cancel()
        assert await second == 42
        assert calls == 1  # one shared fetch, not restarted

    @pytest.mark.asyncio
    async def test_concurrent_callers_still_share_a_single_fetch(self):
        guard: InFlightGuard[int] = InFlightGuard()
        calls = 0

        async def fetch():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.05)
            return 7

        results = await asyncio.gather(*(guard.run("k", fetch) for _ in range(5)))
        assert results == [7] * 5 and calls == 1

    @pytest.mark.asyncio
    async def test_a_new_request_after_completion_starts_a_new_fetch(self):
        guard: InFlightGuard[int] = InFlightGuard()
        calls = 0

        async def fetch():
            nonlocal calls
            calls += 1
            return calls

        assert await guard.run("k", fetch) == 1
        assert await guard.run("k", fetch) == 2

    @pytest.mark.asyncio
    async def test_a_failed_fetch_reaches_every_waiter(self):
        guard: InFlightGuard[int] = InFlightGuard()

        async def boom():
            await asyncio.sleep(0.02)
            raise RuntimeError("redmine down")

        results = await asyncio.gather(guard.run("k", boom), guard.run("k", boom), return_exceptions=True)
        assert all(isinstance(r, RuntimeError) for r in results)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TestAbandonedRequestStopsTheWork:
    """Against a real server socket: when the browser drops the connection (the person
    pressed Cancel), the server must stop fetching from Redmine."""

    @pytest.fixture(autouse=True)
    def clean(self):
        data_store._issues_cache.clear()
        data_store._time_entries_cache.clear()
        yield
        data_store._issues_cache.clear()
        data_store._time_entries_cache.clear()

    async def _serve(self):
        port = _free_port()
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
        task = asyncio.ensure_future(server.serve())
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started
        return port, server, task

    @pytest.mark.parametrize("path, patched", [("/api/projects/alpha/issues?days=90", "get_project_issues"), ("/api/projects/alpha/time-entries?days=90", "get_time_entries")])
    async def test_dropping_the_connection_cancels_the_redmine_fetch(self, monkeypatch, path, patched):
        started, cancelled = asyncio.Event(), asyncio.Event()

        async def slow_fetch(project_identifier, api_key, on_progress=None, window=None):
            started.set()
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                cancelled.set()
                raise

        monkeypatch.setattr(data_store, patched, slow_fetch)
        sid = create_session("key", CurrentRedmineUser(1, "Tester", "tester", None))
        port, server, serve_task = await self._serve()
        try:
            async with httpx.AsyncClient(cookies={"rtt_sid": sid}, timeout=30) as client:
                request = asyncio.ensure_future(client.get(f"http://127.0.0.1:{port}{path}"))
                await asyncio.wait_for(started.wait(), timeout=5)
                request.cancel()  # the browser aborts the request
                with pytest.raises(asyncio.CancelledError):
                    await request
            await asyncio.wait_for(cancelled.wait(), timeout=5)
        finally:
            server.should_exit = True
            await serve_task

    async def test_a_request_that_is_not_abandoned_still_completes(self, monkeypatch):
        async def quick(project_identifier, api_key, on_progress=None, window=None):
            await asyncio.sleep(0.3)  # long enough for the disconnect watcher to poll at least once
            return data_store.ProjectIssuesResult(issues=[], totalCount=0, fetchedCount=0, durationMs=1, fetchedAt="now")

        monkeypatch.setattr(data_store, "get_project_issues", quick)
        sid = create_session("key", CurrentRedmineUser(1, "Tester", "tester", None))
        port, server, serve_task = await self._serve()
        try:
            async with httpx.AsyncClient(cookies={"rtt_sid": sid}, timeout=30) as client:
                res = await client.get(f"http://127.0.0.1:{port}/api/projects/alpha/issues?from=2026-01-01&to=2026-03-31")
            assert res.status_code == 200 and res.json()["issues"] == []
        finally:
            server.should_exit = True
            await serve_task

    async def test_a_bad_range_is_rejected_with_400(self):
        sid = create_session("key", CurrentRedmineUser(1, "Tester", "tester", None))
        port, server, serve_task = await self._serve()
        try:
            async with httpx.AsyncClient(cookies={"rtt_sid": sid}, timeout=30) as client:
                backwards = await client.get(f"http://127.0.0.1:{port}/api/projects/alpha/issues?from=2026-04-01&to=2026-03-01")
                garbage = await client.get(f"http://127.0.0.1:{port}/api/projects/alpha/issues?from=yesterday")
            assert backwards.status_code == 400 and "after" in backwards.json()["error"]
            assert garbage.status_code == 400
        finally:
            server.should_exit = True
            await serve_task
