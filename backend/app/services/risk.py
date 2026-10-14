"""Participant risk scoring (SRS REQ-P360-009..012, §11.5, §18).

Three categories (P360-010):
  Compliance   — adherence rate, overdue deadlines, rejection history
  Operational  — incident frequency, severity, resolution time
  Technical    — integration uptime, pipeline failure rate, avg submission latency

Overall score: weighted composite 0–100 (higher = riskier).
Default weights follow §11.5: Technical 30, Compliance 50, Operational 20.

Minimum history (P360-012): score is None / status "insufficient_data" when
the participant has fewer than 3 months of submission history.

Shape of one score dict:
  participant_id, participant_name, participant_type, region
  status        "scored" | "insufficient_data"
  composite     float 0–100 or None
  band          "Low" | "Medium" | "High" or None
  categories    {
    "compliance":   {score, weight, indicators: {name: {value, unit, score}}},
    "operational":  {score, weight, indicators: ...},
    "technical":    {score, weight, indicators: ...},
  }
  top_factor    category name driving the score, or None
  months_of_history, computed_at (ISO datetime)
  methodology   (present on participant_risk only) — inputs and weights
"""

from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from app.models.enums import (
    UNRESOLVED_INCIDENT_STATUSES,
    IntegrationStatus,
    IssueSeverity,
    SubmissionResult,
)
from app.models.integration import Integration
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.submission import Submission
from app.services.settings_store import get_setting

BANDS = (("High", 66.0), ("Medium", 33.0), ("Low", 0.0))
MIN_HISTORY_MONTHS = 3
WINDOW_DAYS = 30  # technical performance window (P360-007)

# Default category weights (§11.5). Configurable via risk_weights setting.
DEFAULT_WEIGHTS = {"technical": 30, "compliance": 50, "operational": 20}

_SEV_POINTS = {
    IssueSeverity.critical: 50,
    IssueSeverity.high: 30,
    IssueSeverity.medium: 15,
    IssueSeverity.low: 5,
}


def _band(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    return next(name for name, floor in BANDS if score >= floor)


def _weights(session: Session) -> dict:
    """Category weights from settings, falling back to §11.5 defaults."""
    stored = get_setting(session, "risk_weights")
    # The stored key uses the old four-component names; map to the three
    # P360-010 categories when the new keys aren't present yet.
    if "technical" in stored:
        w = {k: float(stored.get(k, DEFAULT_WEIGHTS[k])) for k in DEFAULT_WEIGHTS}
    else:
        # Legacy mapping: integration→technical, compliance+overdue→compliance, incidents→operational
        w = {
            "technical": float(stored.get("integration", 30)),
            "compliance": float(stored.get("compliance", 30)) + float(stored.get("overdue", 20)),
            "operational": float(stored.get("incidents", 20)),
        }
    total = sum(w.values()) or 1
    return {k: v / total * 100 for k, v in w.items()}


# ---- category scorers -------------------------------------------------------

def _compliance_score(session: Session, participant_id: int, months_of_history: float) -> dict:
    """Compliance category: adherence rate, overdue deadlines, rejection history."""
    from app.services.compliance import adherence_rate, failure_rate, overdue_rows

    adh = adherence_rate(session, participant_id, 12)
    fail = failure_rate(session, participant_id, 12)
    overdue = overdue_rows(session, participant_id=participant_id)

    # Adherence: 0 = perfect (100% on time), 100 = never on time
    adh_score = (100 - adh["rate_pct"]) if adh["rate_pct"] is not None else 50.0

    # Overdue: each overdue cycle adds 20 points, capped at 100
    overdue_score = min(100.0, len(overdue) * 20)

    # Rejection: failure/rejection rate maps directly
    reject_score = fail["rate_pct"] if fail["rate_pct"] is not None else 0.0

    # Weighted within category: adherence 40%, overdue 35%, rejection 25%
    score = adh_score * 0.40 + overdue_score * 0.35 + reject_score * 0.25

    return {
        "score": round(score, 1),
        "indicators": {
            "adherence_rate": {
                "value": adh["rate_pct"],
                "unit": "%",
                "score": round(adh_score, 1),
                "description": f"{adh['on_time']} on-time of {adh['total']} due (12 months)",
            },
            "overdue_deadlines": {
                "value": len(overdue),
                "unit": "cycles",
                "score": round(overdue_score, 1),
                "description": "Currently overdue compliance cycles",
            },
            "rejection_rate": {
                "value": fail["rate_pct"],
                "unit": "%",
                "score": round(reject_score, 1),
                "description": f"{fail['failed_or_rejected']} failed/rejected of {fail['total']} (12 months)",
            },
        },
    }


def _operational_score(session: Session, participant_id: int) -> dict:
    """Operational category: incident frequency, severity, resolution time."""
    incidents = session.exec(select(Issue).where(Issue.participant_id == participant_id)).all()
    unresolved = [i for i in incidents if i.status in UNRESOLVED_INCIDENT_STATUSES]
    resolved = [i for i in incidents if i.resolved_at is not None]

    # Severity score: sum of severity points for unresolved incidents, capped at 100
    sev_score = min(100.0, sum(_SEV_POINTS.get(i.severity, 0) for i in unresolved))

    # Frequency: incidents in last 90 days
    cutoff = datetime.utcnow() - timedelta(days=90)
    recent = [i for i in incidents if i.created_at >= cutoff]
    freq_score = min(100.0, len(recent) * 15)

    # Resolution time: average days to resolve, normalised (>30 days = 100)
    if resolved:
        avg_days = sum((i.resolved_at - i.created_at).days for i in resolved) / len(resolved)
        resolution_score = min(100.0, avg_days / 30 * 100)
    else:
        resolution_score = 0.0 if not unresolved else 50.0

    score = sev_score * 0.50 + freq_score * 0.30 + resolution_score * 0.20

    return {
        "score": round(score, 1),
        "indicators": {
            "incident_severity": {
                "value": len(unresolved),
                "unit": "open incidents",
                "score": round(sev_score, 1),
                "description": f"{len(unresolved)} unresolved incidents (severity-weighted)",
            },
            "incident_frequency": {
                "value": len(recent),
                "unit": "incidents (90d)",
                "score": round(freq_score, 1),
                "description": "Incidents raised in the last 90 days",
            },
            "resolution_time": {
                "value": round(sum((i.resolved_at - i.created_at).days for i in resolved) / len(resolved), 1) if resolved else None,
                "unit": "days avg",
                "score": round(resolution_score, 1),
                "description": f"Average days to resolve ({len(resolved)} resolved incidents)",
            },
        },
    }


def _technical_score(session: Session, participant_id: int) -> dict:
    """Technical category: integration status, pipeline failure rate, submission latency.

    Uptime is derived from the current integration status (P360-007 note:
    we check whether integration status history exists before defining uptime;
    since only the current status is stored, we use it as a proxy).
    """
    from app.models.pipeline import PipelineJob

    integration = session.exec(
        select(Integration).where(Integration.participant_id == participant_id)
    ).first()

    # Integration status → uptime proxy
    _status_score = {
        IntegrationStatus.healthy: 0.0,
        IntegrationStatus.connected: 0.0,
        IntegrationStatus.warning: 30.0,
        IntegrationStatus.degraded: 30.0,
        IntegrationStatus.failed: 80.0,
        IntegrationStatus.disconnected: 80.0,
        IntegrationStatus.paused: 40.0,
        IntegrationStatus.maintenance: 40.0,
        IntegrationStatus.pending: 20.0,
        IntegrationStatus.not_configured: 100.0,
        IntegrationStatus.running: 0.0,
        IntegrationStatus.queued: 10.0,
    }
    if integration:
        uptime_score = _status_score.get(integration.status, 50.0)
        uptime_label = integration.status.value
    else:
        uptime_score = 100.0
        uptime_label = "No integration"

    # Pipeline failure rate (last 30 days)
    cutoff = datetime.utcnow() - timedelta(days=WINDOW_DAYS)
    jobs = []
    if integration:
        jobs = session.exec(
            select(PipelineJob).where(
                PipelineJob.integration_id == integration.id,
                PipelineJob.started_at >= cutoff,
            )
        ).all()
    total_jobs = len(jobs)
    failed_jobs = sum(1 for j in jobs if j.status == "Failed")
    pipeline_score = (failed_jobs / total_jobs * 100) if total_jobs else 0.0

    # Average submission latency (time from upload to loaded_at, last 30 days)
    subs = session.exec(
        select(Submission).where(
            Submission.participant_id == participant_id,
            Submission.uploaded_at >= cutoff,
            Submission.result == SubmissionResult.passed,
        )
    ).all()
    latencies = [
        (s.loaded_at - s.uploaded_at).total_seconds() / 60
        for s in subs
        if s.loaded_at is not None
    ]
    avg_latency = sum(latencies) / len(latencies) if latencies else None
    # Latency score: >60 min = 100, 0 min = 0
    latency_score = min(100.0, (avg_latency / 60) * 100) if avg_latency is not None else 0.0

    score = uptime_score * 0.50 + pipeline_score * 0.30 + latency_score * 0.20

    return {
        "score": round(score, 1),
        "indicators": {
            "integration_status": {
                "value": uptime_label,
                "unit": "status",
                "score": round(uptime_score, 1),
                "description": "Current integration status (proxy for uptime; point-in-time, not historical)",
            },
            "pipeline_failure_rate": {
                "value": round(failed_jobs / total_jobs * 100, 1) if total_jobs else None,
                "unit": "%",
                "score": round(pipeline_score, 1),
                "description": f"{failed_jobs} failed of {total_jobs} pipeline jobs (last {WINDOW_DAYS} days)",
            },
            "avg_submission_latency": {
                "value": round(avg_latency, 1) if avg_latency is not None else None,
                "unit": "minutes",
                "score": round(latency_score, 1),
                "description": f"Average upload-to-loaded time for passed submissions (last {WINDOW_DAYS} days)",
            },
        },
    }


# ---- public API -------------------------------------------------------------

def _score_participant(session: Session, participant: Participant, weights: dict) -> dict:
    """Compute the full score dict for one participant."""
    months = round((datetime.utcnow() - participant.created_at).days / 30, 1)
    insufficient = months < MIN_HISTORY_MONTHS

    if insufficient:
        return {
            "participant_id": participant.id,
            "participant_name": participant.name,
            "participant_type": participant.type,
            "region": participant.region,
            "status": "insufficient_data",
            "composite": None,
            "band": None,
            "categories": {},
            "top_factor": None,
            "months_of_history": months,
            "computed_at": datetime.utcnow().isoformat(),
        }

    compliance = _compliance_score(session, participant.id, months)
    operational = _operational_score(session, participant.id)
    technical = _technical_score(session, participant.id)

    cats = {
        "compliance": {**compliance, "weight": round(weights["compliance"], 1)},
        "operational": {**operational, "weight": round(weights["operational"], 1)},
        "technical": {**technical, "weight": round(weights["technical"], 1)},
    }

    composite = sum(
        cats[k]["score"] * weights[k] / 100
        for k in cats
    )
    top = max(cats, key=lambda k: cats[k]["score"])

    return {
        "participant_id": participant.id,
        "participant_name": participant.name,
        "participant_type": participant.type,
        "region": participant.region,
        "status": "scored",
        "composite": round(composite, 1),
        "band": _band(composite),
        "categories": cats,
        "top_factor": top if cats[top]["score"] > 0 else None,
        "months_of_history": months,
        "computed_at": datetime.utcnow().isoformat(),
    }


def latest_scores(session: Session) -> list[dict]:
    """Current score for every participant, riskiest first (insufficient-data last)."""
    weights = _weights(session)
    rows = [
        _score_participant(session, p, weights)
        for p in session.exec(select(Participant)).all()
    ]
    rows.sort(key=lambda r: (r["composite"] is None, -(r["composite"] or 0)))
    return rows


def participant_risk(session: Session, participant_id: int) -> Optional[dict]:
    """One participant's score plus methodology (REQ-P360-009). None if not found."""
    participant = session.get(Participant, participant_id)
    if participant is None:
        return None
    weights = _weights(session)
    row = _score_participant(session, participant, weights)
    row["methodology"] = {
        "description": (
            "Composite score = weighted average of three category scores (0–100, higher = riskier). "
            f"Compliance {weights['compliance']:.0f}%, Operational {weights['operational']:.0f}%, "
            f"Technical {weights['technical']:.0f}%. "
            "Minimum 3 months of submission history required (REQ-P360-012)."
        ),
        "weights": {k: round(v, 1) for k, v in weights.items()},
        "categories": {
            "compliance": "Adherence rate (40%), overdue deadlines (35%), rejection rate (25%)",
            "operational": "Incident severity (50%), incident frequency (30%), resolution time (20%)",
            "technical": "Integration status (50%), pipeline failure rate (30%), submission latency (20%)",
        },
        "data_sources": [
            "Compliance Register (adherence, overdue, rejections)",
            "Incident register (severity, frequency, resolution time)",
            "Integration status (current status as uptime proxy)",
            "Pipeline jobs (failure rate, last 30 days)",
            "Submissions (latency, last 30 days)",
        ],
        "advisory": "Scores are advisory and explainable. They never automatically change a participant's status.",
    }
    return row


def distribution(session: Session) -> dict:
    """§15.2 risk distribution: {Low, Medium, High, Insufficient data} counts."""
    counts: dict[str, int] = {"Low": 0, "Medium": 0, "High": 0, "Insufficient data": 0}
    for r in latest_scores(session):
        counts[r["band"] or "Insufficient data"] += 1
    return counts


def outstanding_actions(session: Session, participant_id: int) -> dict:
    """REQ-P360-008: pending items assigned to RSwitch or the institution.

    Combines:
    - Compliance requirements not yet approved
    - Incident remediation actions (open)
    - Governance action items owned by the participant
    - Open AI alerts for this participant
    """
    from app.models.alert import AnomalyAlert
    from app.models.compliance import ComplianceCycle, ComplianceRequirement
    from app.models.enums import ComplianceStatus
    from app.models.governance import ActionItem
    from app.services.anomaly import CLOSED as ALERT_CLOSED

    # Compliance: cycles not yet approved
    pending_compliance = []
    for req in session.exec(
        select(ComplianceRequirement).where(
            ComplianceRequirement.participant_id == participant_id,
            ComplianceRequirement.active == True,  # noqa: E712
        )
    ).all():
        if req.submission_status not in (ComplianceStatus.approved.value,):
            pending_compliance.append({
                "type": "compliance",
                "id": req.id,
                "title": req.requirement_name,
                "status": req.submission_status,
                "due_date": req.due_date.isoformat() if req.due_date else None,
            })

    # Remediation actions
    open_actions = session.exec(
        select(RemediationAction)
        .join(Issue, RemediationAction.incident_id == Issue.id)
        .where(
            Issue.participant_id == participant_id,
            RemediationAction.status == "Open",
        )
    ).all()
    pending_remediation = [
        {
            "type": "remediation",
            "id": a.id,
            "title": a.description,
            "status": "Open",
            "due_date": a.due_date.isoformat() if a.due_date else None,
        }
        for a in open_actions
    ]

    # Governance action items (participant as assignee by name match)
    participant = session.get(Participant, participant_id)
    gov_items = []
    if participant:
        for item in session.exec(
            select(ActionItem).where(
                ActionItem.assignee.ilike(f"%{participant.name}%"),
                ActionItem.status != "Completed",
            )
        ).all():
            gov_items.append({
                "type": "governance",
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "due_date": item.due_date.isoformat() if item.due_date else None,
            })

    # Open AI alerts
    open_alerts = session.exec(
        select(AnomalyAlert).where(
            AnomalyAlert.participant_id == participant_id,
            AnomalyAlert.status != ALERT_CLOSED,
        )
    ).all()
    pending_alerts = [
        {
            "type": "ai_alert",
            "id": a.id,
            "title": f"ALT-{a.id}: {a.indicator}",
            "status": a.status,
            "severity": a.severity,
            "due_date": None,
        }
        for a in open_alerts
    ]

    return {
        "compliance": pending_compliance,
        "remediation": pending_remediation,
        "governance": gov_items,
        "ai_alerts": pending_alerts,
        "total": len(pending_compliance) + len(pending_remediation) + len(gov_items) + len(pending_alerts),
    }
