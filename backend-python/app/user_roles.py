"""The master list that says who is a Developer and who is QA.

Redmine doesn't record a person's role, and the Assignee / Additional Assignee / Assigned
QA fields say who is *on a ticket*, not what the person *is* — so the Dev & QA
Performance report takes roles only from this list. It lives in user_roles.json next to
the backend code (committed, versioned, redeployed to change); there is deliberately no
database. Names must match the Redmine display name (case and surrounding spaces are
ignored)."""

import json
from pathlib import Path

from .models import UserRolesResult

USER_ROLES_FILE = Path(__file__).resolve().parent.parent / "user_roles.json"

_DEVELOPER_KEY = "developer"
_QA_KEY = "qa"


def _names(value: object, key: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f'"{key}" must be a list of names (strings)')
    seen: dict[str, str] = {}
    for v in value:
        name = v.strip()
        if name and name.lower() not in seen:
            seen[name.lower()] = name
    return list(seen.values())


def load_user_roles(path: Path = USER_ROLES_FILE) -> UserRolesResult:
    """Never raises: a missing or malformed file returns an empty list plus an `error`, so
    one bad edit degrades the report to "everyone Unknown" instead of breaking the app."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return UserRolesResult(error=f"{path.name} was not found, so nobody has a role yet.")
    except (OSError, json.JSONDecodeError) as err:
        return UserRolesResult(error=f"{path.name} could not be read: {err}")

    if not isinstance(raw, dict):
        return UserRolesResult(error=f'{path.name} must be a JSON object like {{"Developer": [...], "QA": [...]}}.')

    developers: list[str] = []
    qa: list[str] = []
    try:
        for key, value in raw.items():
            lowered = str(key).strip().lower()
            if lowered.startswith("_"):  # "_comment" style notes are allowed
                continue
            if lowered == _DEVELOPER_KEY:
                developers = _names(value, key)
            elif lowered == _QA_KEY:
                qa = _names(value, key)
            else:
                return UserRolesResult(error=f'{path.name} has an unknown key "{key}" — use "Developer" and "QA".')
    except ValueError as err:
        return UserRolesResult(error=f"{path.name}: {err}")

    # A person listed under both roles is ambiguous — surface it rather than pick one.
    qa_lower = {n.lower() for n in qa}
    conflicts = sorted(n for n in developers if n.lower() in qa_lower)
    conflict_lower = {c.lower() for c in conflicts}
    return UserRolesResult(
        developers=[n for n in developers if n.lower() not in conflict_lower],
        qa=[n for n in qa if n.lower() not in conflict_lower],
        conflicts=conflicts,
    )
