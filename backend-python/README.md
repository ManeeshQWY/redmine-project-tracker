# Redmine Project Tracker — Python backend (alternative to `backend/`)

A FastAPI port of `backend/` (Node/Express). Same API contract, same behavior, same
`/api/*` routes returning identically-shaped JSON — the existing `frontend/` (React)
talks to this exactly as it talks to the Node backend, with zero frontend changes.

This exists **alongside** the Node backend, not in place of it — both are kept so you
can compare or choose. Only one should be running against the frontend's proxy at a
time (see `frontend/vite.config.ts`'s `server.proxy` target).

## Setup

```bash
cd backend-python
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cp .env.example .env
# Edit .env: set REDMINE_BASE_URL (no API key needed — same per-user login model)
```

## Run

```bash
./venv/Scripts/python run.py   # Windows
# venv/bin/python run.py       # macOS/Linux
```

Listens on `http://localhost:4001` by default (`PORT` in `.env`) — deliberately
different from the Node backend's `4000` so both can run at once without conflicting.

To point the frontend at this backend instead of Node, change the `target` in
`frontend/vite.config.ts`'s proxy config to `http://localhost:4001`, then restart the
Vite dev server (Vite doesn't hot-reload config file changes).

## Tests

```bash
./venv/Scripts/python -m pytest -q
```

40 tests — pagination, HTTP error handling, transform/null-handling, custom-field
resolution, session store, and the aggregation logic (status/tracker/priority, aging,
resolution time, estimated-vs-actual) — mirroring the Node backend's vitest suite
one-for-one.

## Structure

```
app/
  config.py            Env vars (REDMINE_BASE_URL, PORT, ENVIRONMENT)
  redmine_client.py     httpx-based pagination + error handling (RedmineApiError)
  redmine_service.py    get_projects/get_issues/get_time_entries/resolve_current_user/...
  transform.py           Raw Redmine JSON -> normalized Issue/TimeEntry models
  models.py               Pydantic models with camelCase fields (matches frontend exactly)
  aggregations.py         Pure business logic: closed/not-closed, aging, resolution time, etc.
  cache.py                 TtlCache + InFlightGuard (in-memory, shared per-project)
  data_store.py            Wires caching around redmine_service calls
  session_store.py         In-memory session store (api_key + user, keyed by session id)
  dependencies.py           require_session FastAPI dependency
  routers/                  auth, projects, issues, time_entries, meta
  main.py                    App wiring: CORS, gzip, error handlers, static frontend serving
tests/                        pytest suite (respx for mocking Redmine HTTP calls)
```

## Notable differences from the Node version

- **Error responses** are made to match Node's `{"error": "..."}` shape exactly (FastAPI's
  default is `{"detail": "..."}`) via custom exception handlers in `main.py`, since the
  frontend only ever reads `body.error`.
- **Session cookie name** (`rtt_sid`) and **TTL** (12h) are identical to the Node backend
  by design, not by accident — matching them means the frontend needs no changes.
- Everything else (pagination concurrency=4, 15min/1h cache TTLs, shared per-project
  caching, gzip compression, single-process static frontend serving) is a deliberate
  1:1 port — see `backend/`'s own README for the full rationale behind each of these.

## Known gaps vs. the Node version

- Not yet deployed anywhere — this has only been run and tested locally.
- No production deployment config (e.g. a `render.yaml` / build command for a Python
  host) has been written yet, since the Node backend remains the deployed version.
