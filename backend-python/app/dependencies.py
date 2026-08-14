from fastapi import Cookie, HTTPException

from .config import SESSION_COOKIE_NAME
from .session_store import Session, get_session


def require_session(rtt_sid: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> Session:
    session = get_session(rtt_sid)
    if session is None:
        raise HTTPException(status_code=401, detail="Please log in with your Redmine API key.")
    return session
