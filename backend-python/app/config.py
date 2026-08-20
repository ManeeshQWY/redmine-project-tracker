import os
from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


REDMINE_BASE_URL = _required("REDMINE_BASE_URL").rstrip("/")
PORT = int(os.environ.get("PORT", "4001"))
IS_PRODUCTION = os.environ.get("ENVIRONMENT") == "production"

# Optional — only the chat feature needs this. Its absence doesn't stop the app from
# starting; the chat endpoint just returns a "not configured" error until it's set.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

SESSION_COOKIE_NAME = "rtt_sid"
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12 hours, matches the Node backend
