# Redmine Project Tracker — Backend

FastAPI backend for the app. Talks to Redmine's REST API on behalf of each logged-in
user and serves normalized JSON to `frontend/` at `/api/*`.

## Setup

```bash
cd backend-python
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cp .env.example .env
# Edit .env: set REDMINE_BASE_URL (no API key needed — each teammate logs in with
# their own Redmine API key via the app's login screen)
```

## Run

```bash
./venv/Scripts/python run.py   # Windows
# venv/bin/python run.py       # macOS/Linux
```

Listens on `http://localhost:4001` by default (`PORT` in `.env`). The frontend's dev
proxy (`frontend/vite.config.ts`'s `server.proxy` target) already points here.

## Tests

```bash
./venv/Scripts/python -m pytest -q
```

40 tests — pagination, HTTP error handling, transform/null-handling, custom-field
resolution, session store, and the aggregation logic (status/tracker/priority, aging,
resolution time, estimated-vs-actual).

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

## Notable design choices

- **Error responses** are shaped as `{"error": "..."}` (not FastAPI's default
  `{"detail": "..."}`) via custom exception handlers in `main.py`, since the frontend
  only ever reads `body.error`.
- **Session cookie** (`rtt_sid`, httpOnly, 12h TTL) — the raw Redmine API key is held
  server-side only, never sent back to the browser after login.
- Pagination runs 4 concurrent lanes; issue/time-entry caches are shared per-project
  (not per-user) with a 15-minute TTL, meta caches (statuses/trackers/priorities/
  projects) at 1 hour — see the root `README.md` for the full rationale.

This is deployed to Render as the production service.
