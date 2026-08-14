from fastapi import APIRouter, Depends

from ..data_store import load_time_entries
from ..dependencies import require_session
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


# project_identifier may be the special value "__all__" (ALL_PROJECTS) — this is a
# deliberately explicit, on-demand endpoint (not auto-fetched with issues) since time
# entry volume can be very large (tens of thousands across the whole instance).
@router.get("/{project_identifier}/time-entries")
async def get_time_entries_route(project_identifier: str, refresh: str = "false", session: Session = Depends(require_session)):
    result = await load_time_entries(session.api_key, project_identifier, refresh == "true")
    return result
