"""pytest bootstrap: every test module expects a seeded database, so point
the app at a throwaway SQLite file and run the demo seed once per session,
before any test module imports the app. An explicit DATABASE_URL in the
environment is respected (e.g. CI against Postgres)."""

import os
import tempfile

if "DATABASE_URL" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="rdip-tests-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/rdip.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from app import seed_demo  # noqa: E402

seed_demo.main()
