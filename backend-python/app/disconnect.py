"""Stop work for a request the browser has abandoned.

A load can take minutes (hundreds of Redmine pages). If the person cancels it, the browser
drops the connection — but the server would otherwise carry on paging through Redmine and
fill memory for a result nobody will read. `cancel_on_disconnect` watches the connection
and cancels the work as soon as it goes away."""

import asyncio
from typing import Awaitable, TypeVar

from fastapi import HTTPException, Request

T = TypeVar("T")

POLL_SECONDS = 0.25


async def cancel_on_disconnect(request: Request, work: Awaitable[T]) -> T:
    task = asyncio.ensure_future(work)

    async def watch() -> None:
        while not await request.is_disconnected():
            await asyncio.sleep(POLL_SECONDS)

    watcher = asyncio.ensure_future(watch())
    try:
        done, _ = await asyncio.wait({task, watcher}, return_when=asyncio.FIRST_COMPLETED)
        if task in done:
            return task.result()
        # The client went away first: stop the work (the response is discarded anyway).
        task.cancel()
        raise HTTPException(status_code=499, detail="The request was cancelled.")
    finally:
        watcher.cancel()
        if not task.done():
            task.cancel()
