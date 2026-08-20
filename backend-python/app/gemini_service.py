"""Wraps the Gemini API call for the read-only ticket chatbot.

Runs the tool-call loop manually (automatic_function_calling disabled) rather than
using the SDK's built-in automatic function calling: with a lite model, the model
sometimes hallucinates a plausible-but-nonexistent tool name (e.g.
"search_tracker_breakdown" when only get_tracker_breakdown exists) or malformed args.
The SDK's automatic mode raises a raw KeyError and crashes the whole request when that
happens; running the loop by hand lets an unknown tool name or a bad-args exception be
fed back to the model as an ordinary function_response error instead, so the model can
just apologize or retry with the correct name rather than the request 500ing."""

import inspect
from typing import Callable

from google import genai
from google.genai import types

from .config import GEMINI_API_KEY

MODEL = "gemini-3.5-flash-lite"
MAX_TOOL_ROUNDS = 6
MAX_EMPTY_RESPONSE_RETRIES = 2

SYSTEM_INSTRUCTION = (
    'You are a read-only assistant answering questions about tickets in the Redmine '
    'project "{project_label}". Always use the provided tools to look up real data '
    "before answering — never guess or invent ticket numbers, counts, or names, and "
    "never call a tool that wasn't given to you. Whenever the user references a "
    "specific ticket number (e.g. \"#123\", \"ticket 123\", or a Redmine URL ending in "
    "/issues/123), use get_ticket_by_id — never search_tickets, which can't match "
    "against ticket numbers, only subject text. If a question can't be answered with "
    "the available tools, say so plainly. Keep answers concise and conversational, not "
    "raw JSON. You cannot modify, create, or close any tickets — you can only report "
    "what you find."
)


class ChatNotConfiguredError(Exception):
    """Raised when GEMINI_API_KEY isn't set — the chat feature is optional and the rest
    of the app works fine without it."""


async def _run_tool(tool_map: dict[str, Callable], call: types.FunctionCall) -> dict:
    fn = tool_map.get(call.name or "")
    if fn is None:
        return {"error": f"Unknown tool \"{call.name}\". Available tools: {', '.join(tool_map)}."}
    try:
        result = fn(**(call.args or {}))
        if inspect.isawaitable(result):
            result = await result
    except Exception as err:  # noqa: BLE001 — deliberately broad: any tool failure becomes a recoverable model-visible error, not a 500
        return {"error": f"Tool \"{call.name}\" failed: {err}"}
    return result if isinstance(result, dict) else {"result": result}


async def _send_message_with_retry(chat, message_or_parts):
    """The lite model occasionally returns a genuinely empty response (candidates=None,
    no error raised, no safety block) — a transient reliability quirk rather than
    anything about the request itself. Retrying the exact same message a couple of
    times resolves it in practice, so give up on the caller's behalf only after that."""
    response = None
    for _ in range(1 + MAX_EMPTY_RESPONSE_RETRIES):
        response = await chat.send_message(message_or_parts)
        if response.candidates:
            return response
    return response


async def ask(message: str, history: list[dict], tools: list[Callable], project_label: str) -> str:
    if not GEMINI_API_KEY:
        raise ChatNotConfiguredError("Chat is not configured on this server (missing GEMINI_API_KEY).")

    tool_map = {fn.__name__: fn for fn in tools}
    client = genai.Client(api_key=GEMINI_API_KEY)

    # Stateless per-request: a fresh Chat object is created each call, seeded with the
    # prior turns the frontend sent back — nothing is kept server-side between requests.
    prior_turns = [
        types.Content(role="model" if turn.get("role") == "model" else "user", parts=[types.Part(text=turn.get("text", ""))])
        for turn in history
    ]
    chat = client.aio.chats.create(
        model=MODEL,
        history=prior_turns,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION.format(project_label=project_label),
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )

    # A round can contain the model's real answer text *and* a trailing tool call in
    # the same turn — the round after that tool call often has no text of its own, so
    # the latest non-empty text has to be tracked across rounds rather than trusting
    # whichever round the loop ends on.
    last_text: str | None = None
    response = await _send_message_with_retry(chat, message)
    for _ in range(MAX_TOOL_ROUNDS):
        if response.text:
            last_text = response.text
        calls = response.function_calls
        if not calls:
            break
        parts = [types.Part.from_function_response(name=call.name or "", response=await _run_tool(tool_map, call)) for call in calls]
        response = await _send_message_with_retry(chat, parts)
    if response.text:
        last_text = response.text

    return last_text or "I couldn't come up with an answer for that — try rephrasing?"
