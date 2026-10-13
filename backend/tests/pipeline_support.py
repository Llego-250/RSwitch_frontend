"""Shared helpers for test_integrations and test_pipelines.

Run against a seeded database, e.g.
    DATABASE_URL=sqlite:////tmp/pipelines.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/pipelines-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_integrations && python -m tests.test_pipelines
Every test creates its own uniquely coded participant, so the files can be
re-run against the same database."""

import os
import sys
import tempfile
import time
from typing import Optional
from urllib.parse import urlparse
from uuid import uuid4

if "DATABASE_URL" not in os.environ:  # self-contained fallback
    _tmp = tempfile.mkdtemp(prefix="rdip-pipelines-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/pipelines.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.models.user import User  # noqa: E402

TECHNICAL = "admin@rswitch.rw"
COMPLIANCE = "compliance@rswitch.rw"
BUSINESS = "business@rswitch.rw"

COLUMNS = [("transaction_id", "string", True), ("transaction_date", "date", True), ("amount", "number", True),
           ("channel", "string", False)]

_client: Optional[TestClient] = None
_tokens: dict[str, str] = {}


def client() -> TestClient:
    """One app instance for the whole run. APScheduler's periodic ticks are
    stopped so they can't race assertions; the pipeline worker keeps running."""
    global _client
    if _client is None:
        _client = TestClient(app)
        _client.__enter__()
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None:
            scheduler.shutdown(wait=True)
        with Session(engine) as session:
            for email, name, role in ((COMPLIANCE, "Compliance Officer", UserRole.compliance),
                                      (BUSINESS, "Business Analyst", UserRole.business)):
                if not session.exec(select(User).where(User.email == email)).first():
                    session.add(User(email=email, full_name=name, role=role, hashed_password=hash_password("Rdip-Demo-2026!")))
            session.commit()
    return _client


def h(email: str) -> dict:
    if email not in _tokens:
        _tokens[email] = create_access_token(email)
    return {"Authorization": f"Bearer {_tokens[email]}"}


def new_code() -> str:
    return "T" + uuid4().hex[:7].upper()


def make_participant(**overrides) -> dict:
    body = {
        "name": f"Test Institution {uuid4().hex[:6]}",
        "code": new_code(),
        "type": "Commercial Bank",
        "region": "Kigali City",
        "primary_contact_name": "Test Contact",
        "primary_contact_email": "contact@example.rw",
        "expected_frequency_days": 30,
    }
    body.update(overrides)
    r = client().post("/participants", json=body, headers=h(TECHNICAL))
    assert r.status_code == 201, r.text
    return r.json()


def make_template(participant_id: int, columns=COLUMNS, name: str = "Monthly return") -> dict:
    c = client()
    r = c.post("/templates", json={"participant_id": participant_id, "name": name}, headers=h(TECHNICAL))
    assert r.status_code == 201, r.text
    template = r.json()
    for position, (col, kind, required) in enumerate(columns):
        rule = "Mobile|Web|POS|ATM" if kind == "enum" else ""
        r = c.post(f"/templates/{template['id']}/columns", headers=h(TECHNICAL),
                   json={"template_id": template["id"], "name": col, "type": kind, "required": required, "position": position, "rule": rule})
        assert r.status_code == 201, r.text
    return template


def make_source(participant_id: int, template_id: Optional[int] = None, **overrides) -> dict:
    body = {"participant_id": participant_id, "source_name": f"Source {uuid4().hex[:5]}", "integration_mode": "Manual",
            "template_id": template_id}
    body.update(overrides)
    r = client().post("/integrations", json=body, headers=h(TECHNICAL))
    assert r.status_code == 201, r.text
    return r.json()


def setup_manual(columns=COLUMNS) -> tuple[dict, dict, dict]:
    participant = make_participant()
    template = make_template(participant["id"], columns)
    source = make_source(participant["id"], template["id"])
    return participant, template, source


def csv_bytes(rows: list[str], header: str = "transaction_id,transaction_date,amount,channel") -> bytes:
    return ("\n".join([header] + rows)).encode()


GOOD_ROWS = ["TX1,2026-09-01,1500.50,POS", "TX2,2026-09-02,2500,Mobile", "TX3,2026-09-03,1000,Web"]


def upload(participant_id: int, filename: str, data: bytes, *, email: str = COMPLIANCE, period: str = "2026-09", **form):
    fields = {"participant_id": str(participant_id), "period": period}
    fields.update({k: str(v) for k, v in form.items() if v is not None})
    return client().post("/submissions/upload", data=fields, files={"file": (filename, data, "application/octet-stream")},
                         headers=h(email))


def wait_job(job_id: int, statuses=("Completed", "Failed", "Paused"), timeout: float = 20) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client().get(f"/pipelines/jobs/{job_id}", headers=h(TECHNICAL)).json()
        if job["status"] in statuses:
            return job
        time.sleep(0.1)
    raise AssertionError(f"JOB-{job_id} did not reach {statuses}: {job}")


def http_fetch_via_app():
    """Stand-in for the worker's outbound HTTP call: route it into the app
    (so the DEMO feed answers) with a client of its own."""
    feed_client = TestClient(app)

    def fetch(method, url, headers, body=None):
        parsed = urlparse(url)
        path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        r = feed_client.request(method, path, headers=headers, content=body)
        return r.status_code, r.headers.get("content-type", ""), r.content

    return fetch


def run_module(namespace: dict) -> None:
    failures = 0
    for name, fn in [(n, f) for n, f in sorted(namespace.items()) if n.startswith("test_") and callable(f)]:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            import traceback

            traceback.print_exc()
            print(f"FAIL {name}: {exc!r}")
    print(f"{'FAILED' if failures else 'OK'}: {failures} failure(s)")
    sys.exit(1 if failures else 0)
