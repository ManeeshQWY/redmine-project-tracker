from fastapi import APIRouter, Depends, Request

from ..data_store import load_time_entries
from ..dependencies import require_session
from ..disconnect import cancel_on_disconnect
from ..load_window import LoadWindow, load_window_params
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


# project_identifier may be the special value "__all__" (ALL_PROJECTS) — this is a
# deliberately explicit, on-demand endpoint (not auto-fetched with issues) since time
# entry volume can be very large (tens of thousands across the whole instance).
@router.get("/{project_identifier}/time-entries")
async def get_time_entries_route(
    request: Request,
    project_identifier: str,
    refresh: str = "false",
    # Time spent in this period: ?days=30 (0 = everything) or ?from=&to=.
    window: LoadWindow = Depends(load_window_params),
    session: Session = Depends(require_session),
):
    # Stop paging Redmine if the person cancels the load (the browser drops the connection).
    return await cancel_on_disconnect(
        request, load_time_entries(session.api_key, session.user.id, project_identifier, refresh == "true", window)
    )
