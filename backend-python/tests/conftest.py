import os

# config.py requires env vars at import time; set them before any test imports app code.
os.environ.setdefault("REDMINE_BASE_URL", "https://redmine.test")
