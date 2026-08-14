from fastapi import APIRouter, Depends

from ..data_store import load_project_issues
from ..dependencies import require_session
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


@router.get("/{project_identifier}/issues")
async def get_issues_route(project_identifier: str, refresh: str = "false", session: Session = Depends(require_session)):
    result = await load_project_issues(session.api_key, project_identifier, refresh == "true")
    return result
