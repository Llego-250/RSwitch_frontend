"""Participant 360 and risk assessment (SRS REQ-P360-001..014, §8.1, §10.1,
§11.5, §18, §19.2, REQ-AI-005).

Run against a seeded database, e.g.
    DATABASE_URL=sqlite:////tmp/p360.db STORAGE_BACKEND=local LOCAL_STORAGE_DIR=/tmp/p360-storage \
    RATE_LIMIT_ENABLED=false python -m app.seed_demo && python -m tests.test_participant360

Each test builds its own participant with fully controlled records, so the
file can be re-run against the same database."""

from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from sqlmodel import Session, delete, select

from tests.pipeline_support import BUSINESS, COMPLIANCE, TECHNICAL, client, h, make_participant, make_source, run_module

from app.db import engine
from app.models.admin import SystemSetting
from app.models.alert import AnomalyAlert
from app.models.compliance import ComplianceCycle, ComplianceRequirement
from app.models.enums import IntegrationStatus, IssueSeverity, IssueStatus, SubmissionResult
from app.models.governance import ActionItem
from app.models.integration import Integration
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.pipeline import PipelineJob
from app.models.risk import IntegrationStatusChange, ParticipantRiskScore
from app.models.submission import Submission
from app.models.user import User
from app.services import compliance as comp
from app.services import pipeline_runner, risk
from app.services.governance_jobs import org_zone
from app.services.settings_store import DEFAULTS

PENDING = "Insufficient data — score pending."


def c():
    return client()


# ---- fixtures --------------------------------------------------------------------

def _sub(s: Session, pid: int, at: datetime, *, failed: bool = False, integration_id=None) -> Submission:
    row = Submission(participant_id=pid, integration_id=integration_id, period=at.strftime("%B %Y"),
                     filename=f"P{pid}_{at:%Y%m%d}.csv", storage_key=f"test/{uuid4().hex}", uploaded_at=at,
                     uploaded_by="Test", result=SubmissionResult.failed if failed else SubmissionResult.passed,
                     status="Validation Failed" if failed else "Approved", records_received=10,
                     error_count=1 if failed else 0, loaded_at=None if failed else at + timedelta(minutes=2))
    s.add(row)
    return row


def scored_participant() -> dict:
    """A participant whose every §11.5 input is known exactly:
    integration uptime 90% (72 h Failed of the last 720 h), adherence 50%
    (3 of 6 deadlines met on time), overdue rate 33.33% (2 of 6 missed),
    3 incidents in the last 12 months; plus pipeline jobs (1 of 4 failed,
    10-minute latency) and 1 of 6 submissions failed validation."""
    p = make_participant()
    now = datetime.utcnow()
    with Session(engine) as s:
        today = comp.today_for(s)
        pid = p["id"]
        # Registered long ago: history counts from the first submission, not this.
        row = s.get(Participant, pid)
        row.created_at = now - timedelta(days=900)
        s.add(row)
        for months_ago in range(5, -1, -1):
            _sub(s, pid, now - timedelta(days=months_ago * 30 + 1), failed=months_ago == 2)

        integ = Integration(participant_id=pid, source_name="Core banking", status=IntegrationStatus.healthy,
                            created_at=now - timedelta(days=60), updated_at=now - timedelta(days=7))
        s.add(integ)
        s.flush()
        for at, status in ((now - timedelta(days=60), "Healthy"), (now - timedelta(days=10), "Failed"),
                           (now - timedelta(days=7), "Healthy")):
            s.add(IntegrationStatusChange(integration_id=integ.id, participant_id=pid, status=status, at=at, source="Test"))
        for i, status in enumerate(("Completed", "Completed", "Completed", "Failed")):
            done = now - timedelta(days=3 + i)
            s.add(PipelineJob(name=f"t{i}", participant_id=pid, integration_id=integ.id, status=status,
                              queued_at=done - timedelta(minutes=10), started_at=done - timedelta(minutes=9), finished_at=done))

        req = ComplianceRequirement(participant_id=pid, requirement_name="Monthly return", kind="Data Return",
                                    frequency="Monthly", due_date=today - timedelta(days=3), submission_status="Under Review")
        s.add(req)
        s.flush()

        def cycle(due: date, **fields):
            s.add(ComplianceCycle(requirement_id=req.id, due_date=due, period=due.strftime("%B %Y"),
                                  opened_at=datetime.combine(due - timedelta(days=30), time.min), **fields))

        def at(d: date, days: int) -> datetime:
            return datetime.combine(d, time(9)) + timedelta(days=days)

        dues = [today - timedelta(days=30 * k) for k in (6, 5, 4, 3, 2)] + [today - timedelta(days=3)]
        for due in dues[:3]:  # approved on time
            cycle(due, stage="Approved", status="Approved", on_time=True, submitted_at=at(due, -2), approved_at=at(due, -1))
        cycle(dues[3], stage="Approved", status="Approved", on_time=False, submitted_at=at(dues[3], 3),
              approved_at=at(dues[3], 5), overdue_at=at(dues[3], 1))  # approved late
        cycle(dues[4], stage="Pending", status="Overdue", overdue_at=at(dues[4], 1))  # never sent
        # A valid file received in time, still under review: neither met nor missed (§6.5).
        cycle(dues[5], stage="Under Review", status="Under Review", submitted_at=at(dues[5], -2))

        for days, sev, status, resolved in ((20, IssueSeverity.high, IssueStatus.resolved, 16),
                                            (100, IssueSeverity.low, IssueStatus.closed, 90),
                                            (5, IssueSeverity.critical, IssueStatus.open, None),
                                            (800, IssueSeverity.medium, IssueStatus.closed, 790)):
            s.add(Issue(participant_id=pid, description=f"Test incident {days}", severity=sev, status=status,
                        incident_date=(now - timedelta(days=days)).date(), created_at=now - timedelta(days=days),
                        resolved_at=now - timedelta(days=resolved) if resolved else None))
        s.commit()
        risk.recompute(s, trigger="On demand", participants=[s.get(Participant, pid)])
    return p


def _set_methodology(cfg: dict):
    return c().put("/participants/risk-methodology", json=cfg, headers=h(TECHNICAL))


def _reset_methodology():
    with Session(engine) as s:
        s.exec(delete(SystemSetting).where(SystemSetting.key.in_(("risk", "risk_weights"))))
        s.commit()


def _keys(obj) -> set[str]:
    if isinstance(obj, dict):
        return set(obj) | set().union(*(_keys(v) for v in obj.values())) if obj else set()
    if isinstance(obj, list):
        return set().union(*(_keys(v) for v in obj)) if obj else set()
    return set()


# ---- §11.5 default composite, P360-010 category/indicator math ---------------------

def test_default_composite_equals_srs_formula():
    _reset_methodology()
    p = scored_participant()
    with Session(engine) as s:
        r = risk.participant_risk(s, p["id"])
    assert r["status"] == "scored" and r["message"] is None
    ind = {k: v for cat in r["categories"].values() for k, v in cat["indicators"].items()}
    assert ind["integration_uptime"]["value"] == 90.0
    assert ind["submission_adherence_rate"]["value"] == 50.0
    assert ind["overdue_deadlines"]["value"] == 33.33
    assert ind["incident_frequency"]["value"] == 3
    # Default scales: uptime 100→0 / 80→100, adherence 100→0 / 0→100,
    # 0→6 incidents, overdue rate 0→100%.
    integration = (100 - 90) / (100 - 80) * 100
    adherence = 100 - 50
    incidents = 3 / 6 * 100
    overdue = 100 * 2 / 6
    srs = 0.30 * integration + 0.30 * adherence + 0.20 * incidents + 0.20 * overdue
    assert abs(r["composite"] - srs) < 0.051, (r["composite"], srs)
    assert r["components"] == {"integration": 50.0, "compliance": 50.0, "incidents": 50.0, "overdue": 33.3}
    assert r["band"] == "Medium"  # 33 ≤ 46.7 < 66
    m = r["methodology"]
    assert m["reproduces_srs_formula"] and m["is_default"]
    effective = {i["key"]: i["effective_weight"] for i in m["indicators"]}
    assert effective["integration_uptime"] == 30 and effective["submission_adherence_rate"] == 30
    assert effective["incident_frequency"] == 20 and effective["overdue_deadlines"] == 20
    assert sum(effective.values()) == 100


def test_indicator_measurements_match_their_definitions():
    p = scored_participant()
    with Session(engine) as s:
        r = risk.participant_risk(s, p["id"])
        adherence = comp.adherence_rate(s, p["id"], 12)
        failure = comp.failure_rate(s, p["id"], 12)
    ind = {k: v for cat in r["categories"].values() for k, v in cat["indicators"].items()}
    # Same figures the Compliance module reports (REQ-COMP-008, adherence).
    assert ind["submission_adherence_rate"]["value"] == adherence["rate_pct"]
    assert round(ind["rejection_history"]["value"], 1) == failure["rate_pct"] == 16.7
    assert ind["pipeline_failure_rate"]["value"] == 25.0 and ind["pipeline_failure_rate"]["score"] == 50.0
    assert ind["avg_submission_latency"]["value"] == 10.0 and ind["avg_submission_latency"]["score"] == 0.0
    # Severity: High 75, Low 25, Critical 100 (the 800-day-old one is out of the window).
    assert round(ind["incident_severity"]["value"], 1) == 66.7
    # Resolution: 4 and 10 days, plus the open one at 5 days so far → 6.33 days, under the 7-day 0-risk mark.
    assert round(ind["resolution_time"]["value"], 1) == 6.3 and ind["resolution_time"]["score"] == 0.0
    assert ind["incident_severity"]["weight"] == 0 and ind["incident_severity"]["contribution"] == 0  # measured, not weighted


def test_category_and_composite_math_with_custom_weights():
    p = scored_participant()
    cfg = deepcopy(DEFAULTS["risk"])
    cfg["category_weights"] = {"compliance": 40, "operational": 30, "technical": 30}
    for name, w in (("submission_adherence_rate", 50), ("overdue_deadlines", 25), ("rejection_history", 25),
                    ("incident_frequency", 40), ("incident_severity", 40), ("resolution_time", 20),
                    ("integration_uptime", 40), ("pipeline_failure_rate", 30), ("avg_submission_latency", 30)):
        cfg["indicators"][name]["weight"] = w
    try:
        r = _set_methodology(cfg)
        assert r.status_code == 200, r.text
        assert r.json()["recomputed"] > 0 and not r.json()["reproduces_srs_formula"]
        with Session(engine) as s:
            out = risk.participant_risk(s, p["id"])
        composite = 0.0
        for key, cat in out["categories"].items():
            rows = cat["indicators"].values()
            expected = sum(i["weight"] * i["score"] for i in rows) / sum(i["weight"] for i in rows)
            assert abs(cat["score"] - expected) < 0.06, (key, cat["score"], expected)
            composite += cfg["category_weights"][key] / 100 * expected
        assert abs(out["composite"] - composite) < 0.06
        contributions = sum(i["contribution"] for cat in out["categories"].values() for i in cat["indicators"].values())
        assert abs(contributions - out["composite"]) < 0.1
        top = max(((k, i["contribution"]) for cat in out["categories"].values() for k, i in cat["indicators"].items()),
                  key=lambda x: x[1])[0]
        assert out["top_factor"] == top
    finally:
        _reset_methodology()


def test_unmeasurable_indicators_are_left_out_and_weights_rescaled():
    """No compliance deadline fell due: the Compliance category can't be
    measured, so the composite is Operational and Technical rescaled."""
    p = make_participant()
    now = datetime.utcnow()
    with Session(engine) as s:
        for k in range(4, -1, -1):
            _sub(s, p["id"], now - timedelta(days=k * 30 + 1))
        s.commit()
        risk.recompute(s, participants=[s.get(Participant, p["id"])])
        r = risk.participant_risk(s, p["id"])
    assert r["status"] == "scored"
    compliance = r["categories"]["compliance"]
    assert compliance["score"] is None and not compliance["measured"] and compliance["applied_weight"] == 0
    assert compliance["indicators"]["submission_adherence_rate"]["detail"].startswith("No compliance deadline")
    # No data source either → Technical unmeasurable too; only Operational (0 incidents) is left.
    assert r["categories"]["technical"]["score"] is None
    assert r["categories"]["operational"]["applied_weight"] == 100 and r["composite"] == 0.0


# ---- REQ-P360-011 configurable methodology ---------------------------------------------

def test_methodology_validation_and_permissions():
    cfg = deepcopy(DEFAULTS["risk"])
    bad = deepcopy(cfg)
    bad["category_weights"]["technical"] = 20  # sums to 90
    r = _set_methodology(bad)
    assert r.status_code == 422 and {p["field"] for p in r.json()["detail"]} == {"category_weights"}
    bad = deepcopy(cfg)
    bad["indicators"]["overdue_deadlines"]["weight"] = 30  # compliance indicators sum to 90
    r = _set_methodology(bad)
    assert r.status_code == 422 and "indicators.compliance" in {p["field"] for p in r.json()["detail"]}
    bad = deepcopy(cfg)
    bad["indicators"]["integration_uptime"].update(good=90, bad=90)
    bad["bands"] = {"medium": 70, "high": 40}
    bad["lookback_months"] = 0
    fields = {p["field"] for p in _set_methodology(bad).json()["detail"]}
    assert fields == {"indicators.integration_uptime.thresholds", "bands", "lookback_months"}
    # Disabling an indicator means the rest of its category must carry 100.
    bad = deepcopy(cfg)
    bad["indicators"]["integration_uptime"]["enabled"] = False
    assert "indicators.technical" in {p["field"] for p in _set_methodology(bad).json()["detail"]}
    for email in (BUSINESS, COMPLIANCE):
        assert c().put("/participants/risk-methodology", json=cfg, headers=h(email)).status_code == 403
        assert c().post("/participants/risk-scores/recompute", headers=h(email)).status_code == 403
    # Everyone can read it (REQ-P360-009).
    for email in (BUSINESS, COMPLIANCE, TECHNICAL):
        m = c().get("/participants/risk-methodology", headers=h(email))
        assert m.status_code == 200 and len(m.json()["indicators"]) == 9


def test_changing_weights_recomputes_and_persists():
    _reset_methodology()
    p = scored_participant()
    with Session(engine) as s:
        before = risk.participant_risk(s, p["id"])["composite"]
    cfg = deepcopy(DEFAULTS["risk"])
    cfg["category_weights"] = {"compliance": 20, "operational": 20, "technical": 60}
    try:
        r = _set_methodology(cfg)
        assert r.status_code == 200 and r.json()["recomputed"] > 0
        with Session(engine) as s:
            latest = s.exec(select(ParticipantRiskScore).where(ParticipantRiskScore.participant_id == p["id"])
                            .order_by(ParticipantRiskScore.id.desc())).first()
            after = risk.participant_risk(s, p["id"])
            assert latest.trigger == "Settings change" and latest.composite == after["composite"] != before
            assert s.get(Participant, p["id"]).risk_score == after["composite"]
            assert after["categories"]["technical"]["weight"] == 60
        # A change made outside this endpoint (a direct settings write) is
        # detected by its hash and recalculated on the next read.
        with Session(engine) as s:
            from app.services.settings_store import put_setting

            put_setting(s, "risk", {"category_weights": {"compliance": 50, "operational": 20, "technical": 30}})
            again = risk.participant_risk(s, p["id"])
            assert again["trigger"] == "Settings change" and abs(again["composite"] - before) < 0.051
    finally:
        _reset_methodology()


def test_legacy_risk_weights_row_is_migrated():
    _reset_methodology()
    with Session(engine) as s:
        s.add(SystemSetting(key="risk_weights", value={"integration": 40, "compliance": 20, "incidents": 20, "overdue": 20}))
        s.commit()
        try:
            cfg, warning = risk.load_config(s)
            assert warning == ""
            assert cfg["category_weights"] == {"compliance": 40, "operational": 20, "technical": 40}
            assert cfg["indicators"]["submission_adherence_rate"]["weight"] == 50
            assert cfg["indicators"]["overdue_deadlines"]["weight"] == 50
            m = risk.methodology(s)
            effective = {i["key"]: i["effective_weight"] for i in m["indicators"]}
            assert (effective["integration_uptime"], effective["submission_adherence_rate"], effective["incident_frequency"],
                    effective["overdue_deadlines"]) == (40, 20, 20, 20)
            # An unusable stored value never breaks scoring.
            s.add(SystemSetting(key="risk", value={"category_weights": {"compliance": "lots"}}))
            s.commit()
            cfg, warning = risk.load_config(s)
            assert cfg == DEFAULTS["risk"] and "invalid" in warning
        finally:
            _reset_methodology()


# ---- REQ-P360-012 minimum history ---------------------------------------------------------

def test_insufficient_history_counts_from_first_submission():
    now = datetime.utcnow()
    old = make_participant()  # registered 2 years ago, first file 2 months ago
    new = make_participant()  # registered today, first file 4 months ago
    with Session(engine) as s:
        row = s.get(Participant, old["id"])
        row.created_at = now - timedelta(days=730)
        s.add(row)
        _sub(s, old["id"], now - timedelta(days=60))
        _sub(s, new["id"], now - timedelta(days=122), failed=True)  # failed attempts are history too
        s.commit()
        risk.recompute(s, participants=[s.get(Participant, old["id"]), s.get(Participant, new["id"])])
    r = c().get(f"/participants/{old['id']}/risk-score", headers=h(BUSINESS)).json()
    assert r["status"] == "insufficient_data" and r["message"] == PENDING
    assert r["composite"] is None and r["band"] is None and r["categories"] == {}
    assert r["months_of_history"] < 3 and r["eligible_from"] == (now - timedelta(days=60) + timedelta(days=91.32)).date().isoformat()
    assert c().get(f"/participants/{new['id']}/risk-score", headers=h(BUSINESS)).json()["status"] == "scored"
    none = make_participant()
    profile = c().get(f"/participants/{none['id']}", headers=h(COMPLIANCE)).json()
    assert profile["risk"]["message"] == PENDING and profile["risk_score"] is None
    with Session(engine) as s:
        assert s.get(Participant, old["id"]).risk_score is None
    # Everywhere it appears: distribution, AI priority list, risk ranking.
    ranking = {r["participant_id"]: r for r in c().get("/alerts/risk-ranking", headers=h(BUSINESS)).json()}
    assert ranking[old["id"]]["message"] == PENDING and ranking[old["id"]]["score"] is None
    rows = {r["participant_id"]: r for r in c().get("/alerts/priority", headers=h(BUSINESS)).json()["rows"]}
    assert rows[old["id"]]["risk_score"] is None and rows[old["id"]]["risk_status"] == "insufficient_data"
    assert any(PENDING in sig for sig in rows[old["id"]]["signals"])
    with Session(engine) as s:
        dist = risk.distribution(s)
    assert set(dist) == {"Low", "Medium", "High", "Insufficient data"} and dist["Insufficient data"] >= 2


# ---- §11.5 nightly recalculation, §18 history, §10.1 risk_score -------------------------

def test_nightly_job_persists_history_once_per_night():
    p = scored_participant()
    with Session(engine) as s:
        zone = org_zone(s)
        night = datetime(2020, 1, 15, 3, 0, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
        # Runs this test made on an earlier pass over the same database.
        s.exec(delete(ParticipantRiskScore).where(ParticipantRiskScore.computed_at >= datetime(2020, 1, 13),
                                                  ParticipantRiskScore.computed_at < datetime(2020, 1, 17)))
        s.commit()
        count = risk.run_nightly_if_due(s, night)
        assert count and count == len(s.exec(select(Participant)).all())
        rows = s.exec(select(ParticipantRiskScore).where(ParticipantRiskScore.trigger == "Nightly",
                                                         ParticipantRiskScore.computed_at == night)).all()
        assert len(rows) == count and all(r.config_hash for r in rows)
        assert risk.run_nightly_if_due(s, night + timedelta(hours=5)) is None  # same night: already done
        # 01:00 belongs to the previous night, which hasn't run.
        assert risk.run_nightly_if_due(s, night - timedelta(hours=2)) == count
        # A run as of 2020 never overwrites today's score on the participant.
        current = risk.participant_risk(s, p["id"])
        assert s.get(Participant, p["id"]).risk_score == current["composite"] is not None
        # Tonight's run (real time) updates Participant.risk_score and adds to the history.
        risk.recompute(s, trigger="Nightly", participants=[s.get(Participant, p["id"])])
        history = risk.score_history(s, p["id"])
        assert history[0]["trigger"] == "Nightly" and history[0]["composite"] == s.get(Participant, p["id"]).risk_score
        assert len(history) >= 3 and history[-1]["computed_at"].startswith("2020-01-1")
    from app.services.scheduler import run_nightly_risk

    run_nightly_risk()  # the scheduler entry point runs cleanly


def test_risk_score_endpoint_shape_and_methodology():
    p = scored_participant()
    for email in (COMPLIANCE, BUSINESS, TECHNICAL):
        r = c().get(f"/participants/{p['id']}/risk-score", headers=h(email))
        assert r.status_code == 200
    body = r.json()
    assert {"participant_id", "participant_name", "participant_type", "region", "status", "composite", "band", "categories",
            "components", "top_factor", "months_of_history", "computed_at", "history", "methodology"} <= set(body)
    assert set(body["categories"]) == {"compliance", "operational", "technical"}
    for cat in body["categories"].values():
        assert {"score", "weight", "indicators", "label"} <= set(cat) and len(cat["indicators"]) == 3
        for ind in cat["indicators"].values():
            assert {"value", "unit", "score", "detail", "inputs", "weight", "applied_weight"} <= set(ind)
    m = body["methodology"]
    assert m["minimum_history"] and m["recalculation"] and m["data_sources"] and m["scope"]
    for ind in m["indicators"]:
        assert ind["definition"] and ind["data_source"] and ind["scale"] and ind["window"]
    assert body["history"][0]["computed_at"] == body["computed_at"]
    assert c().get("/participants/999999/risk-score", headers=h(BUSINESS)).status_code == 404
    assert c().get(f"/participants/{p['id']}/risk-score").status_code == 401
    scores = c().get("/participants/risk-scores", headers=h(BUSINESS)).json()
    composites = [s["composite"] for s in scores if s["composite"] is not None]
    assert composites == sorted(composites, reverse=True) and scores[-1]["composite"] is None


# ---- REQ-P360-014 notes ----------------------------------------------------------------

def test_notes_compliance_writes_everyone_reads():
    p = make_participant()
    url = f"/participants/{p['id']}/notes"
    for email in (BUSINESS, TECHNICAL):
        assert c().post(url, json={"note": "Not allowed"}, headers=h(email)).status_code == 403
    r = c().post(url, json={"note": "  Licence renewal discussed with the CFO.  "}, headers=h(COMPLIANCE))
    assert r.status_code == 201 and r.json()["note"] == "Licence renewal discussed with the CFO."
    assert r.json()["author"]
    for email in (BUSINESS, TECHNICAL, COMPLIANCE):
        notes = c().get(url, headers=h(email))
        assert notes.status_code == 200 and notes.json()[0]["id"] == r.json()["id"]
    assert c().post(url, json={"note": "   "}, headers=h(COMPLIANCE)).status_code == 422
    assert c().post("/participants/999999/notes", json={"note": "x"}, headers=h(COMPLIANCE)).status_code == 404


# ---- REQ-P360-008 outstanding actions ----------------------------------------------------

def test_outstanding_actions_aggregates_rswitch_and_institution_items():
    p = make_participant()
    pid = p["id"]
    with Session(engine) as s:
        today = comp.today_for(s)
        owner = s.exec(select(User).where(User.email == COMPLIANCE)).first()
        due = ComplianceRequirement(participant_id=pid, requirement_name="Liquidity return", kind="Data Return",
                                    due_date=today + timedelta(days=10))
        review = ComplianceRequirement(participant_id=pid, requirement_name="Prudential return", kind="Data Return",
                                       due_date=today + timedelta(days=5))
        s.add(due)
        s.add(review)
        s.flush()
        s.add(ComplianceCycle(requirement_id=due.id, due_date=due.due_date, stage="Pending", status="Pending"))
        s.add(ComplianceCycle(requirement_id=review.id, due_date=review.due_date, stage="Under Review", status="Under Review",
                              submitted_at=datetime.utcnow()))
        inc = Issue(participant_id=pid, description="Duplicate transaction IDs", severity=IssueSeverity.high,
                    status=IssueStatus.remediation_in_progress, owner_id=owner.id)
        s.add(inc)
        s.flush()
        s.add(RemediationAction(incident_id=inc.id, description="Fix the export job", owner_id=owner.id,
                                due_date=today - timedelta(days=2)))
        s.add(ActionItem(description="Send UAT evidence", owner=p["name"], owner_participant_id=pid,
                         committee="Technical Working Group", due_date=today + timedelta(days=7)))
        s.add(ActionItem(description="Done already", owner=p["name"], owner_participant_id=pid, committee="TWG",
                         due_date=today, status="Completed", completed=True))
        s.add(AnomalyAlert(participant_id=pid, dedupe_key=f"test-{uuid4().hex}", indicator="Volume drop", baseline_value="100",
                           observed_value="40", deviation="-60%", recommended_area="Check the export", severity="HIGH",
                           baseline_method="Threshold", status="Under Investigation"))
        s.commit()
    body = c().get(f"/participants/{pid}/outstanding-actions", headers=h(BUSINESS)).json()
    # Required documents the new institution hasn't provided are its items too.
    docs = [i for i in body["items"] if i["kind"] == "document"]
    assert all(i["assigned_to"] == "Institution" and i["status"] == "Missing" for i in docs)
    kinds = {(i["kind"], i["assigned_to"]) for i in body["items"] if i["kind"] != "document"}
    assert kinds == {("compliance_submission", "Institution"), ("compliance_review", "RSwitch"), ("remediation", "RSwitch"),
                     ("governance", "Institution"), ("ai_alert", "RSwitch")}
    assert body["total"] == 5 + len(docs) and body["counts"]["RSwitch"] == 3 and body["counts"]["Institution"] == 2 + len(docs)
    assert body["counts"]["overdue"] == 1 and body["items"][0]["kind"] == "remediation"  # overdue first
    assert not any(i["title"] == "Done already" for i in body["items"])


# ---- profile (REQ-P360-001..007, §8.1, P360-013) ------------------------------------------

def test_profile_sections_and_no_data_exception():
    p = make_participant(type="SACCO", region="Northern Province", primary_contact_name="Jean Bosco",
                         primary_contact_email="jb@example.rw")
    body = c().get(f"/participants/{p['id']}", headers=h(TECHNICAL)).json()
    for field in ("name", "type", "registration_date", "status", "primary_contact_name", "risk_score"):
        assert field in body
    assert body["type"] == "SACCO" and body["assigned_contact"] == {"name": "Jean Bosco", "email": "jb@example.rw"}
    assert body["overall"]["status"] == "Active" and body["overall"]["health"] == "No open issues"
    sub = body["submissions"]
    assert sub["no_data"] and sub["message"] == "No data submitted yet" and sub["expected_due"]["date"]
    assert {"requirements", "upcoming_deadlines", "overdue", "documents", "summary"} <= set(body["compliance"])
    assert body["incidents"] == {"open": [], "resolved": []}
    perf = body["technical_performance"]
    assert perf["window_days"] == 30 and {"uptime_pct", "pipeline_failure_rate_pct", "avg_submission_latency_minutes"} <= set(perf)
    assert body["risk"]["message"] == PENDING
    assert c().get("/participants/999999", headers=h(BUSINESS)).status_code == 404

    p = scored_participant()
    body = c().get(f"/participants/{p['id']}", headers=h(BUSINESS)).json()
    assert body["integrations"][0]["uptime_pct_30d"] == 90.0
    assert body["technical_performance"]["uptime_pct"] == 90.0
    assert body["technical_performance"]["pipeline_failure_rate_pct"] == 25.0
    assert body["technical_performance"]["submission_failure_rate_pct"] is not None
    assert len(body["incidents"]["open"]) == 1 and len(body["incidents"]["resolved"]) == 3
    assert body["risk"]["composite"] == body["risk_score"] and "methodology" in body["risk"]
    assert any("unresolved incident" in a for a in body["overall"]["attention"])
    assert not body["submissions"]["no_data"] and body["submissions"]["months_of_history"] >= 4.9


def test_no_customer_level_data_in_participant_360():
    p = scored_participant()
    forbidden = {"customer", "customer_id", "customer_name", "account_number", "msisdn", "national_id",
                 "probability_of_default", "borrower", "breakdowns", "numeric_totals"}
    for path in (f"/participants/{p['id']}", f"/participants/{p['id']}/risk-score",
                 f"/participants/{p['id']}/outstanding-actions", "/participants/risk-scores"):
        body = c().get(path, headers=h(COMPLIANCE)).json()
        assert not (_keys(body) & forbidden), (path, _keys(body) & forbidden)
    assert "no individual customer data" in c().get(f"/participants/{p['id']}", headers=h(COMPLIANCE)).json()["scope_notice"]


def test_search_by_name_or_id():
    p = make_participant()
    for q in (str(p["id"]), p["code"], p["name"][-6:]):
        assert any(x["id"] == p["id"] for x in c().get(f"/participants?q={q}", headers=h(BUSINESS)).json())


# ---- uptime status history, REQ-AI-005 ---------------------------------------------------

def test_status_changes_are_recorded_for_uptime():
    p = make_participant()
    source = make_source(p["id"])
    with Session(engine) as s:
        integ = s.get(Integration, source["id"])
        start_status = IntegrationStatus(integ.status).value
        pipeline_runner.set_integration_status(s, integ, IntegrationStatus.failed, note="test", notify=False)
        pipeline_runner.set_integration_status(s, integ, IntegrationStatus.healthy, note="test", notify=False)
        rows = s.exec(select(IntegrationStatusChange).where(IntegrationStatusChange.integration_id == integ.id)
                      .order_by(IntegrationStatusChange.id)).all()
    statuses = [r.status for r in rows]
    assert statuses[-2:] == ["Failed", "Healthy"] and start_status in statuses[:-2]


def test_priority_list_uses_the_participant_risk_score():
    p = scored_participant()
    with Session(engine) as s:
        score = risk.participant_risk(s, p["id"])
    row = next(r for r in c().get("/alerts/priority", headers=h(COMPLIANCE)).json()["rows"] if r["participant_id"] == p["id"])
    assert row["risk_score"] == score["composite"] and row["risk_band"] == score["band"]
    assert row["composite_score"] == round(0.6 * score["composite"] + 0.4 * row["alert_points"], 1)
    assert row["risk_components"] == score["components"]


if __name__ == "__main__":
    run_module(globals())
