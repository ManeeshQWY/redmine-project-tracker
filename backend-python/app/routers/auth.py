from fastapi import APIRouter, Depends, Request, Response

from ..config import IS_PRODUCTION, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS
from ..dependencies import require_session
from ..models import CurrentUser
from ..redmine_service import resolve_current_user
from ..session_store import Session, create_session, destroy_session

router = APIRouter(prefix="/api/auth")


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=IS_PRODUCTION,
        path="/",
    )


@router.post("/login")
async def login(request: Request, response: Response):
    body = await request.json()
    api_key = (body.get("apiKey") or "").strip() if isinstance(body, dict) else ""
    if not api_key:
        response.status_code = 400
        return {"error": "Please enter your Redmine API key."}

    user = await resolve_current_user(api_key)
    session_id = create_session(api_key, user)
    _set_session_cookie(response, session_id)
    return {"user": CurrentUser(name=user.name, login=user.login, mail=user.mail)}


@router.post("/logout")
async def logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    destroy_session(session_id)
    response.delete_cookie(key=SESSION_COOKIE_NAME, httponly=True, samesite="lax", secure=IS_PRODUCTION, path="/")
    return {"ok": True}


@router.get("/me")
async def me(session: Session = Depends(require_session)):
    return {"user": CurrentUser(name=session.user.name, login=session.user.login, mail=session.user.mail)}
