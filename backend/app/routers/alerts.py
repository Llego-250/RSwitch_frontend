from datetime import datetime
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.permissions import require_roles, require_staff
from app.db import get_session
from app.models.alert import AnomalyAlert
from app.models.enums import SubmissionResult, UserRole
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import anomaly, audit

router = APIRouter(prefix="/alerts", tags=["ai"])

# Allowed lifecycle moves (Closed is terminal and can't be reopened).
TRANSITIONS = {
    "Generated": {"Acknowledged", "Closed"},
    "Acknowledged": {"Under Investigation", "Escalated", "Closed"},
    "Escalated": {"Under Investigation", "Closed"},
    "Under Investigation": {"Escalated", "Closed"},
    "Closed": set(),
}


def _out(a: AnomalyAlert, names: dict[int, str]) -> dict:
    return {
        **a.model_dump(),
        "participant_name": names.get(a.participant_id, f"#{a.participant_id}"),
        "days_in_state": (datetime.utcnow() - a.status_changed_at).days,
    }


def _names(session: Session) -> dict[int, str]:
    return {p.id: p.name for p in session.exec(select(Participant)).all()}


@router.get("")
def list_alerts(status: Optional[str] = None, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    query = select(AnomalyAlert).order_by(AnomalyAlert.created_at.desc())
    if status:
        query = query.where(AnomalyAlert.status == status)
    names = _names(session)
    return [_out(a, names) for a in session.exec(query).all()]


@router.post("/detect")
def run_detection(request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    created = anomaly.detect(session)
    escalated = anomaly.auto_escalate(session)
    audit.record(session, "ANOMALY_SCAN", f"{created} new, {escalated} escalated", user, request)
    return {"created": created, "escalated": escalated}


@router.post("/{alert_id}/transition")
def transition(
    alert_id: int,
    request: Request,
    status: str = Body(...),
    note: str = Body(""),
    resolution_summary: str = Body(""),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(UserRole.compliance, UserRole.business)),
):
    alert = session.get(AnomalyAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if status not in TRANSITIONS.get(alert.status, set()):
        raise HTTPException(
            status_code=422,
            detail=f"An alert can't move from {alert.status} to {status}"
            + (" — acknowledge it first" if alert.status == "Generated" and status == "Under Investigation" else ""),
        )
    if status == "Closed":
        if len(resolution_summary.strip()) < 20:
            raise HTTPException(status_code=422, detail="Closing requires a resolution summary of at least 20 characters")
        alert.resolution_summary = resolution_summary.strip()
    elif not note.strip():
        raise HTTPException(status_code=422, detail="A note is required for this transition")
    alert.notes = [
        *alert.notes,
        {
            "date": datetime.utcnow().isoformat(),
            "user": user.full_name or user.email,
            "text": note.strip() or f"Closed: {alert.resolution_summary}",
            "from": alert.status,
            "to": status,
        },
    ]
    alert.status = status
    alert.status_changed_at = datetime.utcnow()
    session.add(alert)
    session.commit()
    session.refresh(alert)
    audit.record(session, "ALERT_TRANSITION", f"ALT-{alert.id} → {status}", user, request)
    return _out(alert, _names(session))


@router.get("/risk-ranking")
def risk_ranking(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return anomaly.risk_scores(session)


@router.get("/trend")
def failure_trend(months: int = 6, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    start = (datetime.utcnow().replace(day=1) - relativedelta(months=months - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    subs = session.exec(select(Submission).where(Submission.uploaded_at >= start)).all()
    alerts = session.exec(select(AnomalyAlert).where(AnomalyAlert.created_at >= start)).all()
    rows = []
    for i in range(months):
        m = (start + relativedelta(months=i)).strftime("%Y-%m")
        in_month = [s for s in subs if s.uploaded_at.strftime("%Y-%m") == m]
        failed = sum(1 for s in in_month if s.result == SubmissionResult.failed)
        rows.append(
            {
                "month": m,
                "submissions": len(in_month),
                "error_rate": round(failed / len(in_month) * 100, 1) if in_month else 0,
                "alerts": sum(1 for a in alerts if a.created_at.strftime("%Y-%m") == m),
            }
        )
    return rows
