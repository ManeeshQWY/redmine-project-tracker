import asyncio
import time
from typing import Any

from .models import Issue, PriorityMeta, ProjectIssuesResult, ProjectMeta, StatusMeta, TimeEntriesResult, TrackerMeta
from .redmine_client import ProgressCallback, fetch_all_paginated, request_json
from .transform import transform_issue, transform_time_entry

# Special pseudo project identifier meaning "every project on the instance". Never sent
# to Redmine directly — it just means "omit project_id".
ALL_PROJECTS = "__all__"


class CurrentRedmineUser:
    def __init__(self, id: int, name: str, login: str, mail: str | None):
        self.id = id
        self.name = name
        self.login = login
        self.mail = mail


async def resolve_current_user(api_key: str) -> CurrentRedmineUser:
    """Validates an API key and identifies who it belongs to — used at login time. Any
    authenticated Redmine account can call this endpoint (no admin rights needed)."""
    res = await request_json("/users/current.json", api_key)
    u = res["user"]
    name = f"{u.get('firstname', '')} {u.get('lastname', '')}".strip()
    return CurrentRedmineUser(id=u["id"], name=name, login=u["login"], mail=u.get("mail"))


async def get_projects(api_key: str) -> list[ProjectMeta]:
    projects = await fetch_all_paginated("/projects.json", "projects", api_key, 100)
    active = [p for p in projects if p.get("status") == 1]
    result = [
        ProjectMeta(id=p["id"], name=p["name"], identifier=p["identifier"], parent=(p.get("parent") or {}).get("name"))
        for p in active
    ]
    return sorted(result, key=lambda p: p.name.lower())


async def get_statuses(api_key: str) -> list[StatusMeta]:
    res = await request_json("/issue_statuses.json", api_key)
    return [StatusMeta(id=s["id"], name=s["name"], isClosed=s["is_closed"]) for s in res["issue_statuses"]]


async def get_trackers(api_key: str) -> list[TrackerMeta]:
    res = await request_json("/trackers.json", api_key)
    return [TrackerMeta(id=t["id"], name=t["name"]) for t in res["trackers"]]


async def get_priorities(api_key: str) -> list[PriorityMeta]:
    res = await request_json("/enumerations/issue_priorities.json", api_key)
    return [PriorityMeta(id=p["id"], name=p["name"]) for p in res["issue_priorities"]]


async def get_project_user_map(project_identifier: str, api_key: str) -> dict[int, str]:
    """Builds a user id -> display name map from project memberships. This avoids
    needing the admin-only /users.json endpoint (confirmed 403 even for a normal API
    key) while still resolving custom fields that store raw user ids, such as
    "Assigned QA"."""
    memberships = await fetch_all_paginated(f"/projects/{project_identifier}/memberships.json", "memberships", api_key, 100)
    user_map: dict[int, str] = {}
    for m in memberships:
        user = m.get("user")
        if user:
            user_map[user["id"]] = user["name"]
    return user_map


async def get_global_user_map(api_key: str) -> dict[int, str]:
    """Union of every project's membership map — used for the "All Projects" view,
    where a single project's memberships aren't enough to resolve every custom-field
    user id that might appear. One request per project, capped at 4 concurrent, and
    cached by the caller (data_store) for an hour so this only actually hits Redmine
    occasionally."""
    projects = await get_projects(api_key)
    merged: dict[int, str] = {}
    concurrency = 4
    cursor = 0
    lock = asyncio.Lock()

    async def worker() -> None:
        nonlocal cursor
        while True:
            async with lock:
                if cursor >= len(projects):
                    return
                project = projects[cursor]
                cursor += 1
            try:
                user_map = await get_project_user_map(project.identifier, api_key)
                merged.update(user_map)
            except Exception as err:
                print(f'[redmine] Failed to load memberships for "{project.identifier}": {err}')

    await asyncio.gather(*(worker() for _ in range(min(concurrency, len(projects)))))
    return merged


async def get_project_issues(
    project_identifier: str | None,
    api_key: str,
    on_progress: ProgressCallback | None = None,
) -> ProjectIssuesResult:
    """Fetches all issues for a single project (subprojects are included automatically
    by Redmine), or for the whole instance when project_identifier is None/ALL_PROJECTS."""
    start = time.monotonic()
    is_all_projects = not project_identifier or project_identifier == ALL_PROJECTS
    path = "/issues.json?status_id=*" if is_all_projects else f"/issues.json?project_id={project_identifier}&status_id=*"

    async def load_user_map() -> dict[int, str]:
        try:
            return await (get_global_user_map(api_key) if is_all_projects else get_project_user_map(project_identifier, api_key))  # type: ignore[arg-type]
        except Exception as err:
            print(f"[redmine] Failed to load memberships for user-id resolution: {err}")
            return {}

    raw_issues, user_map = await asyncio.gather(
        fetch_all_paginated(path, "issues", api_key, 100, on_progress),
        load_user_map(),
    )

    issues: list[Issue] = [transform_issue(raw, user_map) for raw in raw_issues]

    return ProjectIssuesResult(
        issues=issues,
        totalCount=len(raw_issues),
        fetchedCount=len(issues),
        durationMs=int((time.monotonic() - start) * 1000),
        fetchedAt=_iso_now(),
    )


async def get_time_entries(
    project_identifier: str | None,
    api_key: str,
    on_progress: ProgressCallback | None = None,
) -> TimeEntriesResult:
    """Fetches time entries (who actually logged time, not just who an issue is
    assigned to) for a single project or the whole instance. Volume can be very large
    (tens of thousands for "All Projects"), so callers should treat this as an
    explicit, on-demand action rather than something to auto-fetch."""
    start = time.monotonic()
    is_all_projects = not project_identifier or project_identifier == ALL_PROJECTS
    path = "/time_entries.json" if is_all_projects else f"/time_entries.json?project_id={project_identifier}"

    raw_entries = await fetch_all_paginated(path, "time_entries", api_key, 100, on_progress)
    time_entries = [transform_time_entry(raw) for raw in raw_entries]

    return TimeEntriesResult(
        timeEntries=time_entries,
        totalCount=len(time_entries),
        durationMs=int((time.monotonic() - start) * 1000),
        fetchedAt=_iso_now(),
    )


def _iso_now() -> str:
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
