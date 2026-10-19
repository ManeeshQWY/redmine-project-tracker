# Redmine Project Tracker

An internal ticket-tracking dashboard for `https://support.qwysoft.com`. Pick a Redmine
project (or **★ All Projects** to see the whole instance at once), and get a full ticket
table (search/filter/sort, with a Project column/filter whenever more than one project is
in view), a KPI dashboard, aging & resolution-time analytics, estimated-vs-actual hours, a
release/version summary, a QA summary, a **Time Spent by User** report (every logger, not
just issue assignees), and an Excel export — all backed by the real Redmine REST API with
full pagination (no "first 100 tickets" truncation).

Note: Redmine already includes subproject tickets automatically when you pick a parent
project (e.g. "QWQER DMS - INDIA" also returns its child projects' tickets) — no separate
setting needed for that. **All Projects** is for going further than that: every project on
the instance in one view, confirmed at ~19,600+ tickets for this instance, so it takes
noticeably longer to load than a single project. **Time Spent by User** is loaded on
demand (via an explicit "Load Time Data" button) rather than automatically, since time
entry volume can be very large (16,000+ for one mid-size project, more for All Projects).

## Architecture

```
Browser (React) → this app's FastAPI backend → Redmine REST API
```

**Each teammate logs in with their own Redmine API key** via the app's login screen —
there is no shared/global API key anywhere in this app. The submitted key is validated
against Redmine (`/users/current.json`), then held only in server-side memory, keyed by
an opaque random session id stored in an httpOnly cookie. The browser never sees or
stores the raw key — only that opaque cookie, which is useless outside this app. The
frontend only ever calls `/api/*` on our own backend, never Redmine directly.

```
backend-python/      FastAPI + Python API server (talks to Redmine)
  app/redmine_client.py   Redmine HTTP client + pagination + error handling
  app/redmine_service.py  get_projects/get_issues/get_time_entries/resolve_current_user/...
  app/transform.py         Raw Redmine JSON -> normalized Issue/TimeEntry models
  app/aggregations.py      Business logic: closed/not-closed, aging, resolution time, etc.
  app/data_store.py        In-memory TTL caching (shared per-project)
  app/session_store.py     In-memory session store (api_key + user, keyed by session id)
  app/routers/              auth, projects, issues, time_entries, meta
  tests/                     pytest unit tests

frontend/            React + TypeScript + Vite + Tailwind app
  src/services/api.ts   The only module that calls the backend (credentials:"include"
                         so the session cookie is sent on every request)
  src/components/       LoginScreen, dashboard, table, filters, charts
  src/utils/             Aggregations (status/tracker/priority/aging/resolution/variance),
                          filters/sort, Excel export (ExcelJS)
```

Data (and Redmine visibility) is cached and scoped **per logged-in Redmine user id** —
one teammate's cached tickets are never served to another teammate, since different
accounts can have different project/issue permissions in Redmine.

## Prerequisites

- Python 3.11+ and Node.js 20+ (backend and frontend respectively)
- Each user needs their own Redmine API key for `https://support.qwysoft.com`
  (Redmine → My account → API access key) — entered at login, not configured anywhere.

## Setup

**1. Install dependencies:**

```bash
cd backend-python
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

cd ../frontend
npm install
```

**2. Configure environment variables** — copy the example:

```bash
cd backend-python
cp .env.example .env
```

Edit `backend-python/.env`:

```
REDMINE_BASE_URL=https://support.qwysoft.com
PORT=4001
ENVIRONMENT=
```

There's no API key to set here — `backend-python/.env` only needs the Redmine base URL.
Set `ENVIRONMENT=production` when deploying (enables secure cookies and serving the
built frontend); leave it blank for local development. `backend-python/.env` is
gitignored — never commit it.

**3. Start the backend:**

```bash
cd backend-python
./venv/Scripts/python run.py   # Windows
# venv/bin/python run.py       # macOS/Linux
```

It listens on `http://localhost:4001`.

**4. Start the frontend** (in a second terminal):

```bash
cd frontend
npm run dev
```

It listens on `http://localhost:5173` and proxies `/api/*` to the backend (see
`frontend/vite.config.ts`) — so open **http://localhost:5173** in your browser.

**5. Use the app**

1. **Sign in** with your own Redmine API key (Redmine → My account → API access key).
   It's validated against Redmine once at login and never stored in the browser.
2. Select a project from the dropdown (e.g. "INDIA - ERP Platform").
3. Wait for the initial load — for a ~2,300-ticket project this takes roughly
   15-20 seconds the first time (paginated fetch from Redmine); subsequent
   loads for the same project are served from an in-memory cache (your own copy —
   caches are per user) until you hit **Refresh Data**, the 15-minute cache
   expires, or the backend restarts.
4. Explore the tabs: Overview (KPIs + breakdown charts), Ticket Table (search/filter/sort,
   clickable ticket links), Aging & Resolution, Release Dashboard, QA Dashboard,
   Time Spent by User, Dev & QA Performance (per-person estimation/actuals/bugs per task with
   filters, grouping and its own Excel export), and more.
5. Click **Export to Excel** to download a 4-sheet workbook (Master Tickets, Summary, Time
   Analysis, Aging) reflecting the currently selected project and filters.
6. **Log out** clears your session cookie server-side immediately.

## Deploying for a team (free-tier hosting)

Since the app handles its own per-user login, it's safe to host it somewhere your whole
team can reach without needing a shared internal server. This app is deployed to
Render.com as a single Python (FastAPI) service, which serves the built frontend
(`frontend/dist`) alongside the API — set `REDMINE_BASE_URL` and `ENVIRONMENT=production`
as environment variables there, and share the resulting URL so each teammate can log in
with their own Redmine API key.

Free tiers typically sleep after a period of inactivity, so the first request after idle
time can take 30-50 seconds to wake up.

## Running tests

```bash
cd backend-python
./venv/Scripts/python -m pytest -q
```

Covers: pagination (including the "don't assume the first page is everything" case and
de-duplication), closed/not-closed calculation (based on each status's `is_closed` flag,
not a hardcoded status id), status/tracker/priority aggregation, null/blank handling,
custom-field resolution (including resolving numeric user ids to names), aging buckets,
resolution-time stats, estimated-vs-actual variance, and HTTP error handling
(401/403/404/429/5xx/timeout/invalid JSON).

## API investigation findings

Captured by live inspection of `support.qwysoft.com` before writing any code (see the
`issue_statuses.json`, `trackers.json`, `enumerations/issue_priorities.json`, and sample
`issues.json` responses):

- **Closed statuses are not just id 5.** This instance's closed statuses are `Closed` (11),
  `Not a Defect` (10), and `Test Passed` (15) — identified via each status's `is_closed`
  flag, never a hardcoded id.
- **The issue list endpoint already returns time and custom-field data** —
  `spent_hours`, `total_spent_hours`, `total_estimated_hours`, and `custom_fields` are all
  present on `/issues.json` list responses, so bulk fetches do **not** need a second
  per-issue API call. (Individual `/issues/{id}.json` calls return the same shape and are
  only used if you need per-issue detail outside a bulk load.)
- **"Assigned QA" (and similar custom fields) store raw Redmine user ids**, e.g.
  `{"id":23,"name":"Assigned QA","value":["88"]}`. `/users.json` (the list endpoint) is
  403 for this API key (non-admin), so names are resolved via
  `/projects/{id}/memberships.json`, which returns `{user: {id, name}}` for every project
  member and is accessible with a normal API key.
- **Target Version** is Redmine's `fixed_version` field.
- Trackers, priorities, and custom field ids/names are instance-specific — the app matches
  custom fields by **name** (case-insensitive), never by hardcoded id, so it keeps working
  if field ids change.
- **`project_id` on `/issues.json` already includes subprojects.** Confirmed by comparing
  a parent project (17,354 tickets) against one of its children fetched alone (2,332) —
  Redmine rolls subprojects up automatically, no extra parameter needed.
- **`/issues.json` and `/time_entries.json` without a `project_id` return every project the
  API key can see** — this is how "All Projects" works. Confirmed at 19,639 tickets across
  the whole instance at the time of testing.
- **Who actually logged time ≠ who an issue is assigned to.** `/time_entries.json` returns
  individual log entries with their own `user` field, separate from `Issue.assignedTo` —
  used for the "Time Spent by User" report so effort by any contributor is visible, not
  just the assignee's.

## Assumptions

- "High Priority" on the KPI card counts `High`, `Urgent`, and `Immediate` priorities
  (this instance's priority list, from `enumerations/issue_priorities.json`, is
  Low/Normal/High/Urgent/Immediate).
- "Total Time Spent" (management's primary actual-effort metric per the spec) is
  `total_spent_hours`, falling back to `spent_hours` if unavailable.
- The QA pipeline stage cards match status names loosely (`includes("qa in progress")`,
  etc.) so they keep working if status names are renamed slightly, rather than requiring
  an exact string match.
- Only active projects (`status: 1`, i.e. not archived/closed) are shown in the project
  dropdown.
- Any Redmine account that can authenticate (`/users/current.json`) is accepted — the app
  doesn't restrict logins to a particular group/role; it relies on each user's own Redmine
  permissions to determine what projects/issues they can see.
- **Issues, time entries, target versions and the project list are cached per user**
  (keyed by user id + project), because Redmine returns only what the calling API key may
  see and that differs between people. Only statuses/trackers/priorities, which are
  identical for everyone, are shared. Cache memory therefore grows with the number of
  distinct users viewing a project — worth watching on a memory-constrained free-tier
  host. TTLs: 15 min for tickets/time entries, 1h for the rest.

## Load window (recent data by default)

Loading a whole large instance is slow and can exhaust the free host's memory, so by default
only **tickets updated in the last 30 days** and **time logged in the last 30 days** are
loaded. The "Tickets updated in" selector at the top of the page widens it (90 days, 6
months, 12 months, all time) or takes an exact **custom date range** (pick "Custom range…",
choose From/To, click Apply). Presets load immediately and are remembered; a custom range is
a one-off and is not remembered.

- **Cancel.** While a load runs there is a **Cancel** button. Cancelling a change of period
  or project goes back to what was on screen (the server still has it cached); cancelling the
  very first load offers "Load again"; cancelling a Refresh keeps the tickets already shown.
  Cancelling also stops the *server* fetching from Redmine for it (the backend notices the
  dropped connection), so an accidental "All time" doesn't keep consuming memory.
- **API.** The issues, count, versions, time-entries and chat endpoints take `?days=30`
  (`0` = no limit) or `?from=YYYY-MM-DD&to=YYYY-MM-DD` (a range wins over `days`; a bad or
  backwards range is a 400). Tickets are filtered by last-updated date, time entries by date
  spent.
- **Memory.** The issue/time-entry caches are keyed per user, project **and** period, and are
  capped to a few datasets so memory can't grow without bound.
- Tickets nobody has touched within the period — including older parent tasks — are not
  loaded, so Overview/Aging numbers cover only the loaded tickets; the page says what period
  it is showing.

## Developer / QA master list

The Dev & QA Performance tab takes a person's role **only** from
`backend-python/user_roles.json` — Redmine does not store it, and the Assignee, Additional
Assignee and Assigned QA fields say who is *on* a ticket, not what they *are*:

```json
{
  "Developer": ["Dev Dan", "Dev Dee"],
  "QA": ["Quinn QA"]
}
```

Use each person's exact Redmine display name (case is ignored). Edit, commit and redeploy to
change it. Anyone not listed shows as **Unknown** (the tab lists them so they can be added);
a name under both roles is flagged as a conflict and also treated as Unknown. No database is
involved.

## Known limitations

- Sessions and the issue/meta caches are in-memory only — a backend restart logs
  everyone out and forces a fresh fetch on next login. Sessions last 12 hours from login.
- The ticket table uses client-side paged rendering (25-200 rows/page) rather than a
  virtualized scroll list; this comfortably handles the ~2,300-10,000+ ticket range
  targeted by the spec without an extra dependency, but a true virtualized grid would
  scale further if a single project reaches tens of thousands of tickets.
- **All Projects and Time Spent by User can be slow and put more load on Redmine** than a
  single-project view — All Projects fetches every ticket on the instance (tens of
  thousands), and Time Spent by User is deliberately not auto-fetched for that reason.
  Both still use the same capped-concurrency (4 parallel requests) paginator as everything
  else, just over more pages.
- Excel export runs in the browser (ExcelJS) using already-loaded data, so it reflects
  whatever filters are active in the Ticket Table tab at export time — very large exports
  (10,000+ rows) may take a few seconds to generate client-side.
- API responses are gzip-compressed (via the `compression` middleware) to reduce transfer
  time for large payloads like "All Projects," at a small CPU cost per request — worth
  keeping in mind given the free tier's very limited CPU allowance.
- Login accepts any valid Redmine account with no additional allowlist/role check — access
  control is entirely delegated to each user's own Redmine permissions. If you need to
  restrict who can use the *app* itself (separate from what they can see in Redmine), that
  would need to be added (e.g. an allowlist of logins/emails).
- No rate limiting or brute-force protection on the login endpoint.

## Suggested next improvements

- Persist sessions/cache (e.g. Redis) so a backend restart doesn't log everyone out or
  force a full re-fetch, and to enable historical trend tracking / daily snapshots.
- Add scheduled background refresh + SLA/overdue alerting.
- Virtualized ticket table for very large single projects.
- Multi-instance / multi-project comparison views.
- Server-side Excel export for very large filtered exports.
- Optional login allowlist (restrict the app to specific Redmine accounts/emails).
