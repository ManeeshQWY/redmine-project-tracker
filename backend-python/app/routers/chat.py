from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..chat_tools import build_tools
from ..data_store import load_project_issues
from ..dependencies import require_session
from ..gemini_service import ChatNotConfiguredError, ask
from ..redmine_service import ALL_PROJECTS
from ..session_store import Session

router = APIRouter(prefix="/api/projects")


class ChatTurn(BaseModel):
    role: str  # "user" | "model"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatTurn] = []


@router.post("/{project_identifier}/chat")
async def chat_route(project_identifier: str, body: ChatRequest, session: Session = Depends(require_session)):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Reuses the same cache the dashboard itself reads from — no extra Redmine call for
    # a project you're already viewing. Scoped to the whole project's tickets, not
    # whatever tracker/etc. filters happen to be active in the UI right now.
    result = await load_project_issues(session.api_key, project_identifier, False)
    tools, filter_recorder = build_tools(result.issues, session.api_key, project_identifier)
    project_label = "All Projects" if project_identifier == ALL_PROJECTS else project_identifier

    try:
        reply = await ask(body.message, [turn.model_dump() for turn in body.history], tools, project_label)
    except ChatNotConfiguredError as err:
        raise HTTPException(status_code=503, detail=str(err))

    return {"reply": reply, "suggestedFilter": _to_suggested_filter(filter_recorder)}


def _to_suggested_filter(recorder: dict) -> dict | None:
    """Maps search_tickets' recorded filter args (see chat_tools.build_tools) onto the
    frontend's TicketFilters shape (see frontend/src/utils/filters.ts) — tracker
    becomes a one-item `trackers` array since that's the app's single global
    multi-select tracker filter."""
    if not recorder:
        return None
    patch: dict = {}
    if recorder.get("assignee"):
        patch["assignee"] = recorder["assignee"]
    if recorder.get("tracker"):
        patch["trackers"] = [recorder["tracker"]]
    if recorder.get("status"):
        patch["status"] = recorder["status"]
    if recorder.get("priority"):
        patch["priority"] = recorder["priority"]
    if recorder.get("search"):
        patch["search"] = recorder["search"]
    return patch or None
