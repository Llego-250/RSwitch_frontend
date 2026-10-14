"""Participant risk assessment (SRS REQ-P360-009..012, §11.5, §18
ParticipantRiskScore). This is the contract every other module reads risk
through — Participant 360, the AI priority list, Reports (§14.3) and the
Dashboard (§15.2 risk distribution).

Shape of one score (dict):
    participant_id, participant_name, participant_type, region
    status        "scored" | "insufficient_data"   (REQ-P360-012: < 3 months)
    composite     float 0–100 (higher = riskier) or None when insufficient
    band          "Low" | "Medium" | "High" or None
    categories    {"compliance"|"operational"|"technical": {"score": float|None,
                   "weight": float, "indicators": {name: {"value", "unit", "score"}}}}
    top_factor    category or indicator name driving the score, or None
    months_of_history, computed_at (ISO datetime)

INTERIM: computed from the legacy four-component formula until the
Participant 360 module replaces the internals; signatures are final."""

from datetime import datetime
from typing import Optional

from sqlmodel import Session

BANDS = (("High", 66.0), ("Medium", 33.0), ("Low", 0.0))


def _band(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    return next(name for name, floor in BANDS if score >= floor)


def latest_scores(session: Session) -> list[dict]:
    """Current score for every participant, riskiest first (insufficient-data
    participants last)."""
    from app.services import anomaly

    rows = []
    for r in anomaly.risk_scores(session):
        insufficient = r["history_months"] < 3
        composite = None if insufficient else r["score"]
        rows.append({
            "participant_id": r["participant_id"],
            "participant_name": r["participant_name"],
            "participant_type": r["participant_type"],
            "region": "",
            "status": "insufficient_data" if insufficient else "scored",
            "composite": composite,
            "band": _band(composite),
            "categories": {},
            "top_factor": r["top_factor"],
            "months_of_history": r["history_months"],
            "computed_at": datetime.utcnow().isoformat(),
        })
    rows.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))
    return rows


def participant_risk(session: Session, participant_id: int) -> Optional[dict]:
    """One participant's score plus "methodology" (inputs, weights, data
    sources — REQ-P360-009). None if the participant doesn't exist."""
    row = next((r for r in latest_scores(session) if r["participant_id"] == participant_id), None)
    if row is not None:
        row = {**row, "methodology": {}}
    return row


def distribution(session: Session) -> dict:
    """§15.2 Participant Risk Overview: {"Low": n, "Medium": n, "High": n,
    "Insufficient data": n}."""
    counts = {"Low": 0, "Medium": 0, "High": 0, "Insufficient data": 0}
    for r in latest_scores(session):
        counts[r["band"] or "Insufficient data"] += 1
    return counts
