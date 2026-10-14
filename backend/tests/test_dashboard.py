"""Dashboard checks (SRS §5.2 REQ-DASH-001..010, §15.1–15.3, §17.1).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/reports.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/reports-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_dashboard
(or under pytest). Tests create what they assert on, so the file can be
re-run against the same database."""

import json
import time
from datetime import datetime, timedelta
from uuid import uuid4

from sqlmodel import Session, select

from tests.pipeline_support import BUSINESS, COMPLIANCE, TECHNICAL, client, h, make_participant, run_module

from app.db import engine  # noqa: E402
from app.models.enums import UNRESOLVED_INCIDENT_STATUSES, IntegrationStatus, IssueSeverity, IssueStatus, UserRole  # noqa: E402
from app.models.integration import Integration  # noqa: E402
from app.models.issue import Issue  # noqa: E402
from app.models.participant import Participant  # noqa: E402
from app.services import audit, reporting, risk  # noqa: E402

SECTION_15 = {
    COMPLIANCE: ["overdue_submissions", "upcoming_deadlines", "open_incidents", "compliance_rate", "overdue_action_items",
                 "recent_activity"],
    BUSINESS: ["integration_health", "ai_alerts", "inclusion_snapshot", "risk_overview", "recent_reports",
               "compliance_overview"],
    TECHNICAL: ["active_pipelines", "failed_integrations", "data_freshness", "system_health", "pending_mappings",
                "recent_pipeline_runs"],
}
COMMON = ["attention_queue", "integration_health", "upcoming_deadlines", "recent_activity"]
RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


def c():
    return client()


def dash(email: str, widgets: dict | None = None, **filters) -> dict:
    params = {k: v for k, v in filters.items() if v is not None}
    if widgets:
        params["widgets"] = json.dumps(widgets)
    r = c().get("/dashboard", headers=h(email), params=params)
    assert r.status_code == 200, r.text
    return r.json()


def data(email: str, key: str, widgets: dict | None = None, **filters):
    return dash(email, widgets, **filters)["data"][key]["data"]


# ---- DASH-001 / DASH-002 / §15 -------------------------------------------------------------

def test_each_role_gets_exactly_its_section_15_widgets():
    for email, widgets in SECTION_15.items():
        d = dash(email)
        assert d["widgets"] == widgets, email
        assert d["sections"] == [k for k in COMMON if k not in widgets], email
        assert set(d["data"]) == set(widgets) | set(COMMON), email
        for key in widgets:
            assert d["data"][key]["title"] and d["data"][key]["description"], key


def test_compliance_widgets_match_the_compliance_service():
    from app.services import compliance

    d = dash(COMPLIANCE)["data"]
    with Session(engine) as s:
        summary = compliance.dashboard_summary(s, 30)
    assert d["overdue_submissions"]["data"]["count"] == summary["overdue_submissions"]
    assert d["upcoming_deadlines"]["data"]["count"] == len(summary["upcoming_deadlines"])
    assert {k: d["open_incidents"]["data"][k] for k in ("Critical", "High", "Medium", "Low", "total")} == summary["open_incidents"]
    assert d["compliance_rate"]["data"]["rate_pct"] == summary["compliance_rate_30d"]["rate_pct"]
    items = d["overdue_action_items"]["data"]
    assert (items["governance"], items["incident_remediation"]) == (summary["overdue_action_items"]["governance"],
                                                                  summary["overdue_action_items"]["incident_remediation"])
    assert len(d["recent_activity"]["data"]["items"]) <= 10 and d["recent_activity"]["data"]["source"] == "compliance"


def test_business_widgets():
    d = dash(BUSINESS)["data"]
    health = d["integration_health"]["data"]
    assert health["total"] == sum(health["by_status"].values())
    assert set(health["by_status"]) == {"Healthy", "Warning", "Failed", "Pending", "Not Configured", "Running", "Queued", "Paused"}
    with Session(engine) as s:
        assert d["risk_overview"]["data"]["distribution"] == risk.distribution(s)
    assert isinstance(d["ai_alerts"]["data"]["unacknowledged"], int)
    snap = d["inclusion_snapshot"]["data"]
    assert snap["metrics"] and all({"label", "value", "unit", "available"} <= set(m) for m in snap["metrics"])
    reports = d["recent_reports"]["data"]["items"]
    assert len(reports) <= 5
    for r in reports:  # §14: only reports Business may view, each with its download link
        assert UserRole.business in reporting.report_type(r["report"]).view | reporting.report_type(r["report"]).generate
        assert r["download_url"] or r["status"] != "Completed"
    assert "rate_pct" in d["compliance_overview"]["data"] and d["compliance_overview"]["data"]["current_status"]


def test_technical_widgets():
    d = dash(TECHNICAL)["data"]
    active = d["active_pipelines"]["data"]
    assert {"running", "queued", "failed", "completed"} <= set(active)
    with Session(engine) as s:
        failed = s.exec(select(Integration).where(Integration.status == IntegrationStatus.failed)).all()
        total = len(s.exec(select(Integration)).all())
    assert d["failed_integrations"]["data"]["count"] == len(failed)
    assert d["data_freshness"]["data"]["count"] == total
    health = d["system_health"]["data"]
    assert health["uptime_seconds"] >= 0 and health["requests"] >= 1 and "queue_depth" in health
    assert isinstance(d["pending_mappings"]["data"]["count"], int)
    runs = d["recent_pipeline_runs"]["data"]["items"]
    assert len(runs) <= 10 and all("status" in r for r in runs)


def test_system_health_reports_5xx_rate():
    from app.core.metrics import metrics

    before = data(TECHNICAL, "system_health", {"system_health": {"period": 15}})
    metrics.record(500)
    after = data(TECHNICAL, "system_health", {"system_health": {"period": 15}})
    assert after["errors_5xx"] == before["errors_5xx"] + 1 and after["error_rate_pct"] > 0


# ---- DASH-009 filters, DASH-010 per-widget period and scope -----------------------------------------

def test_filters_are_applied_server_side():
    with Session(engine) as s:
        participant = s.exec(select(Participant).order_by(Participant.id)).first()
        mine = s.exec(select(Integration).where(Integration.participant_id == participant.id)).all()
        saccos = {p.id for p in s.exec(select(Participant).where(Participant.type == "SACCO")).all()}
        sacco_integrations = s.exec(select(Integration).where(Integration.participant_id.in_(saccos))).all()
        open_incidents = s.exec(select(Issue).where(Issue.participant_id == participant.id,
                                                    Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all()
    assert data(BUSINESS, "integration_health", participant_id=participant.id)["total"] == len(mine)
    assert data(BUSINESS, "integration_health", institution_type="SACCO")["total"] == len(sacco_integrations)
    assert data(COMPLIANCE, "open_incidents", participant_id=participant.id)["total"] == len(open_incidents)
    d = dash(BUSINESS, institution_type="SACCO")
    assert d["participants_in_scope"] == len(saccos)
    # A widget whose scope is "all" ignores the dashboard filters.
    everything = data(BUSINESS, "integration_health")["total"]
    assert data(BUSINESS, "integration_health", {"integration_health": {"scope": "all"}}, institution_type="SACCO")["total"] == everything
    with Session(engine) as s:
        bands = {r["participant_id"]: r["band"] or "Insufficient data" for r in risk.latest_scores(s)}
    low = data(BUSINESS, "risk_overview", risk="Low")["distribution"]
    assert low["Low"] == sum(1 for b in bands.values() if b == "Low") and low["High"] == 0
    empty = make_participant(type="MFI", region="Southern Province", status="Suspended")
    assert data(TECHNICAL, "data_freshness", participant_id=empty["id"])["count"] == 0


def test_widget_period_and_scope_change_results():
    week = data(COMPLIANCE, "upcoming_deadlines", {"upcoming_deadlines": {"period": 7}})
    quarter = data(COMPLIANCE, "upcoming_deadlines", {"upcoming_deadlines": {"period": 90}})
    assert week["count"] <= quarter["count"] and week["period_label"] == "Next 7 days"
    assert all(i["days_until_due"] <= 7 for i in week["items"])
    d = dash(COMPLIANCE, {"compliance_rate": {"period": 365}})
    assert d["data"]["compliance_rate"]["period"]["value"] == 365
    assert d["data"]["compliance_rate"]["data"]["period_label"] == "Last 365 days"
    mine = data(COMPLIANCE, "open_incidents", {"open_incidents": {"scope": "mine"}})
    assert mine["total"] <= data(COMPLIANCE, "open_incidents")["total"]
    single = c().get("/dashboard/widgets/upcoming_deadlines", headers=h(TECHNICAL), params={"period": 90})
    assert single.status_code == 200 and single.json()["data"]["count"] == quarter["count"]
    assert c().get("/dashboard/widgets/system_health", headers=h(BUSINESS)).status_code == 404  # not on its dashboard


def test_dashboard_date_range_overrides_widget_periods():
    d = dash(COMPLIANCE, date_from="2026-01-01", date_to="2026-03-31")
    assert d["data"]["open_incidents"]["period"]["overridden"] is True
    assert d["data"]["upcoming_deadlines"]["data"]["period_label"] == "2026-01-01 to 2026-03-31"
    assert all("2026-01-01" <= i["due_date"] <= "2026-03-31" for i in d["data"]["upcoming_deadlines"]["data"]["items"])


def test_invalid_filters_and_settings_are_rejected():
    for params in ({"region": "Mars"}, {"institution_type": "Bank"}, {"risk": "Extreme"}, {"status": "Gone"},
                   {"participant_id": 999999}, {"date_from": "2026-05-01", "date_to": "2026-04-01"},
                   {"widgets": "not json"}, {"widgets": json.dumps({"nope": {}})},
                   {"widgets": json.dumps({"upcoming_deadlines": {"period": 5}})},
                   {"widgets": json.dumps({"integration_health": {"period": 30}})}):
        r = c().get("/dashboard", headers=h(BUSINESS), params=params)
        assert r.status_code == 422, (params, r.text)


# ---- DASH-003 attention queue, DASH-004/005, DASH-008 recent activity --------------------------------

def test_attention_queue_spans_modules_ranked_by_severity_then_age():
    p = make_participant(type="SACCO", region="Eastern Province")
    with Session(engine) as s:
        old = Issue(participant_id=p["id"], description=f"Old critical {uuid4().hex[:5]}", severity=IssueSeverity.critical,
                    status=IssueStatus.open, created_at=datetime.utcnow() - timedelta(days=20))
        new = Issue(participant_id=p["id"], description=f"New critical {uuid4().hex[:5]}", severity=IssueSeverity.critical,
                    status=IssueStatus.open)
        low = Issue(participant_id=p["id"], description=f"Low {uuid4().hex[:5]}", severity=IssueSeverity.low, status=IssueStatus.open)
        s.add_all([old, new, low])
        s.commit()
        ids = [f"incident:{i.id}:Open" for i in (old, new, low)]
    queue = data(COMPLIANCE, "attention_queue")
    items = queue["items"]
    keys = [(RANK[i["severity"]], -(i["age_days"])) for i in items]
    assert [k[0] for k in keys] == sorted(k[0] for k in keys)
    for a, b in zip(items, items[1:]):
        if a["severity"] == b["severity"]:
            assert a["since"] <= b["since"]  # oldest first within a severity
    assert {"Compliance", "Integration", "Incident"} <= set(queue["by_kind"])
    mine = data(COMPLIANCE, "attention_queue", participant_id=p["id"])["items"]
    assert [i["id"] for i in mine] == ids  # old critical, new critical, low
    assert all(i["link"] for i in items)


def test_integration_health_and_deadlines_for_every_role():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        d = dash(email)["data"]
        assert {"healthy", "warning", "failed"} <= set(d["integration_health"]["data"])  # DASH-004
        assert d["upcoming_deadlines"]["data"]["period_label"] == "Next 30 days"  # DASH-005
        assert all(0 <= i["days_until_due"] <= 30 for i in d["upcoming_deadlines"]["data"]["items"])


def test_recent_activity_is_relevant_to_the_role():
    tag = uuid4().hex[:6]
    with Session(engine) as s:
        for action in ("INTEGRATION_UPDATE", "REPORT_GENERATE", "LOGIN", "USER_INVITE", "ALERT_TRANSITION"):
            audit.record(s, action, f"{action} {tag}")
    business = data(BUSINESS, "recent_activity")
    technical = data(TECHNICAL, "recent_activity")
    compliance = data(COMPLIANCE, "recent_activity")
    assert business["source"] == technical["source"] == "audit" and compliance["source"] == "compliance"
    b_kinds = {i["kind"] for i in business["items"] if tag in i["detail"]}
    t_kinds = {i["kind"] for i in technical["items"] if tag in i["detail"]}
    assert b_kinds == {"REPORT_GENERATE", "ALERT_TRANSITION"}
    assert t_kinds == {"INTEGRATION_UPDATE", "USER_INVITE"}
    for feed in (business, technical, compliance):
        assert len(feed["items"]) <= 10
        assert all(i["kind"] != "LOGIN" for i in feed["items"])
    assert all(not i["kind"].startswith(("INTEGRATION_", "USER_")) for i in business["items"])
    assert all(i["kind"].split("_")[0] in ("submission", "document", "correction", "deadline", "incident", "remediation")
               for i in compliance["items"])


# ---- §17.1, access ---------------------------------------------------------------------------------

def test_dashboard_refresh_under_3_seconds():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        started = time.perf_counter()
        d = dash(email)
        assert time.perf_counter() - started < 3, email
        assert d["elapsed_ms"] < 3000


def test_dashboard_requires_sign_in():
    for path in ("/dashboard", "/dashboard/options", "/dashboard/widgets/attention_queue"):
        assert c().get(path).status_code == 401, path
    options = c().get("/dashboard/options", headers=h(COMPLIANCE)).json()
    assert len(options["institution_types"]) == 4 and options["risk_categories"][:3] == ["Low", "Medium", "High"]


if __name__ == "__main__":
    run_module(globals())
