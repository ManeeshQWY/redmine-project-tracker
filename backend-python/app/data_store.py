from .cache import InFlightGuard, TtlCache
from .config import REDMINE_BASE_URL
from .models import MetaResult, PriorityMeta, ProjectIssuesResult, ProjectMeta, StatusMeta, TimeEntriesResult, TrackerMeta
from .redmine_service import get_priorities, get_project_issues, get_projects, get_statuses, get_time_entries, get_trackers

ISSUES_TTL_SECONDS = 15 * 60  # filters/UI work off this without re-hitting Redmine
META_TTL_SECONDS = 60 * 60
TIME_ENTRIES_TTL_SECONDS = 15 * 60
SHARED_KEY = "shared"

# Caches are shared across ALL logged-in users, keyed only by project (not by who
# asked). This assumes everyone on this Redmine instance has the same project/issue
# visibility — true for a small internal team where access isn't role-restricted per
# project. If that assumption doesn't hold, whichever user's request first populates a
# project's cache determines what every other user sees from it until it expires
# (Redmine access isn't re-checked on a cache hit). The tradeoff buys a roughly N-fold
# reduction in memory use for N concurrent users viewing the same project, which
# matters on a memory-constrained host.
_issues_cache: TtlCache[ProjectIssuesResult] = TtlCache(ISSUES_TTL_SECONDS)
_projects_cache: TtlCache[list[ProjectMeta]] = TtlCache(META_TTL_SECONDS)
_statuses_cache: TtlCache[list[StatusMeta]] = TtlCache(META_TTL_SECONDS)
_trackers_cache: TtlCache[list[TrackerMeta]] = TtlCache(META_TTL_SECONDS)
_priorities_cache: TtlCache[list[PriorityMeta]] = TtlCache(META_TTL_SECONDS)
_time_entries_cache: TtlCache[TimeEntriesResult] = TtlCache(TIME_ENTRIES_TTL_SECONDS)
_issues_in_flight: InFlightGuard[ProjectIssuesResult] = InFlightGuard()
_time_entries_in_flight: InFlightGuard[TimeEntriesResult] = InFlightGuard()


async def load_projects(api_key: str) -> list[ProjectMeta]:
    cached = _projects_cache.get(SHARED_KEY)
    if cached is not None:
        return cached
    projects = await get_projects(api_key)
    _projects_cache.set(SHARED_KEY, projects)
    return projects


async def load_meta(api_key: str) -> MetaResult:
    statuses = _statuses_cache.get(SHARED_KEY)
    if statuses is None:
        statuses = await get_statuses(api_key)
        _statuses_cache.set(SHARED_KEY, statuses)

    trackers = _trackers_cache.get(SHARED_KEY)
    if trackers is None:
        trackers = await get_trackers(api_key)
        _trackers_cache.set(SHARED_KEY, trackers)

    priorities = _priorities_cache.get(SHARED_KEY)
    if priorities is None:
        priorities = await get_priorities(api_key)
        _priorities_cache.set(SHARED_KEY, priorities)

    # Base URL is not sensitive (only the API key is) — exposed so the frontend can build ticket links.
    return MetaResult(statuses=statuses, trackers=trackers, priorities=priorities, redmineBaseUrl=REDMINE_BASE_URL)


async def load_project_issues(api_key: str, project_identifier: str, force_refresh: bool) -> ProjectIssuesResult:
    if not force_refresh:
        cached = _issues_cache.get(project_identifier)
        if cached is not None:
            print(f'[cache] Serving cached issues for "{project_identifier}" ({len(cached.issues)} issues, fetched {cached.fetchedAt})')
            return cached
    else:
        _issues_cache.invalidate(project_identifier)

    async def fetch() -> ProjectIssuesResult:
        print(f'[redmine] Fetching all issues for project "{project_identifier}"...')
        total_pages = 1

        def on_progress(fetched: int, total: int, page: int, pages: int) -> None:
            nonlocal total_pages
            total_pages = pages
            print(f"[redmine] Page {page}/{pages} — {fetched}/{total} issues retrieved")

        result = await get_project_issues(project_identifier, api_key, on_progress)
        print(f'[redmine] Retrieved {len(result.issues)} issues for "{project_identifier}" across {total_pages} page(s) in {result.durationMs / 1000:.1f}s')
        _issues_cache.set(project_identifier, result)
        return result

    return await _issues_in_flight.run(project_identifier, fetch)


async def load_time_entries(api_key: str, project_identifier: str, force_refresh: bool) -> TimeEntriesResult:
    if not force_refresh:
        cached = _time_entries_cache.get(project_identifier)
        if cached is not None:
            print(
                f'[cache] Serving cached time entries for "{project_identifier}" ({len(cached.timeEntries)} entries, fetched {cached.fetchedAt})'
            )
            return cached
    else:
        _time_entries_cache.invalidate(project_identifier)

    async def fetch() -> TimeEntriesResult:
        print(f'[redmine] Fetching all time entries for "{project_identifier}"...')
        total_pages = 1

        def on_progress(fetched: int, total: int, page: int, pages: int) -> None:
            nonlocal total_pages
            total_pages = pages
            print(f"[redmine] Time entries page {page}/{pages} — {fetched}/{total} retrieved")

        result = await get_time_entries(project_identifier, api_key, on_progress)
        print(
            f'[redmine] Retrieved {len(result.timeEntries)} time entries for "{project_identifier}" across {total_pages} page(s) in {result.durationMs / 1000:.1f}s'
        )
        _time_entries_cache.set(project_identifier, result)
        return result

    return await _time_entries_in_flight.run(project_identifier, fetch)
