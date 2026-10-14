"""Dashboard tests (SRS §15.1–15.3, DASH-001..010)."""

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


def test_compliance_dashboard_shape():
    r = c().get("/dashboard/compliance", headers=h(COMPLIANCE))
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["overdue_submissions"], int)
    assert isinstance(d["upcoming_deadlines"], list)
    assert set(d["open_incidents"]) >= {"Critical", "High", "Medium", "Low", "total"}
    assert set(d["compliance_rate_30d"]) >= {"rate_pct", "on_time", "total", "window_start"}
    assert set(d["overdue_action_items"]) == {"governance", "incident_remediation", "total"}
    assert isinstance(d["recent_activity"], list)
    assert len(d["recent_activity"]) <= 10
    assert "attention_queue" in d


def test_compliance_dashboard_accessible_by_all_roles():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        assert c().get("/dashboard/compliance", headers=h(email)).status_code == 200


def test_business_dashboard_shape():
    r = c().get("/dashboard/business", headers=h(BUSINESS))
    assert r.status_code == 200
    d = r.json()
    assert set(d["integration_health"]) >= {"total", "healthy", "warning", "failed"}
    assert isinstance(d["unacknowledged_alerts"], int)
    assert set(d["risk_distribution"]) == {"Low", "Medium", "High", "Insufficient data"}
    assert isinstance(d["recent_reports"], list)
    assert set(d["compliance_rate_30d"]) >= {"rate_pct", "on_time", "total"}
    assert "attention_queue" in d
    assert "recent_activity" in d


def test_business_dashboard_accessible_by_all_roles():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        assert c().get("/dashboard/business", headers=h(email)).status_code == 200


def test_technical_dashboard_shape():
    r = c().get("/dashboard/technical", headers=h(TECHNICAL))
    assert r.status_code == 200
    d = r.json()
    ps = d["pipeline_summary"]
    assert set(ps) >= {"active_today", "failed_today", "queue_depth", "total_today"}
    assert isinstance(d["failed_integrations"], list)
    assert isinstance(d["data_freshness"], list)
    assert set(d["system_health"]) >= {"error_rate_1h", "queue_depth"}
    assert isinstance(d["draft_mappings_count"], int)
    assert isinstance(d["last_pipeline_runs"], list)
    assert len(d["last_pipeline_runs"]) <= 10
    assert "attention_queue" in d
    assert "recent_activity" in d


def test_technical_dashboard_accessible_by_all_roles():
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        assert c().get("/dashboard/technical", headers=h(email)).status_code == 200


def test_generic_dashboard_routes_by_role():
    r = c().get("/dashboard?role=compliance", headers=h(COMPLIANCE))
    assert r.status_code == 200 and "overdue_submissions" in r.json()

    r = c().get("/dashboard?role=business", headers=h(BUSINESS))
    assert r.status_code == 200 and "integration_health" in r.json()

    r = c().get("/dashboard?role=technical", headers=h(TECHNICAL))
    assert r.status_code == 200 and "pipeline_summary" in r.json()


def test_attention_queue_shape():
    for url in ("/dashboard/compliance", "/dashboard/business", "/dashboard/technical"):
        r = c().get(url, headers=h(COMPLIANCE))
        assert r.status_code == 200
        queue = r.json()["attention_queue"]
        assert isinstance(queue, list)
        for item in queue:
            assert set(item) >= {"id", "type", "severity", "title", "link"}


def test_integration_health_counts_sum():
    r = c().get("/dashboard/business", headers=h(BUSINESS))
    h_ = r.json()["integration_health"]
    assert h_["total"] == h_["healthy"] + h_["warning"] + h_["failed"]


def test_recent_activity_shape():
    r = c().get("/dashboard/compliance", headers=h(COMPLIANCE))
    for entry in r.json()["recent_activity"]:
        assert set(entry) >= {"timestamp", "action", "actor"}


def test_dashboard_requires_auth():
    for url in ("/dashboard", "/dashboard/compliance", "/dashboard/business", "/dashboard/technical"):
        assert c().get(url).status_code == 401


if __name__ == "__main__":
    run_module(globals())
