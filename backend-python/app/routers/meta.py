from fastapi import APIRouter, Depends

from ..data_store import load_meta
from ..dependencies import require_session
from ..session_store import Session

router = APIRouter(prefix="/api/meta")


@router.get("")
async def get_meta_route(session: Session = Depends(require_session)):
    return await load_meta(session.api_key)
