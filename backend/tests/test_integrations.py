"""Integrations checks (SRS §5.3 REQ-INTG-001..011, §6.1, §6.4, §8.2, §9.1,
§10.1/§10.2, §11.3, §13, §19.2, §19.4, §20). See tests/pipeline_support.py
for how to run."""

import json
from datetime import datetime, timedelta

from sqlalchemy import create_engine, inspect, text
from sqlmodel import Session, select

from tests.pipeline_support import (
    BUSINESS,
    COMPLIANCE,
    GOOD_ROWS,
    TECHNICAL,
    client,
    csv_bytes,
    h,
    http_fetch_via_app,
    make_participant,
    make_source,
    make_template,
    run_module,
    setup_manual,
    upload,
    wait_job,
)

from app import db as app_db  # noqa: E402
from app.db import engine  # noqa: E402
from app.models.admin import EmailOutbox, Notification  # noqa: E402
from app.models.compliance import ComplianceRequirement  # noqa: E402
from app.models.enums import IntegrationStatus  # noqa: E402
from app.models.integration import Integration  # noqa: E402
from app.models.pipeline import PipelineJob  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers.integrations import demo_feed_key  # noqa: E402
from app.services import pipeline_runner  # noqa: E402
from app.services.scheduler import check_overdue  # noqa: E402

FEED_COLUMNS = [("period_start", "date", True), ("channel_code", "enum", True), ("txn_count", "number", True),
                ("txn_value_rwf", "number", True)]


def _notifications(email: str, event: str, contains: str = "") -> list[Notification]:
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        rows = s.exec(select(Notification).where(Notification.user_id == user.id, Notification.event == event)).all()
        return [n for n in rows if contains in n.title or contains in n.message]


# ---- §11.3 file rules ---------------------------------------------------------

def test_upload_rejects_disallowed_type():
    participant, _, _ = setup_manual()
    r = upload(participant["id"], "return.pdf", b"%PDF-1.4")
    assert r.status_code == 422, r.text
    assert r.json()["detail"][0]["field"] == "file"
    r = upload(participant["id"], "return.xls", b"not really")  # only XLSX among Excel formats
    assert r.status_code == 422
    with Session(engine) as s:
        assert not s.exec(select(Submission).where(Submission.participant_id == participant["id"])).all()


def test_upload_over_50mb_is_413():
    participant, _, _ = setup_manual()
    big = csv_bytes(GOOD_ROWS) + b"\n" + b"x" * (50 * 1024 * 1024)
    r = upload(participant["id"], "big.csv", big)
    assert r.status_code == 413
    assert r.json()["detail"] == "The uploaded file exceeds the 50 MB maximum size."


def test_csv_must_be_utf8():
    participant, _, _ = setup_manual()
    latin1 = "transaction_id,transaction_date,amount,channel\nTX1,2026-09-01,100,Caf\xe9\n".encode("latin-1")
    r = upload(participant["id"], "latin.csv", latin1)
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["message"] == "The file did not pass validation. See the error report below."
    assert detail["errors"][0]["rule"] == "encoding"
    assert detail["submission"]["status"] == "Validation Failed"


def test_xml_upload_is_validated_and_loaded():
    participant, _, _ = setup_manual()
    xml = (b"<?xml version='1.0' encoding='UTF-8'?><return>"
           b"<record><transaction_id>X1</transaction_id><transaction_date>2026-09-01</transaction_date><amount>200</amount><channel>POS</channel></record>"
           b"<record><transaction_id>X2</transaction_id><transaction_date>2026-09-02</transaction_date><amount>300</amount><channel>Web</channel></record>"
           b"</return>")
    r = upload(participant["id"], "return.xml", xml)
    assert r.status_code == 201, r.text
    job = wait_job(r.json()["job"]["id"])
    assert job["status"] == "Completed", job
    sub = client().get(f"/submissions/{r.json()['submission']['id']}", headers=h(COMPLIANCE)).json()
    assert sub["numeric_totals"] == {"amount": 500.0}
    assert sub["breakdowns"]["channel"]["Web"]["count"] == 1


def test_xml_entities_rejected():
    participant, _, _ = setup_manual()
    evil = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x "boom">]><r><record><transaction_id>&x;</transaction_id></record></r>'
    r = upload(participant["id"], "evil.xml", evil)
    assert r.status_code == 422
    assert r.json()["detail"]["errors"][0]["column"] == "file"


# ---- §6.1 / §6.4 / REQ-INTG-008 -------------------------------------------------

def test_failed_validation_loads_nothing_and_notifies_compliance():
    participant, _, source = setup_manual()
    bad = csv_bytes(["TX1,2026-09-01,1500,POS", "TX2,2026-09-02,not-a-number,POS", ",2026-09-03,10,POS"])
    r = upload(participant["id"], "bad.csv", bad, email=TECHNICAL)
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    rows = {(e["row"], e["column"]) for e in detail["errors"]}
    assert (2, "amount") in rows and (3, "transaction_id") in rows
    assert all({"row", "column", "description"} <= set(e) for e in detail["errors"])
    assert "not-a-number" not in json.dumps(detail["errors"])  # never quotes cell values
    sub_id = detail["submission"]["id"]
    with Session(engine) as s:
        sub = s.get(Submission, sub_id)
        assert sub.status == "Validation Failed" and sub.row_count == 0 and sub.numeric_totals == {} and sub.loaded_at is None
        assert s.exec(select(PipelineJob).where(PipelineJob.submission_id == sub_id)).first() is None  # never queued
        integration = s.get(Integration, source["id"])
        assert integration.status == IntegrationStatus.failed
        assert integration.last_sync_errors == 2 and integration.last_sync_records == 3
    assert _notifications(COMPLIANCE, "submission_validation_failed", f"SUB-{sub_id}")
    # The Technical team hears the integration failed (REQ-INTG-010).
    assert _notifications(TECHNICAL, "integration_failed", participant["name"])


def test_resubmission_chain_keeps_failed_attempt():
    participant, _, source = setup_manual()
    r1 = upload(participant["id"], "v1.csv", csv_bytes(["TX1,2026-09-01,abc,POS"]), period="2026-08")
    assert r1.status_code == 422
    failed_id = r1.json()["detail"]["submission"]["id"]
    r2 = upload(participant["id"], "v2.csv", csv_bytes(GOOD_ROWS), period="2026-08")
    assert r2.status_code == 201, r2.text
    corrected = r2.json()["submission"]
    assert corrected["replaces_submission_id"] == failed_id and corrected["status"] == "Submitted"
    history = client().get(f"/participants/{participant['id']}/submissions", headers=h(BUSINESS)).json()
    by_id = {s["id"]: s for s in history}
    assert by_id[failed_id]["status"] == "Validation Failed" and by_id[failed_id]["replaced_by_id"] == corrected["id"]
    assert by_id[corrected["id"]]["records_received"] == 3
    job = wait_job(r2.json()["job"]["id"])
    assert job["status"] == "Completed"
    out = client().get(f"/integrations/{source['id']}", headers=h(BUSINESS)).json()
    assert out["status"] == "Healthy" and out["last_success_at"]
    assert out["last_submission"]["records_received"] == 3 and out["last_submission"]["error_count"] == 0
    # Explicitly correcting a submission that passed is refused.
    r3 = upload(participant["id"], "v3.csv", csv_bytes(GOOD_ROWS), period="2026-08", replaces_submission_id=corrected["id"])
    assert r3.status_code == 422


def test_upload_validates_against_requirement_template():
    participant, template, source = setup_manual()
    other = make_template(participant["id"], [("reference", "string", True), ("value", "number", True)], name="Liquidity return")
    with Session(engine) as s:
        req = ComplianceRequirement(participant_id=participant["id"], requirement_name="Liquidity return",
                                    kind="Data Return", template_id=other["id"], due_date=datetime.utcnow().date())
        s.add(req)
        s.commit()
        s.refresh(req)
        req_id = req.id
    options = client().get(f"/submissions/requirements?participant_id={participant['id']}", headers=h(COMPLIANCE)).json()
    assert [o["id"] for o in options] == [req_id]
    # The monthly-return file doesn't match the requirement's schema.
    r = upload(participant["id"], "x.csv", csv_bytes(GOOD_ROWS), requirement_id=req_id)
    assert r.status_code == 422 and r.json()["detail"]["errors"][0]["rule"] == "required_column"
    r = upload(participant["id"], "x.csv", b"reference,value\nA,1\nB,2", requirement_id=req_id)
    assert r.status_code == 201, r.text
    assert r.json()["submission"]["requirement_id"] == req_id
    assert client().get(f"/submissions/requirements?participant_id={participant['id']}", headers=h(BUSINESS)).status_code == 403


def test_upload_only_to_manual_sources():
    participant = make_participant()
    template = make_template(participant["id"])
    make_source(participant["id"], template["id"], integration_mode="Automated API",
                endpoint_url="https://api.example.rw/feed", auth_type="API Key", credentials={"api_key": "k-123456"})
    r = upload(participant["id"], "a.csv", csv_bytes(GOOD_ROWS))
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "integration_id"


# ---- REQ-INTG-005 configuration, encryption, permissions ------------------------

def test_credentials_encrypted_and_never_returned():
    participant = make_participant()
    secret, url = "sk-live-SECRET-9f8e7d", "https://core.bank.example/rdip/summary"
    source = make_source(participant["id"], integration_mode="Automated API", endpoint_url=url,
                         auth_type="API Key", credentials={"api_key": secret}, schedule_cron="0 2 * * *")
    assert source["status"] == "Pending" and source["configured"]
    assert source["credentials_masked"]["api_key"].endswith(secret[-4:]) and secret not in json.dumps(source)
    assert url not in json.dumps(source) and source["endpoint_url_masked"]
    listing = client().get(f"/integrations?participant_id={participant['id']}", headers=h(BUSINESS)).text
    assert secret not in listing and url not in listing
    with Session(engine) as s:
        row = s.get(Integration, source["id"])
        assert secret not in row.credentials_encrypted and url not in row.endpoint_url_encrypted
        assert pipeline_runner.credentials(row) == {"api_key": secret}
    # The API-mode schedule became a scheduled pipeline (REQ-INTG-002b).
    configs = client().get("/pipelines/configs", headers=h(BUSINESS)).json()
    assert any(c["integration_id"] == source["id"] and c["schedule_cron"] == "0 2 * * *" and c["next_run_at"] for c in configs)
    # Updating other fields keeps the stored credentials.
    r = client().put(f"/integrations/{source['id']}", json={"source_name": "Core Banking"}, headers=h(TECHNICAL))
    assert r.status_code == 200 and r.json()["configured"] and r.json()["source_name"] == "Core Banking"


def test_integration_validation_and_not_configured():
    participant = make_participant()
    r = client().post("/integrations", headers=h(TECHNICAL), json={
        "participant_id": participant["id"], "source_name": "Feed", "integration_mode": "Automated API",
        "endpoint_url": "ftp://nope", "auth_type": "OAuth 2.0", "credentials": {"client_id": "x"}, "schedule_cron": "61 * * * *"})
    assert r.status_code == 422
    fields = {p["field"] for p in r.json()["detail"]}
    assert {"endpoint_url", "credentials", "schedule_cron"} <= fields
    r = client().post("/integrations", headers=h(TECHNICAL), json={
        "participant_id": participant["id"], "source_name": "Mobile Money", "integration_mode": "Automated API"})
    assert r.status_code == 201 and r.json()["status"] == "Not Configured"
    # A participant may have several data sources (REQ-INTG-001, §10.2).
    make_source(participant["id"], source_name="Core Banking")
    assert len(client().get(f"/integrations?participant_id={participant['id']}", headers=h(TECHNICAL)).json()) == 2
    dup = client().post("/integrations", headers=h(TECHNICAL), json={"participant_id": participant["id"], "source_name": "Core Banking"})
    assert dup.status_code == 422


def test_manage_endpoints_forbidden_for_business_and_compliance():
    participant, template, source = setup_manual()
    c = client()
    for email in (BUSINESS, COMPLIANCE):
        assert c.post("/integrations", json={"participant_id": participant["id"], "source_name": "X"}, headers=h(email)).status_code == 403
        assert c.put(f"/integrations/{source['id']}", json={"paused": True}, headers=h(email)).status_code == 403
        assert c.post(f"/integrations/{source['id']}/sync", headers=h(email)).status_code == 403
        assert c.post("/participants", json={"name": "X"}, headers=h(email)).status_code == 403
        assert c.put(f"/participants/{participant['id']}", json={"name": "X"}, headers=h(email)).status_code == 403
        r = c.post("/templates", json={"participant_id": participant["id"], "name": "X"}, headers=h(email))
        assert r.status_code == 403
        assert r.json()["detail"] == "You do not have permission to perform this action."
    assert upload(participant["id"], "a.csv", csv_bytes(GOOD_ROWS), email=BUSINESS).status_code == 403
    assert c.get("/integrations", headers=h(BUSINESS)).status_code == 200


def test_participant_create_update_rules():
    c = client()
    bad = c.post("/participants", headers=h(TECHNICAL), json={
        "name": "", "code": "BAD CODE!", "type": "Bank", "region": "Mars", "primary_contact_name": "", "primary_contact_email": "nope"})
    assert bad.status_code == 422
    assert {"name", "code", "type", "region", "primary_contact_name", "primary_contact_email"} <= {p["field"] for p in bad.json()["detail"]}
    p = make_participant(type="SACCO", region="Northern Province", registration_date="2025-01-15", short_name="TS")
    assert p["status"] == "Active" and p["is_active"] and p["registration_date"] == "2025-01-15" and p["country"] == "Rwanda"
    dup = c.post("/participants", headers=h(TECHNICAL), json={
        "name": "Dup", "code": p["code"], "type": "MFI", "primary_contact_name": "A", "primary_contact_email": "a@b.rw"})
    assert dup.status_code == 409
    r = c.put(f"/participants/{p['id']}", json={"status": "Suspended", "expected_frequency_days": 7}, headers=h(TECHNICAL))
    assert r.status_code == 200 and r.json()["status"] == "Suspended" and not r.json()["is_active"]
    assert c.put(f"/participants/{p['id']}", json={"type": "Bank"}, headers=h(TECHNICAL)).status_code == 422
    listed = c.get("/participants?status=Suspended", headers=h(BUSINESS)).json()
    assert p["id"] in [x["id"] for x in listed]


# ---- REQ-INTG-006 sync, REQ-INTG-010 failure + overdue notifications -----------

def _automated(right_key: bool) -> tuple[dict, dict]:
    """An Automated API source pointed at the DEMO feed for a new participant."""
    participant = make_participant(type="E-money Issuer")
    template = make_template(participant["id"], FEED_COLUMNS, name="Hourly summary")
    source = make_source(participant["id"], template["id"], integration_mode="Automated API",
                         endpoint_url=f"http://testserver/integrations/demo-feed/{participant['code']}", auth_type="API Key",
                         credentials={"api_key": demo_feed_key(participant["code"]) if right_key else "wrong-key-000"})
    return participant, source


def test_sync_now_pulls_demo_feed():
    original = pipeline_runner.fetch
    pipeline_runner.fetch = http_fetch_via_app()
    try:
        participant, source = _automated(right_key=True)
        c = client()
        r = c.post(f"/integrations/{source['id']}/sync", headers=h(TECHNICAL))
        assert r.status_code == 202, r.text
        assert c.post(f"/integrations/{source['id']}/sync", headers=h(TECHNICAL)).status_code in (202, 409)
        job = wait_job(r.json()["id"])
        assert job["status"] == "Completed", job
        assert job["records_processed"] == 96  # 24 hours x 4 channels
        out = c.get(f"/integrations/{source['id']}", headers=h(BUSINESS)).json()
        assert out["status"] == "Healthy" and out["last_success_at"] and out["last_sync_records"] == 96
        subs = c.get(f"/integrations/{source['id']}/submissions", headers=h(BUSINESS)).json()
        assert subs[0]["uploaded_by"] == "Automated API sync" and subs[0]["status"] == "Submitted"
    finally:
        pipeline_runner.fetch = original


def test_sync_failure_marks_failed_and_notifies_technical():
    original = pipeline_runner.fetch
    pipeline_runner.fetch = http_fetch_via_app()
    try:
        participant, source = _automated(right_key=False)
        c = client()
        r = c.post(f"/integrations/{source['id']}/sync", headers=h(TECHNICAL))
        job = wait_job(r.json()["id"])
        assert job["status"] == "Failed" and "HTTP 401" in job["summary"]
        logs = c.get(f"/pipelines/jobs/{job['id']}/logs", headers=h(BUSINESS)).json()
        assert any(line["level"] == "ERROR" and "401" in line["message"] for line in logs)
        assert c.get(f"/integrations/{source['id']}", headers=h(BUSINESS)).json()["status"] == "Failed"
        assert _notifications(TECHNICAL, "pipeline_failed", f"JOB-{job['id']}")
        assert _notifications(TECHNICAL, "integration_failed", participant["name"])
        assert not _notifications(BUSINESS, "pipeline_failed", f"JOB-{job['id']}")
        with Session(engine) as s:
            assert s.exec(select(EmailOutbox).where(EmailOutbox.event == "pipeline_failed",
                                                    EmailOutbox.dedupe_key == f"pipeline_failed:{job['id']}")).first()
        # Manual sources can't be synced.
        manual = make_source(participant["id"], source_name="Monthly return")
        assert c.post(f"/integrations/{manual['id']}/sync", headers=h(TECHNICAL)).status_code == 422
    finally:
        pipeline_runner.fetch = original


def test_overdue_check_warns_then_fails_and_notifies_once():
    late, _, late_source = setup_manual()
    grace, _, grace_source = setup_manual()
    now = datetime.utcnow()
    with Session(engine) as s:
        for source_id, last in ((late_source["id"], now - timedelta(days=40)), (grace_source["id"], now - timedelta(days=31, hours=12))):
            row = s.get(Integration, source_id)
            row.status, row.last_submission_at, row.last_sync_at = IntegrationStatus.healthy, last, last
            s.add(row)
        s.commit()
        check_overdue(s)
        check_overdue(s)  # idempotent
        assert s.get(Integration, late_source["id"]).status == IntegrationStatus.failed
        warned = s.get(Integration, grace_source["id"])
        assert warned.status == IntegrationStatus.warning and warned.warnings[0]["rule"] == "overdue_within_grace"
    assert len(_notifications(TECHNICAL, "integration_failed", f"Submission overdue — {late['name']}")) == 1
    assert not _notifications(TECHNICAL, "integration_failed", f"Submission overdue — {grace['name']}")


def test_pause_and_resume_source():
    participant, _, source = setup_manual()
    c = client()
    r = c.put(f"/integrations/{source['id']}", json={"paused": True}, headers=h(TECHNICAL))
    assert r.json()["status"] == "Paused"
    assert upload(participant["id"], "a.csv", csv_bytes(GOOD_ROWS)).status_code == 422
    r = c.put(f"/integrations/{source['id']}", json={"paused": False}, headers=h(TECHNICAL))
    assert r.json()["status"] == "Pending"


# ---- status migration (db._upgrade_integrations) --------------------------------

def test_status_migration_of_old_rows():
    import tempfile

    path = f"{tempfile.mkdtemp(prefix='rdip-migrate-')}/old.db"
    old = create_engine(f"sqlite:///{path}")
    with old.begin() as conn:
        conn.execute(text("CREATE TABLE integration (id INTEGER PRIMARY KEY, participant_id INTEGER, status VARCHAR(12), "
                          "last_submission_at DATETIME)"))
        conn.execute(text("CREATE UNIQUE INDEX ix_integration_participant_id ON integration (participant_id)"))
        conn.execute(text("INSERT INTO integration VALUES (1, 1, 'connected', '2026-09-01 00:00:00'), (2, 2, 'connected', NULL), "
                          "(3, 3, 'degraded', NULL), (4, 4, 'disconnected', NULL), (5, 5, 'maintenance', NULL)"))
    real = app_db.engine
    app_db.engine = old
    try:
        app_db._upgrade_integrations()
        app_db._upgrade_integrations()  # idempotent
    finally:
        app_db.engine = real
    with old.connect() as conn:
        statuses = dict(conn.execute(text("SELECT id, status FROM integration")).all())
        conn.execute(text("INSERT INTO integration VALUES (6, 1, 'pending', NULL)"))  # several sources per participant
    assert statuses == {1: "healthy", 2: "pending", 3: "warning", 4: "failed", 5: "paused"}
    index = next(i for i in inspect(old).get_indexes("integration") if i["name"] == "ix_integration_participant_id")
    assert not index["unique"]


if __name__ == "__main__":
    run_module(globals())
