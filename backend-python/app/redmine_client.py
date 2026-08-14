import asyncio
import json
from typing import Any, Awaitable, Callable, TypeVar

import httpx

from .config import REDMINE_BASE_URL

T = TypeVar("T")

DEFAULT_TIMEOUT_SECONDS = 20.0

# Shared client for connection pooling/keep-alive across requests, mirroring the
# behavior of Node's global fetch() reusing sockets.
_client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS)


class RedmineApiError(Exception):
    """Wraps any failure talking to Redmine with a status code (or None for
    network/timeout failures) and a friendly, user-safe message. The raw message
    (which may include response bodies) is logged server-side but never sent to the
    browser."""

    def __init__(self, message: str, status: int | None, user_message: str):
        super().__init__(message)
        self.status = status
        self.user_message = user_message


def _friendly_message_for(status: int | None) -> str:
    if status == 401:
        return "Redmine rejected this API key (unauthorized). Please check the key in your Redmine account and log in again."
    if status == 403:
        return "Access to this Redmine resource is forbidden for your account."
    if status == 404:
        return "The requested Redmine resource was not found."
    if status == 429:
        return "Redmine is rate-limiting requests. Please wait a moment and try again."
    if status is None:
        return "Unable to connect to Redmine. Please check the Redmine URL or your network connection."
    if status >= 500:
        return "Redmine server encountered an error. Please try again shortly."
    return "Unable to connect to Redmine. Please check your Redmine credentials."


async def request_json(path: str, api_key: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """Every call takes the caller's own Redmine API key — there is no shared/global
    key. Never log it."""
    url = f"{REDMINE_BASE_URL}{path}"
    try:
        response = await _client.get(
            url,
            headers={"X-Redmine-API-Key": api_key, "Accept": "application/json"},
            timeout=timeout,
        )
    except httpx.TimeoutException:
        message = f"Request timed out after {timeout}s: {path}"
        print(f"[redmine] {message}")
        raise RedmineApiError(message, None, "Redmine request timed out. Please try again.")
    except httpx.HTTPError as err:
        message = f"Network error calling Redmine: {err}"
        print(f"[redmine] {message}")
        raise RedmineApiError(message, None, _friendly_message_for(None))

    if response.status_code >= 400:
        body_text = response.text[:500]
        message = f"Redmine {response.status_code} {response.reason_phrase} for {path}: {body_text}"
        print(f"[redmine] {message}")
        raise RedmineApiError(message, response.status_code, _friendly_message_for(response.status_code))

    try:
        return response.json()
    except json.JSONDecodeError as err:
        message = f"Invalid JSON from Redmine for {path}: {err}"
        print(f"[redmine] {message}")
        raise RedmineApiError(message, response.status_code, "Redmine returned an unexpected response. Please try again.")


ProgressCallback = Callable[[int, int, int, int], None]


async def fetch_all_paginated(
    base_path: str,
    list_key: str,
    api_key: str,
    page_size: int = 100,
    on_progress: ProgressCallback | None = None,
) -> list[dict[str, Any]]:
    """Generic pagination helper: repeatedly requests `base_path` with offset/limit
    query params until all records (per total_count) are retrieved, then de-duplicates
    by id. Runs up to 4 requests concurrently (independent lanes, not synchronized
    batches — a lane grabs the next offset the instant its own request finishes) to
    avoid overloading Redmine."""
    sep = "&" if "?" in base_path else "?"
    first = await request_json(f"{base_path}{sep}limit={page_size}&offset=0", api_key)

    total_count = int(first.get("total_count", 0))
    items: list[dict[str, Any]] = list(first.get(list_key) or [])
    total_pages = max(1, -(-total_count // page_size))  # ceil division
    if on_progress:
        on_progress(len(items), total_count, 1, total_pages)

    offsets = list(range(page_size, total_count, page_size))
    concurrency = 4
    cursor = 0
    page = 1
    lock = asyncio.Lock()

    async def worker() -> None:
        nonlocal cursor, page
        while True:
            async with lock:
                if cursor >= len(offsets):
                    return
                offset = offsets[cursor]
                cursor += 1

            res = await request_json(f"{base_path}{sep}limit={page_size}&offset={offset}", api_key)
            page_items = res.get(list_key) or []
            items.extend(page_items)

            async with lock:
                page += 1
                if on_progress:
                    on_progress(len(items), total_count, page, total_pages)

    await asyncio.gather(*(worker() for _ in range(min(concurrency, len(offsets)))))

    seen: set[int] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        item_id = item["id"]
        if item_id not in seen:
            seen.add(item_id)
            deduped.append(item)

    return deduped
