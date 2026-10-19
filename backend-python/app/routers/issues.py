from fastapi import APIRouter, Depends, Request

from ..data_store import load_project_issues, load_versions
from ..dependencies import require_session
from ..disconnect import cancel_on_disconnect
from ..load_window import LoadWindow, load_window_params
from ..redmine_service import get_issue_count
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


# Registered before /{project_identifier}/issues below only for readability — FastAPI
# matches these as distinct path templates ("/issues/count" vs "/issues"), so order
# between them doesn't actually affect routing.
@router.get("/{project_identifier}/issues/count")
async def get_issue_count_route(
    project_identifier: str,
    window: LoadWindow = Depends(load_window_params),
    session: Session = Depends(require_session),
):
    total_count = await get_issue_count(project_identifier, session.api_key, window)
    return {"totalCount": total_count}


@router.get("/{project_identifier}/issues")
async def get_issues_route(
    request: Request,
    project_identifier: str,
    refresh: str = "false",
    # ?days=30 (0 = everything) or ?from=&to= — tickets last updated in that period. Defaults
    # to the recent window because loading a whole large instance is slow and memory-hungry.
    window: LoadWindow = Depends(load_window_params),
    session: Session = Depends(require_session),
):
    # If the person cancels the load the browser drops the connection; stop paging Redmine.
    return await cancel_on_disconnect(
        request, load_project_issues(session.api_key, session.user.id, project_identifier, refresh == "true", window)
    )


# Lazy, separate from /issues so the (already slow) ticket load isn't made slower — the
# Release Dashboard calls this only when that tab is opened.
@router.get("/{project_identifier}/versions")
async def get_versions_route(
    request: Request,
    project_identifier: str,
    window: LoadWindow = Depends(load_window_params),
    session: Session = Depends(require_session),
):
    versions = await cancel_on_disconnect(request, load_versions(session.api_key, session.user.id, project_identifier, window))
    return {"versions": versions}
