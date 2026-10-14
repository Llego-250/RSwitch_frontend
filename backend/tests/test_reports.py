"""Reports checks (SRS §5.11 REQ-RPT-001..006, §13, §14.1–14.5, §17.1, §17.3,
§19.6).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/reports.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/reports-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_reports
(or under pytest). Every test creates what it asserts on, so the file can be
re-run against the same database."""

import csv
import io
import time
from datetime import datetime, timedelta
from uuid import uuid4

from openpyxl import load_workbook
from sqlmodel import Session, select

from tests.pipeline_support import BUSINESS, COMPLIANCE, TECHNICAL, client, h, make_participant, run_module

from app.core.security import hash_password  # noqa: E402
from app.db import engine  # noqa: E402
from app.models.admin import AuditEvent, EmailOutbox, ReportRun, ReportSchedule  # noqa: E402
from app.models.enums import IssueSeverity, IssueStatus, UserRole  # noqa: E402
from app.models.issue import Issue  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import compliance, inclusion, reporting, risk  # noqa: E402

ROLES = {"Compliance": COMPLIANCE, "Business": BUSINESS, "Technical / Admin": TECHNICAL}
C, B, T = "Compliance", "Business", "Technical / Admin"

COLUMNS = {
    "compliance_summary": ["Participant name", "Requirement name", "Due date", "Submission date", "Status", "Reviewer",
                           "Rejection reason"],
    "integration_health": ["Participant", "Source", "Status", "Last sync date", "Records transferred", "Error count",
                           "Uptime %"],
    "participant_performance": ["Participant", "Risk score", "Compliance rate", "Failure rate", "Open incidents",
                                "Overdue submissions"],
    "inclusion": inclusion.REPORT_COLUMNS,
    "incidents": ["Incident ID", "Participant", "Severity", "Description", "Raised date", "Status", "Resolved date",
                  "Resolution summary"],
    "governance_action_items": ["Committee", "Action item", "Owner", "Due date", "Status", "Meeting", "Days overdue"],
}
# §14 per-report permissions (generate ⊂ view).
GENERATE = {"compliance_summary": {C}, "integration_health": {T}, "participant_performance": {C, B}, "inclusion": {B},
            "incidents": {C}, "governance_action_items": {C}}
VIEW = {"compliance_summary": {C, B}, "integration_health": {C, B, T}, "participant_performance": {C, B},
        "inclusion": {B, C}, "incidents": {C}, "governance_action_items": {C, B, T}}
GENERATOR = {k: ROLES[sorted(v)[0]] for k, v in GENERATE.items()}


def c():
    return client()


def generate(report: str, email: str, fmt: str = "xlsx", filters: dict | None = None, **extra):
    return c().post("/reports/generate", headers=h(email), json={"report": report, "format": fmt, "filters": filters or {}, **extra})


def completed(report: str, email: str | None = None, fmt: str = "xlsx", filters: dict | None = None) -> dict:
    r = generate(report, email or GENERATOR[report], fmt, filters)
    assert r.status_code == 202, r.text
    run = c().get(f"/reports/{r.json()['id']}", headers=h(email or GENERATOR[report])).json()
    assert run["status"] == "Completed", run
    return run


def sheet_rows(run: dict, email: str | None = None) -> list[tuple]:
    data = c().get(run["download_url"], headers=h(email or GENERATOR[run["report"]])).content
    book = load_workbook(io.BytesIO(data))
    ws = book["Financial inclusion"] if run["report"] == "inclusion" else book["Report"]
    return list(ws.iter_rows(values_only=True))


def records(run: dict) -> list[dict]:
    rows = sheet_rows(run)
    return [dict(zip(rows[0], r)) for r in rows[1:]]


# ---- REQ-RPT-001 / REQ-RPT-002 / §14: catalogue, columns, filters -----------------------------

def test_catalogue_has_the_six_report_types_with_section_14_columns():
    d = c().get("/reports/types", headers=h(COMPLIANCE)).json()
    names = {t["key"]: t["name"] for t in d["types"]}
    assert names == {"compliance_summary": "Compliance Summary", "integration_health": "Integration Health",
                     "participant_performance": "Participant Performance", "inclusion": "Financial Inclusion",
                     "incidents": "Incident Report", "governance_action_items": "Governance Action Items"}
    for t in d["types"]:
        assert t["columns"] == COLUMNS[t["key"]], t["key"]
        assert set(t["formats"]) == {"pdf", "xlsx", "csv"}
    filters = {t["key"]: set(t["filters"]) for t in d["types"]}
    common = {"participant_id", "institution_type", "region", "status", "date_from", "date_to", "risk_level"}
    assert filters["compliance_summary"] >= common  # §14.1 + REQ-RPT-006
    assert filters["integration_health"] >= common | {"integration_type"}  # §14.2 integration type
    assert filters["participant_performance"] >= common  # §14.3
    assert filters["incidents"] >= common | {"severity"}  # §14.5
    assert filters["governance_action_items"] >= common | {"committee_id", "owner"}
    assert filters["inclusion"] == {"institution_type", "region", "date_from", "date_to"}  # §14.4, aggregated
    status = {t["key"]: t["status_options"] for t in d["types"]}
    assert {"Pending", "Overdue", "Approved", "Rejected"} <= set(status["compliance_summary"])
    assert status["incidents"] == ["Open", "Under Investigation", "Remediation In Progress", "Resolved", "Closed"]
    assert {"Healthy", "Warning", "Failed"} <= set(status["integration_health"])
    assert len(d["options"]["institution_types"]) == 4 and len(d["options"]["regions"]) == 5


def test_every_report_renders_exactly_its_columns():
    for key, columns in COLUMNS.items():
        rows = sheet_rows(completed(key))
        assert list(rows[0]) == columns, (key, rows[0])


def test_every_format_is_produced_and_non_empty():
    for key in COLUMNS:
        for fmt in ("pdf", "xlsx", "csv"):
            run = completed(key, fmt=fmt)
            r = c().get(run["download_url"], headers=h(GENERATOR[key]))
            assert r.status_code == 200 and len(r.content) > 200, (key, fmt)
            assert r.headers["content-type"].startswith(reporting.MEDIA[fmt])
            assert run["filename"].endswith(f".{fmt}") and run["size_bytes"] == len(r.content)
            if fmt == "pdf":
                assert r.content.startswith(b"%PDF") and b"/Type /Page" in r.content
            elif fmt == "xlsx":
                assert r.content[:2] == b"PK"
            else:
                header = next(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
                assert header == list(COLUMNS[key])


def test_pdf_is_a_formatted_table_document():
    """Title, author and time, filters, column headings repeated on every
    page, wrapped cells and "Page n of N" — checked on an uncompressed copy."""
    rt = reporting.REPORT_TYPES["compliance_summary"]
    meta = reporting.Meta("Compliance Summary Report", "Overview (SRS §14.1)", "Tester", datetime(2026, 1, 1, 9, 30),
                          "Africa/Kigali", ["Compliance status (§9.2): Overdue"], ["A note."])
    rows = [{"participant": f"Participant {i}", "requirement": "Monthly return", "status": "Overdue",
             "rejection_reason": "word " * 60} for i in range(40)]
    original = reporting._PDF.__init__

    def uncompressed(self, m):
        original(self, m)
        self.set_compression(False)

    reporting._PDF.__init__ = uncompressed
    try:
        raw = reporting.render_pdf(meta, list(rt.columns), rows, [])
    finally:
        reporting._PDF.__init__ = original
    pages = raw.count(b"/Type /Page\n")
    assert pages >= 2
    for text in (b"Compliance Summary Report", b"Generated by Tester on 2026-01-01 09:30", b"Filters applied:",
                 b"Overdue", b"Page 1 of %d" % pages):
        assert text in raw, text
    assert raw.count(b"(Rejection reason)") >= pages  # headings repeat on each page
    served = c().get(completed("compliance_summary", fmt="pdf")["download_url"], headers=h(COMPLIANCE)).content
    assert served.startswith(b"%PDF")


# ---- §14 per-report permissions (generate vs view) ----------------------------------------------------

def test_generate_permission_matrix():
    for key in COLUMNS:
        for role, email in ROLES.items():
            r = generate(key, email)
            assert r.status_code == (202 if role in GENERATE[key] else 403), (key, role, r.text)
            if r.status_code == 403:
                assert r.json()["detail"] == "You do not have permission to perform this action."


def test_view_permission_matrix_on_history_and_download():
    runs = {key: completed(key) for key in COLUMNS}
    for role, email in ROLES.items():
        history = c().get("/reports?limit=500", headers=h(email)).json()
        seen_types = {r["report_type"] for r in history}
        assert seen_types <= {k for k, roles in VIEW.items() if role in roles}, (role, seen_types)
        ids = {r["id"] for r in history}
        for key, run in runs.items():
            allowed = role in VIEW[key]
            assert (run["id"] in ids) == allowed, (role, key)
            dl = c().get(f"/reports/{run['id']}/download", headers=h(email))
            assert dl.status_code == (200 if allowed else 403), (role, key, dl.status_code)


def test_catalogue_flags_follow_section_14_including_technical_integration_health():
    for role, email in ROLES.items():
        types = {t["key"]: t for t in c().get("/reports/types", headers=h(email)).json()["types"]}
        for key in COLUMNS:
            assert types[key]["can_generate"] == (role in GENERATE[key]), (role, key)
            assert types[key]["can_view"] == (role in VIEW[key]), (role, key)
    # §14.2 overrides §12.1 here — but scheduling stays Compliance/Business (§12.1, REQ-RPT-005).
    tech = {t["key"]: t for t in c().get("/reports/types", headers=h(TECHNICAL)).json()["types"]}
    assert tech["integration_health"]["can_generate"] and not tech["integration_health"]["can_schedule"]


# ---- REQ-RPT-004 history ----------------------------------------------------------------------------

def test_history_lists_name_type_date_author_and_download_link():
    run = completed("incidents", fmt="pdf")
    row = next(r for r in c().get("/reports", headers=h(COMPLIANCE)).json() if r["id"] == run["id"])
    assert row["name"] and row["report_name"] == "Incident Report" and row["generated_at"]
    assert row["generated_by"] == "Compliance Officer" or row["generated_by"]
    assert row["download_url"] == f"/reports/{run['id']}/download" and row["mine"] is True
    mine = c().get("/reports?mine=true", headers=h(BUSINESS)).json()
    assert all(r["mine"] for r in mine)
    only = c().get("/reports?report=incidents", headers=h(COMPLIANCE)).json()
    assert only and all(r["report_type"] == "incidents" for r in only)


def test_generation_is_queued_audited_and_under_30_seconds():
    started = time.time()
    r = generate("compliance_summary", COMPLIANCE, "pdf")
    assert r.status_code == 202 and r.json()["status"] in ("Queued", "Running", "Completed")
    run = c().get(f"/reports/{r.json()['id']}", headers=h(COMPLIANCE)).json()
    assert run["status"] == "Completed" and time.time() - started < 30  # §17.1
    with Session(engine) as s:
        assert s.exec(select(AuditEvent).where(AuditEvent.action == "REPORT_GENERATE",
                                               AuditEvent.resource.startswith(f"RPT-{run['id']:04d}"))).first()


def test_a_failed_generation_is_recorded_and_not_downloadable():
    original = reporting.BUILDERS["incidents"]
    reporting.BUILDERS["incidents"] = lambda ctx: 1 / 0
    try:
        r = generate("incidents", COMPLIANCE)
    finally:
        reporting.BUILDERS["incidents"] = original
    run = c().get(f"/reports/{r.json()['id']}", headers=h(COMPLIANCE)).json()
    assert run["status"] == "Failed" and "could not be generated" in run["error"] and run["download_url"] is None
    assert c().get(f"/reports/{run['id']}/download", headers=h(COMPLIANCE)).status_code == 409


def test_orphaned_queued_runs_are_picked_up():
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == COMPLIANCE)).one()
        run = reporting.create_run(s, "incidents", "csv", {}, user)
        run.generated_at = datetime.utcnow() - timedelta(minutes=5)
        s.add(run)
        s.commit()
        reporting.recover_stale_runs(s)
        s.refresh(run)
        assert run.status == "Completed" and run.size_bytes > 0


# ---- REQ-RPT-002 / REQ-RPT-006 filters ----------------------------------------------------------------

def test_compliance_summary_filters():
    overdue = records(completed("compliance_summary", filters={"status": "Overdue"}))
    assert overdue and all(r["Status"] == "Overdue" for r in overdue)
    with Session(engine) as s:
        saccos = {r["participant_name"] for r in compliance.summary_rows(s) if r["institution_type"] == "SACCO"}
    rows = records(completed("compliance_summary", filters={"institution_type": "SACCO"}))
    assert rows and {r["Participant name"] for r in rows} <= saccos
    bank = make_participant(type="Commercial Bank", region="Western Province")
    assert records(completed("compliance_summary", filters={"participant_id": bank["id"]})) == []


def test_integration_health_filters_and_window():
    failed = records(completed("integration_health", filters={"status": "Failed"}))
    assert all(r["Status"] == "Failed" for r in failed)
    manual = records(completed("integration_health", filters={"integration_type": "Manual"}))
    every = records(completed("integration_health"))
    assert len(manual) <= len(every)
    for r in every:
        assert r["Uptime %"] is None or 0 <= r["Uptime %"] <= 100
    run = completed("integration_health", fmt="xlsx", filters={"date_from": "2026-01-01", "date_to": "2026-01-31"})
    book = load_workbook(io.BytesIO(c().get(run["download_url"], headers=h(TECHNICAL)).content))
    assert "Recent pipeline runs" in book.sheetnames  # §14.2 "and recent pipeline runs"


def test_participant_performance_ranking_rates_and_risk_filter():
    rows = records(completed("participant_performance"))
    scores = [r["Risk score"] for r in rows]
    scored = [s for s in scores if isinstance(s, (int, float))]
    assert scored == sorted(scored)  # ranked: lowest risk first
    assert all(not isinstance(s, (int, float)) for s in scores[len(scored):])  # insufficient data last
    with Session(engine) as s:
        bands = {r["participant_name"]: r["band"] or "Insufficient data" for r in risk.latest_scores(s)}
    for level in ("Low", "Insufficient data"):
        got = records(completed("participant_performance", filters={"risk_level": level}))
        assert {r["Participant"] for r in got} == {n for n, b in bands.items() if b == level}, level
    saccos = records(completed("participant_performance", filters={"institution_type": "SACCO", "region": "Western Province"}))
    with Session(engine) as s:
        from app.models.participant import Participant

        expected = {p.name for p in s.exec(select(Participant).where(Participant.type == "SACCO",
                                                                      Participant.region == "Western Province")).all()}
    assert {r["Participant"] for r in saccos} == expected


def test_performance_rates_match_the_compliance_service_definitions():
    with Session(engine) as s:
        _, result, _ = reporting.build(s, "participant_performance", {})
        by_name = {r["participant"]: r for r in result.rows}
        for row in compliance.failure_rates(s, 12):
            mine = by_name[row["participant_name"]]
            assert mine["failure_rate"] == row["failure"]["rate_pct"], row["participant_name"]
            assert mine["compliance_rate"] == row["adherence"]["rate_pct"], row["participant_name"]


def test_incident_and_governance_filters():
    with Session(engine) as s:
        p = make_participant(type="MFI", region="Northern Province")
        s.add(Issue(participant_id=p["id"], description=f"Report filter check {uuid4().hex[:6]}", severity=IssueSeverity.critical,
                    status=IssueStatus.open))
        s.commit()
    rows = records(completed("incidents", filters={"severity": "Critical", "participant_id": p["id"]}))
    assert len(rows) == 1 and rows[0]["Severity"] == "Critical" and rows[0]["Incident ID"].startswith("INC-")
    assert records(completed("incidents", filters={"severity": "Low", "participant_id": p["id"]})) == []
    overdue = records(completed("governance_action_items", filters={"status": "Overdue"}))
    assert overdue and all(r["Status"] == "Overdue" and r["Days overdue"] > 0 for r in overdue)
    committees = c().get("/reports/types", headers=h(COMPLIANCE)).json()["options"]["committees"]
    one = records(completed("governance_action_items", filters={"committee_id": committees[0]["id"]}))
    assert all(r["Committee"] == committees[0]["name"] for r in one)


def test_inclusion_report_uses_the_inclusion_module():
    run = completed("inclusion", filters={"institution_type": "SACCO"})
    rows = records(run)
    assert rows and all(r["Institution type"] == "SACCO" for r in rows)
    with Session(engine) as s:
        rows_, columns = reporting.report_rows(s, "inclusion")
        assert columns == inclusion.REPORT_COLUMNS


def test_invalid_or_inapplicable_filters_are_rejected():
    cases = [("compliance_summary", {"status": "Bogus"}), ("compliance_summary", {"severity": "High"}),
             ("compliance_summary", {"date_from": "2026-05-01", "date_to": "2026-04-01"}),
             ("inclusion", {"participant_id": 1}), ("incidents", {"region": "Mars"}),
             ("participant_performance", {"risk_level": "Extreme"}), ("compliance_summary", {"participant_id": 999999})]
    for key, filters in cases:
        r = generate(key, GENERATOR[key], filters=filters)
        assert r.status_code == 422, (key, filters, r.text)
        assert r.json()["detail"][0]["field"].startswith("filters.")
    assert generate("nope", COMPLIANCE).status_code == 422
    assert generate("incidents", COMPLIANCE, fmt="docx").status_code == 422


# ---- REQ-RPT-006 saved templates ----------------------------------------------------------------------

def test_templates_create_list_apply_delete():
    name = f"Overdue banks {uuid4().hex[:5]}"
    body = {"name": name, "report": "compliance_summary", "filters": {"status": "Overdue", "institution_type": "Commercial Bank"},
            "format": "xlsx", "shared": True}
    r = c().post("/reports/templates", headers=h(COMPLIANCE), json=body)
    assert r.status_code == 201, r.text
    template = r.json()
    assert c().post("/reports/templates", headers=h(COMPLIANCE), json=body).status_code == 409
    assert c().post("/reports/templates", headers=h(BUSINESS), json={**body, "report": "incidents"}).status_code == 403
    assert c().post("/reports/templates", headers=h(COMPLIANCE), json={**body, "name": "x", "filters": {"status": "Nope"}}).status_code == 422
    assert any(t["id"] == template["id"] for t in c().get("/reports/templates", headers=h(COMPLIANCE)).json())
    # Shared, but Business can't generate Compliance Summary, so it isn't offered.
    assert all(t["id"] != template["id"] for t in c().get("/reports/templates", headers=h(BUSINESS)).json())
    # Apply: generating from the template uses its filters.
    r = generate("compliance_summary", COMPLIANCE, template_id=template["id"])
    run = c().get(f"/reports/{r.json()['id']}", headers=h(COMPLIANCE)).json()
    assert run["filters"] == {"status": "Overdue", "institution_type": "Commercial Bank"}
    assert all(r_["Status"] == "Overdue" for r_ in records(run))
    private = c().post("/reports/templates", headers=h(BUSINESS), json={**body, "report": "participant_performance",
                                                                         "filters": {"risk_level": "High"}, "shared": False}).json()
    assert all(t["id"] != private["id"] for t in c().get("/reports/templates", headers=h(COMPLIANCE)).json())
    assert c().delete(f"/reports/templates/{private['id']}", headers=h(COMPLIANCE)).status_code == 404
    assert c().delete(f"/reports/templates/{template['id']}", headers=h(COMPLIANCE)).status_code == 200
    assert all(t["id"] != template["id"] for t in c().get("/reports/templates", headers=h(COMPLIANCE)).json())


# ---- REQ-RPT-005 schedules (§19.6, §13) ----------------------------------------------------------------

def schedule(email: str, report: str = "compliance_summary", **body):
    return c().post("/reports/schedules", headers=h(email), json={"report": report, "frequency": "Daily", "format": "xlsx", **body})


def test_schedule_create_list_cancel():
    r = schedule(COMPLIANCE, name=f"Daily overdue {uuid4().hex[:5]}", filters={"status": "Overdue"})
    assert r.status_code == 201, r.text
    s_ = r.json()
    assert s_["active"] and s_["next_run_at"] and s_["frequency"] == "Daily"
    for freq in ("Weekly", "Monthly"):
        assert schedule(BUSINESS, "participant_performance", frequency=freq).status_code == 201
    assert schedule(TECHNICAL, "integration_health").status_code == 403  # §12.1 Schedule ✗ for Technical
    assert schedule(BUSINESS, "incidents").status_code == 403  # §14.5: Compliance only
    assert schedule(COMPLIANCE, frequency="Hourly").status_code == 422
    assert schedule(COMPLIANCE, start_date="2020-01-01").status_code == 422
    assert any(x["id"] == s_["id"] for x in c().get("/reports/schedules", headers=h(COMPLIANCE)).json())
    assert all(x["id"] != s_["id"] for x in c().get("/reports/schedules", headers=h(BUSINESS)).json())
    assert c().delete(f"/reports/schedules/{s_['id']}", headers=h(BUSINESS)).status_code == 404
    r = c().delete(f"/reports/schedules/{s_['id']}", headers=h(COMPLIANCE))
    assert r.status_code == 200 and r.json()["active"] is False and r.json()["cancelled_at"]
    assert all(x["id"] != s_["id"] for x in c().get("/reports/schedules", headers=h(COMPLIANCE)).json())
    assert c().delete(f"/reports/schedules/{s_['id']}", headers=h(COMPLIANCE)).status_code == 409


def _force_due(schedule_id: int) -> None:
    with Session(engine) as s:
        row = s.get(ReportSchedule, schedule_id)
        row.next_run_at = row.start_at = datetime.utcnow() - timedelta(minutes=1)
        s.add(row)
        s.commit()


def test_due_schedule_is_generated_once_and_emailed_to_requester_with_attachment():
    s_ = schedule(COMPLIANCE, name=f"Due now {uuid4().hex[:5]}", filters={"status": "Overdue"}).json()
    _force_due(s_["id"])
    with Session(engine) as s:
        reporting.run_due_schedules(s)
        runs = s.exec(select(ReportRun).where(ReportRun.schedule_id == s_["id"])).all()
        assert len(runs) == 1 and runs[0].status == "Completed" and runs[0].filters == {"status": "Overdue"}
        mails = s.exec(select(EmailOutbox).where(EmailOutbox.dedupe_key == runs[0].dedupe_key)).all()
        assert len(mails) == 1 and mails[0].to_address == COMPLIANCE
        assert mails[0].event == "scheduled_report_generated" and mails[0].attachments == [runs[0].filename]
        assert runs[0].filename.endswith(".xlsx")
        # A second tick in the same slot: nothing new (dedupe), next slot in the future.
        reporting.run_due_schedules(s)
        assert len(s.exec(select(ReportRun).where(ReportRun.schedule_id == s_["id"])).all()) == 1
        assert len(s.exec(select(EmailOutbox).where(EmailOutbox.dedupe_key == runs[0].dedupe_key)).all()) == 1
        row = s.get(ReportSchedule, s_["id"])
        assert row.next_run_at > datetime.utcnow() and row.last_run_id == runs[0].id
    # The scheduled run is in the requester's history.
    assert any(r["id"] == runs[0].id for r in c().get("/reports", headers=h(COMPLIANCE)).json())


def test_schedule_stops_when_requester_loses_permission():
    email = f"rpt-{uuid4().hex[:6]}@rswitch.rw"
    with Session(engine) as s:
        s.add(User(email=email, full_name="Report Tester", role=UserRole.business, hashed_password=hash_password("Strong-Pass-2026!")))
        s.commit()
    s_ = schedule(email, "participant_performance").json()
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email)).one()
        user.role = UserRole.technical
        s.add(user)
        s.commit()
    _force_due(s_["id"])
    with Session(engine) as s:
        reporting.run_due_schedules(s)
        row = s.get(ReportSchedule, s_["id"])
        assert row.active is False and row.cancelled_by.startswith("System")
        assert s.exec(select(ReportRun).where(ReportRun.schedule_id == s_["id"])).first() is None


def test_monthly_slots_keep_their_day():
    start = datetime(2026, 1, 31, 4, 0)
    assert reporting.slot_after(start, "Monthly", datetime(2026, 2, 1)) == datetime(2026, 2, 28, 4, 0)
    assert reporting.slot_after(start, "Monthly", datetime(2026, 3, 1)) == datetime(2026, 3, 31, 4, 0)
    assert reporting.slot_after(start, "Weekly", datetime(2026, 1, 31, 4, 0)) == datetime(2026, 2, 7, 4, 0)
    assert reporting.slot_after(start, "Daily", datetime(2026, 3, 10, 12, 0)) == datetime(2026, 3, 11, 4, 0)


# ---- other endpoints ------------------------------------------------------------------------------------

def test_summaries_used_elsewhere_still_work():
    for path in ("/reports/overview", "/reports/trends?months=3", "/reports/inclusion"):
        assert c().get(path, headers=h(BUSINESS)).status_code == 200, path


def test_reports_require_sign_in():
    for path in ("/reports", "/reports/types", "/reports/schedules", "/reports/templates", "/reports/1/download"):
        assert c().get(path).status_code == 401, path
    assert c().post("/reports/generate", json={"report": "incidents"}).status_code == 401


if __name__ == "__main__":
    run_module(globals())
