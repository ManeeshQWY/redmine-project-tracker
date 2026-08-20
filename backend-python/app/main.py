import os

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import IS_PRODUCTION, REDMINE_BASE_URL
from .redmine_client import RedmineApiError
from .routers import auth, chat, issues, meta, projects, time_entries

app = FastAPI()

# In dev the frontend runs on a different origin (5173) than the backend (4001), so CORS
# needs an explicit origin + credentials:true for the session cookie to be sent/stored.
# In production the backend serves the built frontend itself (see static block below),
# so requests are same-origin and this CORS config is simply unused.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if IS_PRODUCTION else ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ticket-list responses can be several MB of JSON (e.g. "All Projects"); gzip shrinks
# that dramatically before it goes over the network, at a small CPU cost per request.
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"[http] {request.method} {request.url.path}")
    return await call_next(request)


@app.exception_handler(RedmineApiError)
async def redmine_error_handler(_request: Request, exc: RedmineApiError):
    print(f"[error] RedmineApiError (status={exc.status}): {exc}")
    http_status = exc.status if exc.status is not None and 400 <= exc.status < 600 else 502
    return JSONResponse(status_code=http_status, content={"error": exc.user_message})


@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(_request: Request, exc: FastAPIHTTPException):
    # Match the Node backend's error contract: {"error": "..."} — FastAPI's default is
    # {"detail": "..."}, but the existing frontend only ever reads body.error.
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    print(f"[error] Unhandled error: {exc}")
    return JSONResponse(status_code=500, content={"error": "An unexpected error occurred. Please try again or contact the administrator."})


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(issues.router)
app.include_router(time_entries.router)
app.include_router(meta.router)
app.include_router(chat.router)

# Single-process deployment: serve the built frontend (frontend/npm run build → dist/)
# as static files, with an SPA fallback so client-side routing still works. Lets the
# whole app run as one process on a single free-tier host.
_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
_frontend_dist = os.path.normpath(_frontend_dist)

if os.path.isdir(_frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        candidate = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))


@app.on_event("startup")
async def on_startup():
    print(f"Redmine Tracker backend (Python) listening — proxying Redmine at {REDMINE_BASE_URL}")
    print("Each user authenticates with their own API key (never logged)")
