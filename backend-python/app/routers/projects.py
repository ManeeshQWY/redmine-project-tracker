from fastapi import APIRouter, Depends

from ..data_store import load_projects
from ..dependencies import require_session
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


@router.get("")
async def get_projects_route(session: Session = Depends(require_session)):
    projects = await load_projects(session.api_key)
    return {"projects": projects}
