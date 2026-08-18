from fastapi import APIRouter, Depends

from ..data_store import load_project_issues
from ..dependencies import require_session
from ..redmine_service import get_issue_count
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


# Registered before /{project_identifier}/issues below only for readability — FastAPI
# matches these as distinct path templates ("/issues/count" vs "/issues"), so order
# between them doesn't actually affect routing.
@router.get("/{project_identifier}/issues/count")
async def get_issue_count_route(project_identifier: str, session: Session = Depends(require_session)):
    total_count = await get_issue_count(project_identifier, session.api_key)
    return {"totalCount": total_count}


@router.get("/{project_identifier}/issues")
async def get_issues_route(project_identifier: str, refresh: str = "false", session: Session = Depends(require_session)):
    result = await load_project_issues(session.api_key, project_identifier, refresh == "true")
    return result
