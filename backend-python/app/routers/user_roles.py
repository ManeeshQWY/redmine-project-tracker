from fastapi import APIRouter, Depends

from ..dependencies import require_session
from ..models import UserRolesResult
from ..session_store import Session
from ..user_roles import load_user_roles

router = APIRouter(prefix="/api")


# Read per request (a tiny file) so an edited list is picked up on the next load without
# waiting for any cache. Requires a session like every other data endpoint.
@router.get("/user-roles", response_model=UserRolesResult)
async def get_user_roles_route(_session: Session = Depends(require_session)):
    return load_user_roles()
