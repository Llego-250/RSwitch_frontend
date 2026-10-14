"""AI Decision Support API (SRS §5.9). Reads need ai.view; the alert
lifecycle needs ai.alerts.transition (Business + Compliance, REQ-AI-006);
an on-demand scan needs ai.manage (Business). Advisory only (REQ-AI-002)."""

from collections import Counter
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.alert import AnomalyAlert
from app.models.enums import UserRole
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import anomaly, audit
from app.services.detectors import method_label
from app.services.detectors.context import error_column

router = APIRouter(prefix="/alerts", tags=["ai"])

view = require_cap("ai.view")


def _out(a: AnomalyAlert, participants: dict[int, Participant]) -> dict:
    p = participants.get(a.participant_id)
    return {
        **a.model_dump(),
        "ref": f"ALT-{a.id}",
        "participant_name": p.name if p else f"#{a.participant_id}",
        "participant_type": p.type if p else "",
        "participant_region": p.region if p else "",
        "baseline_method_label": a.baseline_method or method_label(a.baseline_method_key),
        "days_in_state": (datetime.utcnow() - a.status_changed_at).days,
        "allowed_next": anomaly.allowed_next(a),
        "read_only": a.status == anomaly.CLOSED,
        "participant_link": f"/participant?id={a.participant_id}",
    }


def _participants(session: Session) -> dict[int, Participant]:
    return {p.id: p for p in session.exec(select(Participant)).all()}


@router.get("")
def list_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    participant_id: Optional[int] = None,
    method: Optional[str] = Query(None, description="Baseline method key: threshold | rolling | peer"),
    open_only: bool = False,
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    query = select(AnomalyAlert).order_by(AnomalyAlert.created_at.desc(), AnomalyAlert.id.desc())
    if status:
        query = query.where(AnomalyAlert.status == status)
    if severity:
        query = query.where(AnomalyAlert.severity == severity.upper())
    if participant_id is not None:
        query = query.where(AnomalyAlert.participant_id == participant_id)
    if method:
        query = query.where(AnomalyAlert.baseline_method_key == method)
    if open_only:
        query = query.where(AnomalyAlert.status != anomaly.CLOSED)
    participants = _participants(session)
    return [_out(a, participants) for a in session.exec(query).all()]


@router.get("/engine")
def engine(session: Session = Depends(get_session), _: User = Depends(view)):
    """Active baseline method, loaded detectors, per-participant method and
    history (incl. 'Insufficient history', §8.3) — REQ-AI-009/010/011."""
    return anomaly.engine_status(session)


@router.get("/priority")
def priority(session: Session = Depends(get_session), _: User = Depends(view)):
    return anomaly.priority_list(session)


@router.get("/trends")
def trends(months: Optional[int] = Query(None, ge=1, le=24), session: Session = Depends(get_session), _: User = Depends(view)):
    return anomaly.trend_summary(session, months)


@router.get("/risk-ranking")
def risk_ranking(session: Session = Depends(get_session), _: User = Depends(view)):
    """Participant risk scores (services.risk), riskiest first. Participants
    under 3 months of submission history are listed unscored with
    "Insufficient data — score pending." (REQ-P360-012). `score`,
    `components` and `history_months` keep the pre-P360 field names."""
    from app.services import risk

    return [{**r, "score": r["composite"], "history_months": r["months_of_history"]} for r in risk.latest_scores(session)]


@router.get("/assignees")
def assignees(session: Session = Depends(get_session), _: User = Depends(view)):
    """Who an investigation can be assigned to: active Compliance and
    Business users (the roles that manage alerts)."""
    users = session.exec(
        select(User).where(User.is_active == True, User.role.in_([UserRole.compliance, UserRole.business]))  # noqa: E712
    ).all()
    return [{"id": u.id, "name": u.full_name or u.email, "email": u.email, "role": u.role.value, "is_senior": u.is_senior}
            for u in sorted(users, key=lambda u: (u.full_name or u.email).lower())]


@router.post("/settings/validate")
def validate_settings(value: dict = Body(...), session: Session = Depends(get_session),
                      _: User = Depends(require_cap("settings.view"))):
    """Field-level validation of an anomaly settings payload (§20.2) before
    it is saved with PUT /settings/anomaly."""
    return {"errors": anomaly.validate_config(value, anomaly.config(session))}


@router.post("/detect")
def run_detection(request: Request, session: Session = Depends(get_session), user: User = Depends(require_cap("ai.manage"))):
    created = anomaly.detect(session)
    escalated = anomaly.auto_escalate(session)
    audit.record(session, "ANOMALY_SCAN", f"{created} new, {escalated} escalated", user, request)
    return {"created": created, "escalated": escalated}


@router.get("/{alert_id}")
def alert_detail(alert_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """The alert with its drill-down (REQ-AI-008): the participant and the
    submissions that drove it — aggregate metadata only, never file rows."""
    alert = session.get(AnomalyAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    participants = _participants(session)
    ids = list(alert.source_submission_ids or [])
    subs = {s.id: s for s in session.exec(select(Submission).where(Submission.id.in_(ids))).all()} if ids else {}
    sources = []
    for sid in ids:
        s = subs.get(sid)
        if s is None:
            continue
        fields = Counter(error_column(e) for e in (s.errors or []) if error_column(e))
        sources.append({
            "id": s.id,
            "participant_id": s.participant_id,
            "period": s.period,
            "filename": s.filename,
            "uploaded_at": s.uploaded_at,
            "uploaded_by": s.uploaded_by,
            "result": s.result,
            "error_count": s.error_count,
            "row_count": s.row_count,
            "error_fields": dict(fields.most_common(5)),
        })
    p = participants.get(alert.participant_id)
    previous = session.get(AnomalyAlert, alert.recurrence_of) if alert.recurrence_of else None
    return {
        **_out(alert, participants),
        "participant": {"id": p.id, "name": p.name, "code": p.code, "type": p.type, "region": p.region} if p else None,
        "sources": sources,
        "recurrence_of_ref": f"ALT-{previous.id}" if previous else None,
        "advisory_notice": anomaly.ADVISORY_NOTICE,
    }


@router.post("/{alert_id}/transition")
def transition(
    alert_id: int,
    request: Request,
    status: str = Body(...),
    note: str = Body(""),
    resolution_summary: str = Body(""),
    assignee_id: Optional[int] = Body(None),
    session: Session = Depends(get_session),
    user: User = Depends(require_cap("ai.alerts.transition")),
):
    alert = session.get(AnomalyAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    previous = alert.status
    try:
        alert = anomaly.transition(session, alert, status, note, user, resolution_summary, assignee_id)
    except anomaly.TransitionError as exc:
        audit.record(session, "ALERT_TRANSITION", f"ALT-{alert_id} {previous} → {status}: {exc.message}", user, request,
                     status="FAILED")
        if exc.field:
            raise validation_error([problem(exc.field, exc.rule, exc.message)], exc.status_code)
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    audit.record(session, "ALERT_TRANSITION", f"ALT-{alert.id} {previous} → {alert.status}", user, request)
    return _out(alert, _participants(session))
