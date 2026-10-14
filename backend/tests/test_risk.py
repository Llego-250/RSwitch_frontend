"""Participant risk scoring tests (REQ-P360-009..012, §11.5, §18).

Tests:
- Three-category scoring (compliance, operational, technical)
- Insufficient history (< 3 months) returns status=insufficient_data
- Methodology is present on participant_risk()
- distribution() returns Low/Medium/High/Insufficient data counts
- outstanding_actions() combines all four action types
- API endpoints: GET /participants/{id}/risk-score, /outstanding-actions
- Weights are configurable via risk_weights setting
"""

from datetime import datetime, timedelta

from sqlmodel import Session, select

from tests.pipeline_support import (
    COMPLIANCE,
    TECHNICAL,
    BUSINESS,
    client,
    h,
    make_participant,
    run_module,
    setup_manual,
)

from app.db import engine
from app.models.participant import Participant
from app.services import risk as svc
from app.services.settings_store import put_setting


def c():
    return client()


def _participant_with_history(months: float) -> dict:
    """Create a participant whose created_at is `months` ago."""
    p = make_participant()
    with Session(engine) as s:
        row = s.get(Participant, p["id"])
        row.created_at = datetime.utcnow() - timedelta(days=int(months * 30))
        s.add(row)
        s.commit()
    return p


# ---- REQ-P360-012: insufficient history -------------------------------------

def test_insufficient_history_below_3_months():
    p = _participant_with_history(1.5)
    with Session(engine) as s:
        result = svc.participant_risk(s, p["id"])
    assert result is not None
    assert result["status"] == "insufficient_data"
    assert result["composite"] is None
    assert result["band"] is None
    assert result["months_of_history"] < 3


def test_sufficient_history_at_3_months():
    p = _participant_with_history(4)
    with Session(engine) as s:
        result = svc.participant_risk(s, p["id"])
    assert result is not None
    assert result["status"] == "scored"
    assert result["composite"] is not None
    assert 0 <= result["composite"] <= 100
    assert result["band"] in ("Low", "Medium", "High")


# ---- REQ-P360-009: methodology ----------------------------------------------

def test_methodology_present():
    p = _participant_with_history(4)
    with Session(engine) as s:
        result = svc.participant_risk(s, p["id"])
    assert "methodology" in result
    m = result["methodology"]
    assert "weights" in m
    assert "categories" in m
    assert "data_sources" in m
    assert "advisory" in m
    assert set(m["weights"]) == {"compliance", "operational", "technical"}


# ---- REQ-P360-010: three categories -----------------------------------------

def test_three_categories_present():
    p = _participant_with_history(4)
    with Session(engine) as s:
        result = svc.participant_risk(s, p["id"])
    assert result["status"] == "scored"
    cats = result["categories"]
    assert set(cats) == {"compliance", "operational", "technical"}
    for cat in cats.values():
        assert "score" in cat
        assert "weight" in cat
        assert "indicators" in cat
        assert 0 <= cat["score"] <= 100


# ---- REQ-P360-011: configurable weights -------------------------------------

def test_weights_configurable():
    p = _participant_with_history(4)
    with Session(engine) as s:
        put_setting(s, "risk_weights", {"technical": 60, "compliance": 30, "operational": 10})
        result = svc.participant_risk(s, p["id"])
    assert result["status"] == "scored"
    cats = result["categories"]
    # Weights should reflect the configured values (normalised to sum to 100)
    assert cats["technical"]["weight"] > cats["operational"]["weight"]
    # Reset
    with Session(engine) as s:
        put_setting(s, "risk_weights", {"integration": 30, "compliance": 30, "incidents": 20, "overdue": 20})


# ---- distribution() ---------------------------------------------------------

def test_distribution_shape():
    with Session(engine) as s:
        dist = svc.distribution(s)
    assert set(dist) == {"Low", "Medium", "High", "Insufficient data"}
    assert all(isinstance(v, int) for v in dist.values())
    assert sum(dist.values()) >= 0


# ---- latest_scores() --------------------------------------------------------

def test_latest_scores_sorted_riskiest_first():
    with Session(engine) as s:
        scores = svc.latest_scores(s)
    # Scored participants come before insufficient-data ones
    scored = [r for r in scores if r["status"] == "scored"]
    insufficient = [r for r in scores if r["status"] == "insufficient_data"]
    assert scores == scored + insufficient
    # Scored are sorted descending by composite
    composites = [r["composite"] for r in scored]
    assert composites == sorted(composites, reverse=True)


# ---- outstanding_actions() --------------------------------------------------

def test_outstanding_actions_shape():
    p = _participant_with_history(4)
    with Session(engine) as s:
        result = svc.outstanding_actions(s, p["id"])
    assert set(result) >= {"compliance", "remediation", "governance", "ai_alerts", "total"}
    assert result["total"] == (
        len(result["compliance"]) + len(result["remediation"]) +
        len(result["governance"]) + len(result["ai_alerts"])
    )


# ---- API endpoints ----------------------------------------------------------

def test_risk_score_api_insufficient():
    p = _participant_with_history(1)
    r = c().get(f"/participants/{p['id']}/risk-score", headers=h(COMPLIANCE))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "insufficient_data"
    assert body["message"] == "Insufficient data \u2014 score pending."
    assert body["composite"] is None


def test_risk_score_api_scored():
    p = _participant_with_history(4)
    r = c().get(f"/participants/{p['id']}/risk-score", headers=h(BUSINESS))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "scored"
    assert body["composite"] is not None
    assert "methodology" in body
    assert set(body["categories"]) == {"compliance", "operational", "technical"}


def test_risk_score_api_not_found():
    r = c().get("/participants/999999/risk-score", headers=h(TECHNICAL))
    assert r.status_code == 404


def test_outstanding_actions_api():
    p = _participant_with_history(4)
    r = c().get(f"/participants/{p['id']}/outstanding-actions", headers=h(COMPLIANCE))
    assert r.status_code == 200
    body = r.json()
    assert "total" in body
    assert "compliance" in body


def test_risk_score_requires_auth():
    r = c().get("/participants/1/risk-score")
    assert r.status_code == 401


if __name__ == "__main__":
    run_module(globals())
