import secrets
from dataclasses import dataclass

from .cache import TtlCache
from .config import SESSION_TTL_SECONDS
from .redmine_service import CurrentRedmineUser


@dataclass
class Session:
    api_key: str
    user: CurrentRedmineUser


# In-memory only — sessions do not survive a backend restart, same tradeoff as the
# issue cache. Each teammate's raw API key lives only here, keyed by an opaque random
# session id; it is never sent back to the browser after login.
_sessions: TtlCache[Session] = TtlCache(SESSION_TTL_SECONDS)


def create_session(api_key: str, user: CurrentRedmineUser) -> str:
    session_id = secrets.token_urlsafe(32)
    _sessions.set(session_id, Session(api_key=api_key, user=user))
    return session_id


def get_session(session_id: str | None) -> Session | None:
    if not session_id:
        return None
    return _sessions.get(session_id)


def destroy_session(session_id: str | None) -> None:
    if session_id:
        _sessions.invalidate(session_id)
