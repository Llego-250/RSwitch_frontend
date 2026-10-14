"""Participant 360 tests (REQ-P360-001..014, §8.1, §10.1, §19.2).

Tests:
- Profile fields (§10.1): type, region, registration_date, contact, status
- Compliance section (P360-005): uses compliance.participant_compliance
- Risk score (P360-009..012): via /participants/{id}/risk-score
- Technical performance (P360-007): integration status, pipeline failure rate, latency
- Outstanding actions (P360-008): combined pending items
- Notes (P360-014): Compliance only
- Empty state (§8.1): no submissions → "No data submitted yet"
- No customer-level indicators (P360-013)
- ?id= routing: /participant?id= links from alerts
"""

from datetime import datetime, timedelta

from sqlmodel import Session

from tests.pipeline_support import (
    BUSINESS,
    COMPLIANCE,
    TECHNICAL,
    client,
    h,
    make_participant,
    run_module,
)

from app.db import engine
from app.models.participant import Participant


def c():
    return client()


def _aged_participant(months: float = 4) -> dict:
    p = make_participant()
    with Session(engine) as s:
        row = s.get(Participant, p["id"])
        row.created_at = datetime.utcnow() - timedelta(days=int(months * 30))
        s.add(s)
        s.commit()
    return p


# ---- §10.1 profile fields ---------------------------------------------------

def test_participant_profile_fields():
    p = make_participant(
        type="Commercial Bank",
        region="Kigali City",
        primary_contact_name="Jean Bosco",
        primary_contact_email="jb@example.rw",
    )
    r = c().get(f"/participants/{p['id']}", headers=h(COMPLIANCE))
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "Commercial Bank"
    assert body["region"] == "Kigali City"
    assert body["primary_contact_name"] == "Jean Bosco"
    assert body["primary_contact_email"] == "jb@example.rw"
    assert "status" in body
    assert "registration_date" in body


# ---- REQ-P360-005: compliance section ---------------------------------------

def test_compliance_section():
    p = make_participant()
    r = c().get(f"/compliance/participants/{p['id']}", headers=h(BUSINESS))
    assert r.status_code == 200
    body = r.json()
    assert "participant" in body
    assert "summary" in body
    assert "requirements" in body
    assert "upcoming_deadlines" in body
    assert "overdue" in body
    assert "documents" in body
    assert set(body["summary"]) >= {"requirements", "approved", "pending", "in_review", "needs_correction", "overdue"}


# ---- §8.1 empty state -------------------------------------------------------

def test_empty_state_no_submissions():
    p = make_participant()
    r = c().get(f"/participants/{p['id']}/submissions", headers=h(COMPLIANCE))
    assert r.status_code == 200
    assert r.json() == []


# ---- REQ-P360-007: technical performance ------------------------------------

def test_risk_score_technical_indicators():
    p = make_participant()
    with Session(engine) as s:
        row = s.get(Participant, p["id"])
        row.created_at = datetime.utcnow() - timedelta(days=120)
        s.add(row)
        s.commit()
    r = c().get(f"/participants/{p['id']}/risk-score", headers=h(TECHNICAL))
    assert r.status_code == 200
    body = r.json()
    if body["status"] == "scored":
        tech = body["categories"]["technical"]
        assert "integration_status" in tech["indicators"]
        assert "pipeline_failure_rate" in tech["indicators"]
        assert "avg_submission_latency" in tech["indicators"]
        # Honest labels: integration_status notes it's a proxy
        assert "proxy" in tech["indicators"]["integration_status"]["description"].lower()


# ---- REQ-P360-008: outstanding actions --------------------------------------

def test_outstanding_actions_endpoint():
    p = make_participant()
    r = c().get(f"/participants/{p['id']}/outstanding-actions", headers=h(COMPLIANCE))
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"compliance", "remediation", "governance", "ai_alerts", "total"}
    assert isinstance(body["total"], int)


# ---- REQ-P360-014: notes (Compliance only) ----------------------------------

def test_notes_compliance_only():
    p = make_participant()
    url = f"/participants/{p['id']}/notes"
    # Business and Technical cannot add notes
    assert c().post(url, headers=h(BUSINESS), json={"note": "test"}).status_code == 403
    assert c().post(url, headers=h(TECHNICAL), json={"note": "test"}).status_code == 403
    # Compliance can
    r = c().post(url, headers=h(COMPLIANCE), json={"note": "Reviewed the licence renewal."})
    assert r.status_code == 200
    note = r.json()
    assert note["note"] == "Reviewed the licence renewal."
    assert note["participant_id"] == p["id"]
    # All roles can read
    r = c().get(url, headers=h(BUSINESS))
    assert r.status_code == 200
    assert any(n["id"] == note["id"] for n in r.json())


def test_notes_empty_rejected():
    p = make_participant()
    r = c().post(f"/participants/{p['id']}/notes", headers=h(COMPLIANCE), json={"note": "  "})
    assert r.status_code == 422


# ---- P360-013: no customer-level indicators ---------------------------------

def test_no_customer_level_data_in_risk_score():
    """Risk score must not expose individual customer data."""
    p = make_participant()
    with Session(engine) as s:
        row = s.get(Participant, p["id"])
        row.created_at = datetime.utcnow() - timedelta(days=120)
        s.add(row)
        s.commit()
    r = c().get(f"/participants/{p['id']}/risk-score", headers=h(COMPLIANCE))
    assert r.status_code == 200
    body = r.json()
    # No customer-level fields should appear
    forbidden = {"customer_id", "account_number", "customer_name", "individual"}
    assert not any(k in str(body).lower() for k in forbidden)


# ---- ?id= routing (alerts link to /participant?id=) -------------------------

def test_participant_list_filter_by_id():
    """The frontend reads ?id= from the URL; the API supports participant_id filter."""
    p = make_participant()
    r = c().get(f"/participants?q={p['code']}", headers=h(COMPLIANCE))
    assert r.status_code == 200
    results = r.json()
    assert any(x["id"] == p["id"] for x in results)


if __name__ == "__main__":
    run_module(globals())
