"""Reports tests (REQ-RPT-001..006, §14.1–14.5, §19.6)."""

from tests.pipeline_support import (
    BUSINESS,
    COMPLIANCE,
    TECHNICAL,
    client,
    h,
    run_module,
)


def c():
    return client()


# ---- RPT-001: six report types ----------------------------------------------

def test_overview_shape():
    r = c().get("/reports/overview", headers=h(COMPLIANCE))
    assert r.status_code == 200
    d = r.json()
    assert set(d) >= {"participants_total", "participants_connected", "open_issues_total", "documents_needing_attention"}


def test_export_compliance_status_pdf():
    r = c().get("/reports/export?report=compliance_status&format=pdf", headers=h(COMPLIANCE))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 100


def test_export_compliance_status_xlsx():
    r = c().get("/reports/export?report=compliance_status&format=xlsx", headers=h(BUSINESS))
    assert r.status_code == 200
    assert "spreadsheet" in r.headers["content-type"]


def test_export_integration_status():
    r = c().get("/reports/export?report=integration_status&format=xlsx", headers=h(TECHNICAL))
    assert r.status_code == 200


def test_export_submission_history():
    r = c().get("/reports/export?report=submission_history&format=pdf", headers=h(COMPLIANCE))
    assert r.status_code == 200


def test_export_issues():
    r = c().get("/reports/export?report=issues&format=xlsx", headers=h(COMPLIANCE))
    assert r.status_code == 200


def test_export_unknown_report():
    r = c().get("/reports/export?report=nonexistent&format=pdf", headers=h(COMPLIANCE))
    assert r.status_code == 422


# ---- RPT-003: PDF and Excel output ------------------------------------------

def test_pdf_has_content():
    r = c().get("/reports/export?report=submission_history&format=pdf", headers=h(COMPLIANCE))
    assert r.status_code == 200
    # PDF magic bytes
    assert r.content[:4] == b"%PDF"


def test_xlsx_has_content():
    r = c().get("/reports/export?report=submission_history&format=xlsx", headers=h(COMPLIANCE))
    assert r.status_code == 200
    # XLSX is a ZIP file
    assert r.content[:2] == b"PK"


# ---- RPT-004: persistent report history -------------------------------------

def test_report_history_recorded():
    # Generate a report
    r = c().get("/reports/export?report=issues&format=pdf", headers=h(COMPLIANCE))
    assert r.status_code == 200
    run_id = int(r.headers["x-report-run-id"])

    # It appears in history
    history = c().get("/reports/history", headers=h(COMPLIANCE)).json()
    ids = [h_["id"] for h_ in history]
    assert run_id in ids

    # History row has required fields
    row = next(x for x in history if x["id"] == run_id)
    assert set(row) >= {"id", "report", "format", "filename", "generated_by", "generated_at"}


def test_report_history_download():
    r = c().get("/reports/export?report=compliance_status&format=pdf", headers=h(COMPLIANCE))
    run_id = int(r.headers["x-report-run-id"])
    dl = c().get(f"/reports/history/{run_id}/download", headers=h(BUSINESS))
    assert dl.status_code == 200
    assert dl.content[:4] == b"%PDF"


def test_report_history_delete():
    r = c().get("/reports/export?report=issues&format=xlsx", headers=h(COMPLIANCE))
    run_id = int(r.headers["x-report-run-id"])
    assert c().delete(f"/reports/history/{run_id}", headers=h(TECHNICAL)).status_code == 200
    assert c().get(f"/reports/history/{run_id}/download", headers=h(COMPLIANCE)).status_code == 404


# ---- RPT-005: schedules (§19.6) ---------------------------------------------

def test_schedule_create_and_list():
    r = c().post("/reports/schedules", headers=h(COMPLIANCE), json={
        "name": "Monthly compliance PDF",
        "report": "compliance_status",
        "format": "pdf",
        "frequency": "Monthly",
        "recipient": "compliance@rswitch.rw",
    })
    assert r.status_code == 200
    sched = r.json()
    assert sched["name"] == "Monthly compliance PDF"
    assert sched["active"] is True

    schedules = c().get("/reports/schedules", headers=h(BUSINESS)).json()
    assert any(s["id"] == sched["id"] for s in schedules)
    return sched["id"]


def test_schedule_toggle():
    r = c().post("/reports/schedules", headers=h(BUSINESS), json={
        "name": "Weekly integration health",
        "report": "integration_status",
        "format": "xlsx",
        "frequency": "Weekly",
    })
    sched_id = r.json()["id"]
    r = c().patch(f"/reports/schedules/{sched_id}", headers=h(BUSINESS), json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False


def test_schedule_delete():
    r = c().post("/reports/schedules", headers=h(COMPLIANCE), json={
        "name": "To delete",
        "report": "issues",
        "format": "pdf",
        "frequency": "Daily",
    })
    sched_id = r.json()["id"]
    assert c().delete(f"/reports/schedules/{sched_id}", headers=h(COMPLIANCE)).status_code == 200
    schedules = c().get("/reports/schedules", headers=h(COMPLIANCE)).json()
    assert not any(s["id"] == sched_id for s in schedules)


def test_schedule_invalid_report():
    r = c().post("/reports/schedules", headers=h(COMPLIANCE), json={
        "name": "Bad",
        "report": "nonexistent",
        "format": "pdf",
        "frequency": "Monthly",
    })
    assert r.status_code == 422


def test_schedule_run_now():
    r = c().post("/reports/schedules", headers=h(COMPLIANCE), json={
        "name": "Run now test",
        "report": "compliance_status",
        "format": "pdf",
        "frequency": "Monthly",
    })
    sched_id = r.json()["id"]
    r = c().post(f"/reports/schedules/{sched_id}/run", headers=h(COMPLIANCE))
    assert r.status_code == 200
    run = r.json()
    assert run["report"] == "compliance_status" and run["schedule_id"] == sched_id


# ---- RPT-006: participant filter --------------------------------------------

def test_export_with_participant_filter():
    from tests.pipeline_support import setup_manual
    participant, _, _ = setup_manual()
    r = c().get(
        f"/reports/export?report=submission_history&format=xlsx&participant_id={participant['id']}",
        headers=h(COMPLIANCE),
    )
    assert r.status_code == 200


# ---- Requires auth ----------------------------------------------------------

def test_reports_require_auth():
    assert c().get("/reports/overview").status_code == 401
    assert c().get("/reports/history").status_code == 401


# ---- Trends -----------------------------------------------------------------

def test_trends_shape():
    r = c().get("/reports/trends?months=3", headers=h(BUSINESS))
    assert r.status_code == 200
    series = r.json()
    assert isinstance(series, list)
    if series:
        assert set(series[0]) >= {"month", "submissions_total", "submissions_passed"}


if __name__ == "__main__":
    run_module(globals())
