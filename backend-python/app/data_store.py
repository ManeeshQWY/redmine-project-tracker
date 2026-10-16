from .cache import InFlightGuard, TtlCache
from .config import REDMINE_BASE_URL
from .models import MetaResult, PriorityMeta, ProjectIssuesResult, ProjectMeta, StatusMeta, TimeEntriesResult, TrackerMeta, VersionMeta
from .redmine_service import (
    get_priorities,
    get_project_issues,
    get_projects,
    get_statuses,
    get_time_entries,
    get_trackers,
    get_versions_by_ids,
)

ISSUES_TTL_SECONDS = 15 * 60  # filters/UI work off this without re-hitting Redmine
META_TTL_SECONDS = 60 * 60
TIME_ENTRIES_TTL_SECONDS = 15 * 60
SHARED_KEY = "shared"

# Project-scoped data (issues, time entries, versions) is cached PER USER, keyed by
# user id + project. Redmine filters these by what the calling API key may see — roles,
# private issues, and per-role time-entry visibility all differ between people — so a
# cache shared across users would show whoever asked first's view to everyone else for
# the whole TTL, both hiding data from a more privileged user and exposing it to a less
# privileged one. The cost is memory growing with the number of distinct users viewing
# a project (the host is memory-constrained, so watch this if the user base grows).
# Only data that is identical for everyone (statuses/trackers/priorities) stays shared.
_issues_cache: TtlCache[ProjectIssuesResult] = TtlCache(ISSUES_TTL_SECONDS)
_projects_cache: TtlCache[list[ProjectMeta]] = TtlCache(META_TTL_SECONDS)
_statuses_cache: TtlCache[list[StatusMeta]] = TtlCache(META_TTL_SECONDS)
_trackers_cache: TtlCache[list[TrackerMeta]] = TtlCache(META_TTL_SECONDS)
_priorities_cache: TtlCache[list[PriorityMeta]] = TtlCache(META_TTL_SECONDS)
_time_entries_cache: TtlCache[TimeEntriesResult] = TtlCache(TIME_ENTRIES_TTL_SECONDS)
_versions_cache: TtlCache[list[VersionMeta]] = TtlCache(META_TTL_SECONDS)
_issues_in_flight: InFlightGuard[ProjectIssuesResult] = InFlightGuard()
_time_entries_in_flight: InFlightGuard[TimeEntriesResult] = InFlightGuard()


def _scoped_key(user_id: int, project_identifier: str) -> str:
    return f"user:{user_id}:{project_identifier}"


async def load_projects(api_key: str, user_id: int) -> list[ProjectMeta]:
    # Keyed per user, NOT shared like the other meta caches: Redmine returns only the
    # projects the calling API key can see, so this list differs between people. Sharing
    # it meant whoever logged in first fixed the list everyone else got for the next
    # hour — a user with access to more projects never saw them. (A project list is
    # small, so the per-user memory cost is negligible.)
    key = f"user:{user_id}"
    cached = _projects_cache.get(key)
    if cached is not None:
        return cached
    projects = await get_projects(api_key)
    _projects_cache.set(key, projects)
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


async def load_project_issues(
    api_key: str, user_id: int, project_identifier: str, force_refresh: bool
) -> ProjectIssuesResult:
    key = _scoped_key(user_id, project_identifier)
    if not force_refresh:
        cached = _issues_cache.get(key)
        if cached is not None:
            print(f'[cache] Serving cached issues for "{project_identifier}" ({len(cached.issues)} issues, fetched {cached.fetchedAt})')
            return cached
    else:
        _issues_cache.invalidate(key)

    async def fetch() -> ProjectIssuesResult:
        print(f'[redmine] Fetching all issues for project "{project_identifier}"...')
        total_pages = 1

        def on_progress(fetched: int, total: int, page: int, pages: int) -> None:
            nonlocal total_pages
            total_pages = pages
            print(f"[redmine] Page {page}/{pages} — {fetched}/{total} issues retrieved")

        result = await get_project_issues(project_identifier, api_key, on_progress)
        print(f'[redmine] Retrieved {len(result.issues)} issues for "{project_identifier}" across {total_pages} page(s) in {result.durationMs / 1000:.1f}s')
        _issues_cache.set(key, result)
        return result

    return await _issues_in_flight.run(key, fetch)


async def load_versions(api_key: str, user_id: int, project_identifier: str) -> list[VersionMeta]:
    """Dates for every target version that appears on this project's tickets. Derived
    from the (cached) issue list rather than a separate Redmine listing — see
    get_versions_by_ids for why. Cached for an hour; version dates rarely change."""
    key = _scoped_key(user_id, project_identifier)
    cached = _versions_cache.get(key)
    if cached is not None:
        return cached
    issues_result = await load_project_issues(api_key, user_id, project_identifier, False)
    ids = [i.targetVersionId for i in issues_result.issues if i.targetVersionId is not None]
    versions = await get_versions_by_ids(ids, api_key)
    _versions_cache.set(key, versions)
    return versions


async def load_time_entries(
    api_key: str, user_id: int, project_identifier: str, force_refresh: bool
) -> TimeEntriesResult:
    key = _scoped_key(user_id, project_identifier)
    if not force_refresh:
        cached = _time_entries_cache.get(key)
        if cached is not None:
            print(
                f'[cache] Serving cached time entries for "{project_identifier}" ({len(cached.timeEntries)} entries, fetched {cached.fetchedAt})'
            )
            return cached
    else:
        _time_entries_cache.invalidate(key)

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
        _time_entries_cache.set(key, result)
        return result

    return await _time_entries_in_flight.run(key, fetch)
