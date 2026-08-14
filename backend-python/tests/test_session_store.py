from app.redmine_service import CurrentRedmineUser
from app.session_store import create_session, destroy_session, get_session

test_user = CurrentRedmineUser(id=1, name="Jane Doe", login="jane", mail="jane@example.com")


def test_creates_session_retrievable_by_id_holding_callers_own_api_key():
    session_id = create_session("secret-key", test_user)
    session = get_session(session_id)
    assert session is not None
    assert session.api_key == "secret-key"
    assert session.user is test_user


def test_returns_none_for_unknown_session_id():
    assert get_session("does-not-exist") is None


def test_returns_none_when_no_session_id_provided():
    assert get_session(None) is None


def test_invalidates_session_on_destroy():
    session_id = create_session("secret-key", test_user)
    assert get_session(session_id) is not None
    destroy_session(session_id)
    assert get_session(session_id) is None


def test_keeps_different_sessions_independent_even_for_same_user():
    a = create_session("key-a", test_user)
    b = create_session("key-b", CurrentRedmineUser(id=2, name="Jane Doe", login="jane", mail="jane@example.com"))
    assert get_session(a).api_key == "key-a"
    assert get_session(b).api_key == "key-b"
    destroy_session(a)
    assert get_session(a) is None
    assert get_session(b) is not None
