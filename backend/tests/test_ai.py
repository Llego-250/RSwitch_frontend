"""AI Decision Support checks (SRS §5.9 REQ-AI-001..012, §8.3, §9.3, §13).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/ai.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/ai-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_ai
(or under pytest). Every test builds its own participants, submissions and
users and restores any setting it changes, so assertions never depend on the
demo data and the file can be re-run against the same database."""

import os
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta
from uuid import uuid4

if "DATABASE_URL" not in os.environ:  # self-contained fallback
    _tmp = tempfile.mkdtemp(prefix="rdip-ai-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/ai.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from dateutil.relativedelta import relativedelta  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admin import Notification  # noqa: E402
from app.models.alert import AnomalyAlert  # noqa: E402
from app.models.enums import SubmissionResult, UserRole  # noqa: E402
from app.models.integration import Integration  # noqa: E402
from app.models.participant import Participant  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import anomaly, detectors  # noqa: E402
from app.services.detectors import Finding  # noqa: E402
from app.services.settings_store import DEFAULTS, get_setting, put_setting  # noqa: E402

_client: TestClient | None = None
_users: dict[str, User] = {}


def client() -> TestClient:
    """One app instance for the run; the scheduler is stopped so its 15-minute
    jobs can't race the assertions."""
    global _client
    if _client is None:
        _client = TestClient(app, raise_server_exceptions=False)
        _client.__enter__()
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None:
            scheduler.shutdown(wait=True)
    return _client


def user(kind: str) -> User:
    """compliance | business | technical | senior_compliance | senior_business."""
    client()  # app startup creates the tables on a fresh database
    if kind not in _users:
        role = {"compliance": UserRole.compliance, "business": UserRole.business, "technical": UserRole.technical,
                "senior_compliance": UserRole.compliance, "senior_business": UserRole.business}[kind]
        email = f"ai-{kind}-{uuid4().hex[:8]}@rswitch.rw"
        with Session(engine) as s:
            u = User(email=email, full_name=f"AI test {kind}", role=role, hashed_password=hash_password("Strong-Pass-2026!"),
                     is_senior=kind.startswith("senior"))
            s.add(u)
            s.commit()
            s.refresh(u)
            _users[kind] = u
    return _users[kind]


def auth(kind: str) -> dict:
    client()
    return {"Authorization": f"Bearer {create_access_token(user(kind).email)}"}


def month_start(offset: int) -> datetime:
    now = datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - relativedelta(months=offset)


def at(offset: int, day: int = 5) -> datetime:
    """A moment in the month `offset` months ago (never in the future)."""
    return min(month_start(offset) + timedelta(days=day - 1, hours=10), datetime.utcnow() - timedelta(hours=1))


def make_participant(months: int, *, kind: str = "SACCO", prefix: str = "AI", failures: tuple = (), amounts=None,
                     extra: int = 0) -> Participant:
    """A participant with one transaction file per month for `months` months
    (offset months-1 … 0). `failures` lists month offsets that get an extra
    failed upload; `amounts` maps an offset to that month's reported value."""
    client()
    code = f"{prefix}{uuid4().hex[:6].upper()}"
    with Session(engine) as s:
        p = Participant(name=f"{prefix}-{code}", code=code, short_name=code, type=kind, region="Kigali City",
                        expected_frequency_days=30, created_at=month_start(months) + timedelta(days=1))
        s.add(p)
        s.commit()
        s.refresh(p)
        s.add(Integration(participant_id=p.id))
        for offset in range(months - 1, -1, -1):
            add_submission(s, p, offset, amount=(amounts or {}).get(offset, 1000.0))
            if offset in failures:
                add_submission(s, p, offset, failed=True, day=7)
        for i in range(extra):
            add_submission(s, p, 0, failed=True, day=8 + i)
        s.commit()
        s.refresh(p)
        return p


def add_submission(s: Session, p: Participant, offset: int, *, failed: bool = False, amount: float = 1000.0,
                   day: int = 5) -> Submission:
    when = at(offset, day)
    sub = Submission(
        participant_id=p.id, period=when.strftime("%B %Y"), filename=f"{p.code}_{when:%Y%m}.csv", storage_key="",
        uploaded_at=when, uploaded_by="test",
        result=SubmissionResult.failed if failed else SubmissionResult.passed,
        error_count=2 if failed else 0,
        errors=[{"row": 3, "column": "amount", "rule": "type", "description": "Expected a number value"}] * 2 if failed else [],
        row_count=0 if failed else 10, numeric_totals={} if failed else {"amount": amount},
    )
    s.add(sub)
    s.commit()
    s.refresh(sub)
    return sub


def alerts_for(p: Participant) -> list[AnomalyAlert]:
    with Session(engine) as s:
        return list(s.exec(select(AnomalyAlert).where(AnomalyAlert.participant_id == p.id).order_by(AnomalyAlert.id)).all())


def detect(method: str | None = None) -> None:
    with Session(engine) as s:
        anomaly.detect(s, method=method)


@contextmanager
def anomaly_settings(**changes):
    with Session(engine) as s:
        before = get_setting(s, "anomaly")
        put_setting(s, "anomaly", changes)
    try:
        yield
    finally:
        with Session(engine) as s:
            put_setting(s, "anomaly", before)


def make_alert(p: Participant, status: str, severity: str = "MEDIUM") -> AnomalyAlert:
    """An alert placed directly at `status` (for lifecycle checks)."""
    with Session(engine) as s:
        a = AnomalyAlert(participant_id=p.id, dedupe_key=f"test:{uuid4().hex}", signal_key=f"test:{uuid4().hex}",
                         indicator="Test indicator", baseline_value="1", observed_value="2", deviation="+100%",
                         recommended_area="Test area", severity=severity, baseline_method="R1 — Configured thresholds",
                         baseline_method_key="threshold", status=status)
        s.add(a)
        s.commit()
        s.refresh(a)
        return a


def move(alert_id: int, status: str, kind: str = "compliance", note: str = "A note from the tester", **extra):
    return client().post(f"/alerts/{alert_id}/transition", json={"status": status, "note": note, **extra}, headers=auth(kind))


SUMMARY = "Root cause found and fixed with the institution."  # ≥ 20 characters


def notifications(u: User, event: str, link: str) -> list[Notification]:
    with Session(engine) as s:
        return list(s.exec(select(Notification).where(Notification.user_id == u.id, Notification.event == event,
                                                       Notification.link == link)).all())


# ---- REQ-AI-006 / 006a / 006c lifecycle ----------------------------------------------------

def test_every_allowed_and_disallowed_transition():
    p = make_participant(1, prefix="LC")
    for source in anomaly.STATUSES:
        for target in anomaly.STATUSES:
            if source == target:
                continue
            a = make_alert(p, source)
            r = move(a.id, target, resolution_summary=SUMMARY)
            if source == anomaly.CLOSED:
                assert r.status_code == 409, (source, target, r.text)
            elif target in anomaly.TRANSITIONS[source]:
                assert r.status_code == 200, (source, target, r.text)
                assert r.json()["status"] == target
            else:
                assert r.status_code == 422, (source, target, r.text)
    # The graph is exactly the SRS lifecycle: no shortcut to Closed, no skipping Acknowledged.
    assert anomaly.TRANSITIONS[anomaly.GENERATED] == (anomaly.ACKNOWLEDGED,)
    assert anomaly.CLOSED not in anomaly.TRANSITIONS[anomaly.GENERATED]
    assert anomaly.TRANSITIONS[anomaly.CLOSED] == ()


def test_generated_cannot_skip_acknowledged():
    a = make_alert(make_participant(1, prefix="SK"), anomaly.GENERATED)
    r = move(a.id, anomaly.INVESTIGATING)
    assert r.status_code == 422
    problem = r.json()["detail"][0]
    assert problem["field"] == "status" and problem["rule"] == "acknowledge_first"
    assert "Acknowledged" in problem["message"] or "acknowledge" in problem["message"]
    assert move(a.id, anomaly.ACKNOWLEDGED, note="Seen it").status_code == 200
    assert move(a.id, anomaly.INVESTIGATING, note="Looking into it").status_code == 200


def test_every_transition_needs_a_note_and_is_logged():
    a = make_alert(make_participant(1, prefix="NT"), anomaly.GENERATED)
    for blank in ("", "   "):
        r = move(a.id, anomaly.ACKNOWLEDGED, note=blank)
        assert r.status_code == 422
        assert r.json()["detail"][0]["field"] == "note"
    r = move(a.id, anomaly.ACKNOWLEDGED, note="Awareness note", kind="business")
    assert r.status_code == 200
    entry = r.json()["notes"][-1]
    assert entry["text"] == "Awareness note" and entry["from"] == "Generated" and entry["to"] == "Acknowledged"
    assert entry["user_id"] == user("business").id and entry["user"] == user("business").full_name and entry["date"]


def test_investigation_is_assigned_to_a_user():
    a = make_alert(make_participant(1, prefix="AS"), anomaly.ACKNOWLEDGED)
    r = move(a.id, anomaly.INVESTIGATING, assignee_id=user("technical").id)
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "assignee_id"
    r = move(a.id, anomaly.INVESTIGATING, assignee_id=user("business").id)
    assert r.status_code == 200
    assert r.json()["assignee_id"] == user("business").id
    b = make_alert(make_participant(1, prefix="AS"), anomaly.ACKNOWLEDGED)
    r = move(b.id, anomaly.INVESTIGATING, kind="compliance")  # defaults to the acting user
    assert r.json()["assignee_id"] == user("compliance").id


def test_close_needs_resolution_summary_of_20_chars():
    a = make_alert(make_participant(1, prefix="CL"), anomaly.RESOLVED)
    r = move(a.id, anomaly.CLOSED, resolution_summary="x" * 19)
    assert r.status_code == 422 and r.json()["detail"][0]["field"] == "resolution_summary"
    r = move(a.id, anomaly.CLOSED, resolution_summary="  " + "y" * 19 + "  ")  # whitespace doesn't count
    assert r.status_code == 422
    r = move(a.id, anomaly.CLOSED, resolution_summary="z" * 20)
    assert r.status_code == 200
    assert r.json()["resolution_summary"] == "z" * 20 and r.json()["read_only"] and r.json()["closed_at"]


def test_closed_alert_is_read_only():
    a = make_alert(make_participant(1, prefix="RO"), anomaly.ESCALATED)
    assert move(a.id, anomaly.CLOSED, resolution_summary=SUMMARY).status_code == 200
    for target in anomaly.STATUSES:
        r = move(a.id, target, resolution_summary=SUMMARY)
        assert r.status_code == 409, r.text
        assert "cannot be reopened" in r.json()["detail"]
    detail = client().get(f"/alerts/{a.id}", headers=auth("business")).json()
    assert detail["status"] == "Closed" and detail["allowed_next"] == []


def test_technical_cannot_transition_but_can_view():
    a = make_alert(make_participant(1, prefix="TQ"), anomaly.GENERATED)
    r = move(a.id, anomaly.ACKNOWLEDGED, kind="technical")
    assert r.status_code == 403
    assert r.json()["detail"] == "You do not have permission to perform this action."
    for kind in ("compliance", "business", "technical"):
        for path in ("/alerts", f"/alerts/{a.id}", "/alerts/engine", "/alerts/priority", "/alerts/trends"):
            assert client().get(path, headers=auth(kind)).status_code == 200, (kind, path)
    # "Run scan now" is ai.manage — Business only (SRS §12.1).
    assert client().post("/alerts/detect", headers=auth("business")).status_code == 200
    for kind in ("compliance", "technical"):
        assert client().post("/alerts/detect", headers=auth(kind)).status_code == 403


# ---- detection, recurrence, escalation ----------------------------------------------------

def test_alert_has_srs_fields_and_drilldown():
    p = make_participant(5, prefix="FD", failures=(0,))
    detect()
    [a] = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    for field in ("indicator", "baseline_value", "observed_value", "deviation", "recommended_area", "baseline_method",
                  "methodology"):
        assert getattr(a, field), field
    assert "amount" in a.recommended_area  # names the failing column (explainable)
    assert a.data_sources and a.source_submission_ids and a.detector.startswith("app.services.detectors.")
    d = client().get(f"/alerts/{a.id}", headers=auth("compliance")).json()
    assert d["participant_name"] == p.name and d["participant_link"] == f"/participant?id={p.id}"
    assert {s["id"] for s in d["sources"]} == set(a.source_submission_ids)
    failed = [s for s in d["sources"] if s["result"] == "Failed"]
    assert failed and failed[0]["error_fields"] == {"amount": 2}
    assert all("errors" not in s for s in d["sources"])  # aggregate metadata only


def test_generated_alert_notifies_business_and_compliance():
    for kind in ("compliance", "business", "technical"):
        user(kind)
    p = make_participant(5, prefix="NG", failures=(0,))
    detect()
    [a] = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    link = f"/ai?alert={a.id}"
    assert len(notifications(user("compliance"), "ai_alert_generated", link)) == 1
    assert len(notifications(user("business"), "ai_alert_generated", link)) == 1
    assert notifications(user("technical"), "ai_alert_generated", link) == []
    detect()  # a re-scan never notifies twice
    assert len(notifications(user("business"), "ai_alert_generated", link)) == 1


def test_recurrence_after_closure_creates_new_alert():
    p = make_participant(5, prefix="RC", failures=(1,))
    detect()
    [first] = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    assert move(first.id, anomaly.ACKNOWLEDGED, note="Seen").status_code == 200
    assert move(first.id, anomaly.INVESTIGATING, note="Checking").status_code == 200
    assert move(first.id, anomaly.RESOLVED, note="Fixed").status_code == 200
    assert move(first.id, anomaly.CLOSED, note="Done", resolution_summary=SUMMARY).status_code == 200
    detect()  # same evidence: still one alert
    assert len([x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]) == 1
    with Session(engine) as s:
        add_submission(s, p, 0, failed=True, day=9)  # the issue recurs
    detect()
    rows = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    assert len(rows) == 2
    assert rows[0].status == "Closed" and rows[1].status == "Generated"
    assert rows[1].recurrence_of == first.id
    detect()
    assert len([x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]) == 2


def test_open_alert_absorbs_new_evidence_and_escalates_when_worse():
    senior_c, senior_b = user("senior_compliance"), user("senior_business")
    p = make_participant(5, prefix="SV", failures=(0,))
    detect()
    [a] = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    initial = a.severity  # 1 failed of 4 submissions over 3 months
    assert move(a.id, anomaly.ACKNOWLEDGED, note="Seen").status_code == 200
    with Session(engine) as s:
        for day in (10, 11, 12, 13, 14):
            add_submission(s, p, 0, failed=True, day=day)
    detect()
    rows = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    assert len(rows) == 1, "still the same open issue"
    a = rows[0]
    assert a.status == "Escalated" and anomaly.RANK[a.severity] > anomaly.RANK[initial]
    assert any("Severity increased" in n["text"] and n.get("to") == "Escalated" for n in a.notes)
    link = f"/ai?alert={a.id}"
    assert len(notifications(senior_c, "ai_alert_escalated", link)) == 1
    assert len(notifications(senior_b, "ai_alert_escalated", link)) == 1
    detect()
    assert len(notifications(senior_c, "ai_alert_escalated", link)) == 1


def test_auto_escalation_after_configured_days_with_senior_notification_dedupe():
    senior_c, senior_b, plain = user("senior_compliance"), user("senior_business"), user("compliance")
    p = make_participant(1, prefix="AE")
    stale, fresh = make_alert(p, anomaly.ACKNOWLEDGED), make_alert(p, anomaly.ACKNOWLEDGED)
    with Session(engine) as s:
        for a, days in ((stale, 4), (fresh, 2)):
            row = s.get(AnomalyAlert, a.id)
            row.status_changed_at = datetime.utcnow() - timedelta(days=days)
            s.add(row)
        s.commit()
    with Session(engine) as s:
        assert anomaly.config(s)["auto_escalate_days"] == 3
        anomaly.auto_escalate(s)
        anomaly.auto_escalate(s)  # idempotent
    with Session(engine) as s:
        assert s.get(AnomalyAlert, stale.id).status == "Escalated"
        assert s.get(AnomalyAlert, fresh.id).status == "Acknowledged"
        assert "Auto-escalated" in s.get(AnomalyAlert, stale.id).notes[-1]["text"]
    link = f"/ai?alert={stale.id}"
    assert len(notifications(senior_c, "ai_alert_escalated", link)) == 1
    assert len(notifications(senior_b, "ai_alert_escalated", link)) == 1
    assert notifications(plain, "ai_alert_escalated", link) == []  # seniors only (they exist)
    # The threshold is a setting (REQ-AI-006b: adjustable by Technical/Admin).
    with anomaly_settings(auto_escalate_days=1):
        with Session(engine) as s:
            anomaly.auto_escalate(s)
            assert s.get(AnomalyAlert, fresh.id).status == "Escalated"


# ---- §8.3 insufficient history, REQ-AI-010/011 baselines ------------------------------------

def test_insufficient_history_suppresses_alerts():
    p = make_participant(2, prefix="IH", failures=(0, 1), extra=3)
    detect()
    assert alerts_for(p) == []
    engine_status = client().get("/alerts/engine", headers=auth("business")).json()
    row = next(x for x in engine_status["insufficient_history"] if x["participant_id"] == p.id)
    assert row["insufficient_history"] and "Insufficient history" in row["insufficient_history_reason"]
    pr = client().get("/alerts/priority", headers=auth("business")).json()
    assert next(r for r in pr["rows"] if r["participant_id"] == p.id)["insufficient_history"]
    with anomaly_settings(min_history_months=1):  # configurable (default 3); checked without recording
        with Session(engine) as s:
            _, _, findings = anomaly._run_detectors(s)
        assert any(f.participant_id == p.id for f in findings)


class FakeDetector:
    """A plug-in detector loaded only through the settings (REQ-AI-010)."""

    name = "Test plug-in"
    method = "*"
    description = "Flags participants whose name starts with PLUGIN-."

    def detect(self, ctx):
        return [
            Finding(participant_id=h.participant.id, indicator_code="plugin_signal", indicator="Plug-in signal",
                    evidence_key=f"last{h.last_submission.id}", baseline_value="0", observed_value="1",
                    deviation="+1", deviation_pct=None, severity="LOW", recommended_area="Nothing — test",
                    baseline_method_key="threshold", methodology="Test", data_sources=["Test"],
                    source_submission_ids=[h.last_submission.id])
            for h in ctx.eligible("*") if h.participant.name.startswith("PLUGIN-")
        ]


def test_detector_is_loaded_from_configured_import_path():
    p = make_participant(5, prefix="PLUGIN", failures=(0,))
    path = "tests.test_ai:FakeDetector"
    original = detectors.PLUGIN_PACKAGES
    try:
        # Outside the plug-in packages a path is refused, whatever it names.
        assert not detectors.load_detector(path).detector
        detectors.PLUGIN_PACKAGES = (*original, "tests")
        with anomaly_settings(detectors=[path, "app.services.detectors.nope:Missing"]):
            detect()
            rows = alerts_for(p)
            assert [a.indicator_code for a in rows] == ["plugin_signal"], "only the configured detector ran"
            assert rows[0].detector == path
            status = client().get("/alerts/engine", headers=auth("technical")).json()
            info = {d["path"]: d for d in status["detectors"]}
            assert info[path]["loaded"] and info[path]["name"] == "Test plug-in"
            assert not info["app.services.detectors.nope:Missing"]["loaded"]
        detect()  # back to the default detectors
        assert {a.indicator_code for a in alerts_for(p)} >= {"plugin_signal", "validation_failure_rate"}
    finally:
        detectors.PLUGIN_PACKAGES = original


def test_rolling_baseline_requires_six_months():
    short = make_participant(6, prefix="R5", failures=(0,))  # 5 prior months
    long = make_participant(8, prefix="R7", failures=(0,))  # 7 prior months
    with anomaly_settings(baseline_method="rolling"):
        status = {r["participant_id"]: r for r in client().get("/alerts/engine", headers=auth("business")).json()["participants"]}
        assert status[short.id]["method"] == "threshold"
        assert "6 months" in status[short.id]["fallback_reason"]
        assert status[long.id]["method"] == "rolling" and not status[long.id]["fallback_reason"]
        detect()
    [s_alert] = [a for a in alerts_for(short) if a.indicator_code == "validation_failure_rate"]
    [l_alert] = [a for a in alerts_for(long) if a.indicator_code == "validation_failure_rate"]
    assert s_alert.baseline_method_key == "threshold" and s_alert.baseline_method.startswith("R1")
    assert l_alert.baseline_method_key == "rolling" and l_alert.baseline_method.startswith("R2")
    assert "previous 6 reporting months" in l_alert.methodology  # rolling window (≥ 6)


def test_peer_group_baseline():
    kind = f"Peer-{uuid4().hex[:6]}"  # isolated peer group
    target = make_participant(5, kind=kind, prefix="PG", failures=(0, 1))
    lone = make_participant(5, kind=f"Lone-{uuid4().hex[:6]}", prefix="PL", failures=(0,))
    make_participant(5, kind=kind, prefix="PG")
    make_participant(5, kind=kind, prefix="PG")
    with anomaly_settings(baseline_method="peer"):
        status = {r["participant_id"]: r for r in client().get("/alerts/engine", headers=auth("business")).json()["participants"]}
        assert status[target.id]["method"] == "peer"
        assert status[lone.id]["method"] == "threshold" and "Peer-group" in status[lone.id]["fallback_reason"]
        detect()
    [a] = [x for x in alerts_for(target) if x.indicator_code == "validation_failure_rate"]
    assert a.baseline_method_key == "peer" and a.baseline_method.startswith("R3")
    assert "median of 2 other" in a.baseline_value
    filtered = client().get("/alerts?method=peer", headers=auth("compliance")).json()
    assert a.id in {x["id"] for x in filtered}


def test_detection_is_advisory_only():
    p = make_participant(5, prefix="ADV", failures=(0,), extra=4)
    with Session(engine) as s:
        before_p = {x.id: (x.status, x.is_active) for x in s.exec(select(Participant)).all()}
        before_i = {x.id: (x.status, x.paused) for x in s.exec(select(Integration)).all()}
    detect()
    [a] = [x for x in alerts_for(p) if x.indicator_code == "validation_failure_rate"]
    assert move(a.id, anomaly.ACKNOWLEDGED, note="Seen").status_code == 200
    with Session(engine) as s:
        anomaly.auto_escalate(s)
        assert {x.id: (x.status, x.is_active) for x in s.exec(select(Participant)).all()} == before_p
        assert {x.id: (x.status, x.paused) for x in s.exec(select(Integration)).all()} == before_i


# ---- REQ-AI-005/007/012 --------------------------------------------------------------------

def test_priority_list_and_trends_explain_themselves():
    pr = client().get("/alerts/priority", headers=auth("compliance")).json()
    assert pr["methodology"] and pr["data_sources"]
    scores = [r["composite_score"] for r in pr["rows"]]
    assert scores == sorted(scores, reverse=True) and [r["rank"] for r in pr["rows"]] == list(range(1, len(scores) + 1))
    t = client().get("/alerts/trends", headers=auth("compliance")).json()
    assert len(t["months"]) == 3 and len(t["operational"]) == 3 and len(t["compliance"]) == 3
    assert all(m["source"] for m in t["metrics"]) and t["methodology"]
    assert len(client().get("/alerts/trends?months=6", headers=auth("compliance")).json()["months"]) == 6


def test_every_anomaly_setting_is_accepted_and_validated():
    keys = set(DEFAULTS["anomaly"])
    assert {"volume_deviation_pct", "error_rate_pct", "failure_rate_change_pp", "auto_escalate_days",
            "min_history_months", "baseline_method", "severity_bands", "detectors"} <= keys
    with Session(engine) as s:
        current = get_setting(s, "anomaly")
    r = client().put("/settings/anomaly", json=current, headers=auth("technical"))
    assert r.status_code == 200 and set(r.json()) >= keys
    assert client().put("/settings/anomaly", json=current, headers=auth("business")).status_code == 403
    bad = {"error_rate_pct": 0, "rolling_window_months": 3, "baseline_method": "ml",
           "severity_bands": {"medium": 3, "high": 2, "critical": 4}, "detectors": ["os:system"]}
    r = client().post("/alerts/settings/validate", json=bad, headers=auth("technical"))
    fields = {p["field"] for p in r.json()["errors"]}
    assert fields == set(bad), r.json()
    r = client().post("/alerts/settings/validate", json={"error_rate_pct": 25}, headers=auth("technical"))
    assert r.json()["errors"] == []
    # A bad stored value never breaks detection: it falls back to the default.
    with anomaly_settings(error_rate_pct="lots"):
        with Session(engine) as s:
            assert anomaly.config(s)["error_rate_pct"] == DEFAULTS["anomaly"]["error_rate_pct"]
            anomaly.detect(s)


if __name__ == "__main__":
    failures = 0
    for name, fn in [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]:
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
