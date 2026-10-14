"""Pipeline Monitor and Standards & Mapping checks (SRS §5.4 REQ-PIPE-001..010,
§5.5 REQ-MAP-001..009, §9.1, §17.3, §17.6.3/4, §19.4). See
tests/pipeline_support.py for how to run."""

import threading
from datetime import datetime, timedelta

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

from app.db import engine  # noqa: E402
from app.models.admin import Notification  # noqa: E402
from app.models.pipeline import PipelineConfig, PipelineJob, PipelineLog  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers.integrations import demo_feed_key  # noqa: E402
from app.services import pipeline_jobs, pipeline_runner  # noqa: E402
from app.services.settings_store import put_setting  # noqa: E402

FEED_COLUMNS = [("period_start", "date", True), ("channel_code", "enum", True), ("txn_count", "number", True),
                ("txn_value_rwf", "number", True)]
SOURCE_COLUMNS = [("ref", "string", True), ("amt", "number", True), ("chan", "string", False)]


class BlockingFetch:
    """Holds the worker inside a pull until released, so a job can be seen
    Running (and stopped) deterministically."""

    def __init__(self):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.inner = http_fetch_via_app()

    def __call__(self, method, url, headers, body=None):
        self.entered.set()
        self.release.wait(30)
        return self.inner(method, url, headers, body)


def _automated_source() -> tuple[dict, dict]:
    participant = make_participant(type="E-money Issuer")
    template = make_template(participant["id"], FEED_COLUMNS, name="Hourly summary")
    source = make_source(participant["id"], template["id"], integration_mode="Automated API",
                         endpoint_url=f"http://testserver/integrations/demo-feed/{participant['code']}",
                         auth_type="API Key", credentials={"api_key": demo_feed_key(participant["code"])})
    return participant, source


def _get(path: str, email: str = TECHNICAL):
    r = client().get(path, headers=h(email))
    assert r.status_code == 200, r.text
    return r.json()


# ---- job lifecycle (REQ-PIPE-001..004, §17.3) ----------------------------------

def test_job_lifecycle_queued_running_completed():
    original = pipeline_runner.fetch
    blocker = BlockingFetch()
    pipeline_runner.fetch = blocker
    try:
        _, feed = _automated_source()
        busy = client().post(f"/integrations/{feed['id']}/sync", headers=h(TECHNICAL)).json()
        assert blocker.entered.wait(15), "worker never picked the job up"
        assert _get(f"/pipelines/jobs/{busy['id']}")["status"] == "Running"
        # The worker is busy, so the next job waits in the queue.
        participant, _, source = setup_manual()
        r = upload(participant["id"], "ok.csv", csv_bytes(GOOD_ROWS))
        assert r.status_code == 201, r.text
        job_id = r.json()["job"]["id"]
        assert _get(f"/pipelines/jobs/{job_id}")["status"] == "Queued"
        assert _get(f"/integrations/{source['id']}")["status"] == "Queued"
        blocker.release.set()
        job = wait_job(job_id)
    finally:
        blocker.release.set()
        pipeline_runner.fetch = original
    assert job["status"] == "Completed" and job["progress"] == 100
    assert job["records_processed"] == 3 and job["error_count"] == 0 and job["started_at"] and job["duration_seconds"] is not None
    assert job["participant_name"] == participant["name"] and job["name"].startswith(participant["code"])
    logs = _get(f"/pipelines/jobs/{job_id}/logs", BUSINESS)
    steps = [line["step"] for line in logs]
    for step in ("Queue", "Extract", "Validate", "Transform", "Load"):
        assert step in steps, steps
    assert steps.index("Extract") < steps.index("Validate") < steps.index("Transform") < steps.index("Load")
    assert _get(f"/integrations/{source['id']}")["status"] == "Healthy"
    assert wait_job(busy["id"])["status"] == "Completed"


def test_monitor_shows_no_row_values():
    """REQ-PIPE-010: aggregate counts and metadata only."""
    participant, _, _ = setup_manual()
    rows = ["SECRETTX991,2026-09-01,98765.43,POS", "SECRETTX992,2026-09-02,12345.67,Web"]
    r = upload(participant["id"], "ok.csv", csv_bytes(rows))
    job = wait_job(r.json()["job"]["id"])
    bad = upload(participant["id"], "bad.csv", csv_bytes(["SECRETTX993,2026-09-01,abc,POS"]), period="2026-07")
    assert bad.status_code == 422
    text = client().get(f"/pipelines/jobs?participant_id={participant['id']}", headers=h(BUSINESS)).text
    text += client().get(f"/pipelines/jobs/{job['id']}/logs", headers=h(BUSINESS)).text
    for value in ("SECRETTX99", "98765", "12345.67", "abc"):
        assert value not in text, value


def test_failed_job_alerts_then_reprocess_after_publishing():
    participant = make_participant()
    template = make_template(participant["id"], SOURCE_COLUMNS, name="Bank extract")
    c = client()
    m = c.post("/integrations/mappings", headers=h(TECHNICAL), json={
        "name": "Bank extract → JSON", "source_system": "Core", "target_standard": "JSON Canonical", "source_template_id": template["id"]}).json()
    source = make_source(participant["id"], template["id"], mapping_id=m["id"])
    r = upload(participant["id"], "x.csv", b"ref,amt,chan\nA,10,POS\nB,20,Web")
    assert r.status_code == 201, r.text
    failed = wait_job(r.json()["job"]["id"])
    assert failed["status"] == "Failed" and "no published version" in failed["summary"]
    assert _get(f"/integrations/{source['id']}")["status"] == "Failed"
    with Session(engine) as s:
        tech = s.exec(select(User).where(User.email == TECHNICAL)).first()
        assert s.exec(select(Notification).where(Notification.user_id == tech.id,
                                                 Notification.dedupe_key == f"pipeline_failed:{failed['id']}")).first()
    # Fix the cause, then reprocess (REQ-PIPE-005).
    rules = [{"source_field": "ref", "target_field": "transaction_id"}, {"source_field": "amt", "target_field": "amount", "transform": "number"},
             {"source_field": "chan", "target_field": "channel", "transform": "trim"}]
    assert c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": rules}, headers=h(TECHNICAL)).status_code == 200
    assert c.post(f"/integrations/mappings/{m['id']}/publish", json={}, headers=h(TECHNICAL)).status_code == 200
    redo = c.post(f"/pipelines/jobs/{failed['id']}/reprocess", headers=h(TECHNICAL))
    assert redo.status_code == 202, redo.text
    done = wait_job(redo.json()["id"])
    assert done["status"] == "Completed" and done["reprocess_of_id"] == failed["id"] and done["mapping_label"] == f"{m['code']} v1.0"
    assert _get(f"/pipelines/jobs/{failed['id']}")["status"] == "Failed"  # history kept
    sub = _get(f"/submissions/{r.json()['submission']['id']}")
    assert sub["numeric_totals"] == {"amount": 30.0} and set(sub["breakdowns"]["channel"]) == {"POS", "Web"}
    assert c.post(f"/pipelines/jobs/{done['id']}/reprocess", headers=h(TECHNICAL)).status_code == 409


def test_stop_running_job_pauses_and_can_be_reprocessed():
    original = pipeline_runner.fetch
    blocker = BlockingFetch()
    pipeline_runner.fetch = blocker
    try:
        _, source = _automated_source()
        job = client().post(f"/integrations/{source['id']}/sync", headers=h(TECHNICAL)).json()
        assert blocker.entered.wait(15)
        r = client().post(f"/pipelines/jobs/{job['id']}/stop", headers=h(TECHNICAL))
        assert r.status_code == 200 and r.json()["stop_requested"]
        blocker.release.set()
        stopped = wait_job(job["id"])
    finally:
        blocker.release.set()
        pipeline_runner.fetch = original
    assert stopped["status"] == "Paused" and "Stopped by" in stopped["summary"]
    assert _get(f"/integrations/{source['id']}")["status"] == "Paused"
    assert any("Stop requested" in line["message"] for line in _get(f"/pipelines/jobs/{job['id']}/logs"))
    assert client().post(f"/pipelines/jobs/{job['id']}/stop", headers=h(TECHNICAL)).status_code == 409
    pipeline_runner.fetch = http_fetch_via_app()
    try:
        again = client().post(f"/pipelines/jobs/{job['id']}/reprocess", headers=h(TECHNICAL)).json()
        assert wait_job(again["id"])["status"] == "Completed"
    finally:
        pipeline_runner.fetch = original


def test_stop_queued_job_is_paused_at_once():
    original = pipeline_runner.fetch
    blocker = BlockingFetch()
    pipeline_runner.fetch = blocker
    try:
        _, feed = _automated_source()
        busy = client().post(f"/integrations/{feed['id']}/sync", headers=h(TECHNICAL)).json()
        assert blocker.entered.wait(15)
        participant, _, _ = setup_manual()
        queued = upload(participant["id"], "ok.csv", csv_bytes(GOOD_ROWS)).json()["job"]
        r = client().post(f"/pipelines/jobs/{queued['id']}/stop", headers=h(TECHNICAL))
        assert r.status_code == 200 and r.json()["status"] == "Paused"
    finally:
        blocker.release.set()
        pipeline_runner.fetch = original
    wait_job(busy["id"])
    assert _get(f"/pipelines/jobs/{queued['id']}")["status"] == "Paused"  # never picked up


def test_job_filters_are_server_side():
    participant, _, _ = setup_manual()
    ok = upload(participant["id"], "ok.csv", csv_bytes(GOOD_ROWS)).json()["job"]
    wait_job(ok["id"])
    other, _, _ = setup_manual()
    wait_job(upload(other["id"], "ok.csv", csv_bytes(GOOD_ROWS)).json()["job"]["id"])
    mine = _get(f"/pipelines/jobs?participant_id={participant['id']}", BUSINESS)
    assert [j["id"] for j in mine] == [ok["id"]]
    assert _get(f"/pipelines/jobs?participant_id={participant['id']}&status=Failed") == []
    assert all(j["status"] == "Completed" for j in _get("/pipelines/jobs?status=Completed"))
    assert client().get("/pipelines/jobs?status=Done", headers=h(TECHNICAL)).status_code == 422
    summary = _get("/pipelines/summary", COMPLIANCE)
    assert set(summary["by_status"]) == {"Running", "Completed", "Failed", "Queued", "Paused"}


# ---- configurations & scheduler (REQ-PIPE-008, §17.6.3) ------------------------

def test_cron_validation_and_due_config_enqueued_once():
    c = client()
    _, feed = _automated_source()
    _, _, manual = setup_manual()
    bad = c.post("/pipelines/configs", headers=h(TECHNICAL), json={"name": "x", "integration_id": feed["id"], "schedule_cron": "0 25 * * *"})
    assert bad.status_code == 422 and bad.json()["detail"][0]["field"] == "schedule_cron"
    assert c.post("/pipelines/configs", headers=h(TECHNICAL),
                  json={"name": "x", "integration_id": manual["id"], "schedule_cron": "0 2 * * *"}).status_code == 422
    preview = _get("/pipelines/cron-preview?expr=*/15+*+*+*+*", BUSINESS)
    assert preview["valid"] and len(preview["next_runs"]) == 3
    assert not _get("/pipelines/cron-preview?expr=nonsense")["valid"]
    r = c.post("/pipelines/configs", headers=h(TECHNICAL), json={"name": "Nightly pull", "integration_id": feed["id"], "schedule_cron": "30 1 * * *"})
    assert r.status_code == 201, r.text
    config = r.json()
    assert datetime.fromisoformat(config["next_run_at"]) > datetime.utcnow()
    original = pipeline_runner.fetch
    pipeline_runner.fetch = http_fetch_via_app()
    try:
        with Session(engine) as s:
            row = s.get(PipelineConfig, config["id"])
            row.next_run_at = datetime.utcnow() - timedelta(minutes=5)
            s.add(row)
            s.commit()
            pipeline_jobs.enqueue_due(s)
            pipeline_jobs.enqueue_due(s)  # the next tick: not due any more
            jobs = s.exec(select(PipelineJob).where(PipelineJob.config_id == config["id"])).all()
            assert len(jobs) == 1 and jobs[0].trigger == "Schedule"
            assert s.get(PipelineConfig, config["id"]).next_run_at > datetime.utcnow()
        assert wait_job(jobs[0].id)["status"] == "Completed"
    finally:
        pipeline_runner.fetch = original
    updated = c.put(f"/pipelines/configs/{config['id']}", json={"active": False}, headers=h(TECHNICAL)).json()
    assert updated["active"] is False and updated["next_run_at"] is None


def test_retention_purge_keeps_last_90_days():
    participant, _, _ = setup_manual()
    now = datetime.utcnow()
    with Session(engine) as s:
        ids = {}
        for label, days in (("old", 100), ("recent", 30)):
            job = PipelineJob(name=f"retention {label}", participant_id=participant["id"], status="Completed",
                              queued_at=now - timedelta(days=days), started_at=now - timedelta(days=days),
                              finished_at=now - timedelta(days=days))
            s.add(job)
            s.commit()
            s.refresh(job)
            s.add(PipelineLog(job_id=job.id, at=now - timedelta(days=days), step="Load", message="Completed"))
            ids[label] = job.id
        s.commit()
        put_setting(s, "pipelines", {"log_retention_days": 30})  # stored below the floor (bypassing the API)…
        assert pipeline_jobs.retention_days(s) == 90  # …still never less than 90 days
        put_setting(s, "pipelines", {"log_retention_days": 90})
        pipeline_jobs.purge_old_logs(s)
        assert s.get(PipelineJob, ids["old"]) is None
        assert s.get(PipelineJob, ids["recent"]) is not None
        assert s.exec(select(PipelineLog).where(PipelineLog.job_id == ids["recent"])).first() is not None
    c = client()
    assert c.put("/pipelines/settings", json={"log_retention_days": 60}, headers=h(TECHNICAL)).status_code == 422
    assert c.put("/pipelines/settings", json={"log_retention_days": 120}, headers=h(BUSINESS)).status_code == 403
    r = c.put("/pipelines/settings", json={"log_retention_days": 120}, headers=h(TECHNICAL))
    assert r.status_code == 200 and r.json()["log_retention_days"] == 120
    assert c.put("/pipelines/settings", json={"log_retention_days": 90}, headers=h(TECHNICAL)).status_code == 200


def test_pipeline_manage_forbidden_for_business_and_compliance():
    c = client()
    job_id = _get("/pipelines/jobs?limit=1")[0]["id"]
    for email in (BUSINESS, COMPLIANCE):
        assert c.post(f"/pipelines/jobs/{job_id}/stop", headers=h(email)).status_code == 403
        assert c.post(f"/pipelines/jobs/{job_id}/reprocess", headers=h(email)).status_code == 403
        assert c.post("/pipelines/configs", json={"name": "x", "integration_id": 1, "schedule_cron": "0 2 * * *"},
                      headers=h(email)).status_code == 403
        assert c.get("/pipelines/jobs", headers=h(email)).status_code == 200


# ---- Standards & Mapping (REQ-MAP-001..009) ------------------------------------

def _mapping(template_id: int, standard: str = "JSON Canonical") -> dict:
    r = client().post("/integrations/mappings", headers=h(TECHNICAL), json={
        "name": "Test mapping", "source_system": "Test core", "target_standard": standard, "source_template_id": template_id})
    assert r.status_code == 201, r.text
    return r.json()


FULL_RULES = [{"source_field": "ref", "target_field": "transaction_id"},
              {"source_field": "amt", "target_field": "amount", "transform": "number"},
              {"source_field": "chan", "target_field": "channel"}]


def test_mapping_publish_is_versioned_and_immutable():
    participant = make_participant()
    template = make_template(participant["id"], SOURCE_COLUMNS)
    m = _mapping(template["id"])
    assert m["status"] == "Draft" and m["code"].startswith("MAP-") and m["total_count"] == 3 and m["mapped_count"] == 0
    assert [r["source_field"] for r in m["draft"]["rules"]] == ["ref", "amt", "chan"]
    c = client()
    c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": FULL_RULES}, headers=h(TECHNICAL))
    v1 = c.post(f"/integrations/mappings/{m['id']}/publish", json={"notes": "first"}, headers=h(TECHNICAL)).json()
    assert v1["version"] == "v1.0" and v1["status"] == "Healthy" and v1["draft"] is None
    v1_id = v1["active_version"]["id"]
    changed = [dict(r) for r in FULL_RULES]
    changed[2]["target_field"] = "region"
    after = c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": changed}, headers=h(TECHNICAL)).json()
    assert after["version"] == "v1.0" and after["has_draft"]  # the edit went to a new draft
    frozen = _get(f"/integrations/mappings/{m['id']}/versions/{v1_id}")
    assert {r["source_field"]: r["target_field"] for r in frozen["rules"]}["chan"] == "channel"
    v2 = c.post(f"/integrations/mappings/{m['id']}/publish", json={}, headers=h(TECHNICAL)).json()
    assert v2["version"] == "v2.0"
    history = _get(f"/integrations/mappings/{m['id']}/versions")
    assert [v["label"] for v in history] == ["v2.0", "v1.0"]
    assert all(v["published_by"] == "RDIP Admin" and v["published_at"] for v in history)
    assert c.post(f"/integrations/mappings/{m['id']}/publish", json={}, headers=h(TECHNICAL)).status_code == 422  # no draft
    bad = c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": [{"source_field": "ref", "target_field": "NotAField"}]},
                headers=h(TECHNICAL))
    assert bad.status_code == 422 and bad.json()["detail"][0]["field"] == "rules.0.target_field"


def test_unmapped_fields_need_confirmation_before_publishing():
    participant = make_participant()
    template = make_template(participant["id"], SOURCE_COLUMNS)
    m = _mapping(template["id"])
    c = client()
    partial = [FULL_RULES[0], FULL_RULES[1], {"source_field": "chan", "target_field": ""}]
    c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": partial}, headers=h(TECHNICAL))
    r = c.post(f"/integrations/mappings/{m['id']}/publish", json={}, headers=h(TECHNICAL))
    assert r.status_code == 422
    problem = r.json()["detail"][0]
    assert problem["field"] == "confirm_unmapped" and problem["unmapped"] == ["chan"]
    assert _get(f"/integrations/mappings/{m['id']}")["status"] == "Draft"
    r = c.post(f"/integrations/mappings/{m['id']}/publish", json={"confirm_unmapped": True}, headers=h(TECHNICAL))
    assert r.status_code == 200
    assert r.json()["status"] == "Warning" and r.json()["mapped_count"] == 2 and r.json()["total_count"] == 3


def test_clone_creates_independent_draft():
    participant = make_participant()
    template = make_template(participant["id"], SOURCE_COLUMNS)
    m = _mapping(template["id"], "ISO 20022")
    c = client()
    iso = [{"source_field": "ref", "target_field": "CdtTrfTxInf.PmtId.TxId"},
           {"source_field": "amt", "target_field": "CdtTrfTxInf.IntrBkSttlmAmt"}, {"source_field": "chan", "target_field": ""}]
    c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": iso}, headers=h(TECHNICAL))
    c.post(f"/integrations/mappings/{m['id']}/publish", json={"confirm_unmapped": True}, headers=h(TECHNICAL))
    r = c.post(f"/integrations/mappings/{m['id']}/clone", json={"name": "Copy for another bank"}, headers=h(TECHNICAL))
    assert r.status_code == 201
    copy = r.json()
    assert copy["code"] != m["code"] and copy["status"] == "Draft" and copy["cloned_from_id"] == m["id"]
    assert copy["target_standard"] == "ISO 20022" and copy["version"] is None
    assert [(x["source_field"], x["target_field"]) for x in copy["draft"]["rules"]] == [(x["source_field"], x["target_field"]) for x in iso]
    c.put(f"/integrations/mappings/{copy['id']}/draft", json={"rules": FULL_RULES[:1]}, headers=h(TECHNICAL))
    original = _get(f"/integrations/mappings/{m['id']}")
    assert original["total_count"] == 3 and original["version"] == "v1.0"


def test_pipeline_applies_active_published_version_not_draft():
    participant = make_participant()
    template = make_template(participant["id"], SOURCE_COLUMNS)
    m = _mapping(template["id"])
    c = client()
    c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": FULL_RULES}, headers=h(TECHNICAL))
    c.post(f"/integrations/mappings/{m['id']}/publish", json={}, headers=h(TECHNICAL))
    # An unpublished edit that would drop the amount must not be used.
    draft = [FULL_RULES[0], {"source_field": "amt", "target_field": ""}, FULL_RULES[2]]
    c.put(f"/integrations/mappings/{m['id']}/draft", json={"rules": draft}, headers=h(TECHNICAL))
    make_source(participant["id"], template["id"], mapping_id=m["id"])
    r = upload(participant["id"], "x.csv", b"ref,amt,chan\nA,\"1,500\",POS\nB,250.5,Mobile")
    assert r.status_code == 201, r.text
    job = wait_job(r.json()["job"]["id"])
    assert job["status"] == "Completed" and job["mapping_label"] == f"{m['code']} v1.0"
    sub = _get(f"/submissions/{r.json()['submission']['id']}")
    assert sub["numeric_totals"] == {"amount": 1750.5} and sub["row_count"] == 2 and sub["loaded_at"]


def test_mapping_is_technical_only():
    c = client()
    for email in (BUSINESS, COMPLIANCE):
        assert c.get("/integrations/mappings", headers=h(email)).status_code == 403
        assert c.get("/integrations/mappings/standards", headers=h(email)).status_code == 403
        assert c.post("/integrations/mappings", json={"name": "x"}, headers=h(email)).status_code == 403
    assert c.get("/integrations/mappings", headers=h(TECHNICAL)).status_code == 200


if __name__ == "__main__":
    run_module(globals())
