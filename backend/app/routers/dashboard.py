"""Role-aware dashboard data (SRS §5.2, §15, DASH-001..010).

Three role views (§15.1–15.3):
  Compliance  — compliance.dashboard_summary + attention queue
  Business    — integration health, AI alerts, inclusion, risk distribution,
                recent reports, compliance rate
  Technical   — pipeline summary, failed integrations, data freshness,
                system health, draft mappings, last 10 pipeline runs
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.core.permissions import require_cap
from app.db import get_session
from app.models.alert import AnomalyAlert
from app.models.admin import AuditEvent, ReportRun
from app.models.enums import UNRESOLVED_INCIDENT_STATUSES, IntegrationStatus
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.pipeline import PipelineJob
from app.models.user import User
from app.services import compliance as comp_svc
from app.services import risk as risk_svc
from app.services.anomaly import CLOSED as ALERT_CLOSED, GENERATED as ALERT_GENERATED

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

view = require_cap("dashboard.view")


# ---- shared helpers ---------------------------------------------------------

def _integration_health(session: Session) -> dict:
    integrations = session.exec(select(Integration)).all()
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    healthy = sum(1 for i in integrations if i.status in (IntegrationStatus.healthy, IntegrationStatus.connected))
    warning = sum(1 for i in integrations if i.status in (IntegrationStatus.warning, IntegrationStatus.degraded))
    failed = sum(1 for i in integrations if i.status in (IntegrationStatus.failed, IntegrationStatus.disconnected))
    return {
        "total": len(integrations),
        "healthy": healthy,
        "warning": warning,
        "failed": failed,
        "failed_participants": [
            {
                "participant_id": i.participant_id,
                "participant_name": participants[i.participant_id].name if i.participant_id in participants else "",
            }
            for i in integrations
            if i.status in (IntegrationStatus.failed, IntegrationStatus.disconnected)
        ],
    }


def _attention_queue(session: Session, role: str) -> list[dict]:
    """DASH-003: top unresolved items ranked by severity."""
    items = []

    # Overdue compliance cycles
    for row in comp_svc.overdue_rows(session):
        items.append({
            "id": f"compliance:{row['cycle_id']}",
            "type": "compliance",
            "severity": "High",
            "title": f"Overdue: {row['requirement_name']}",
            "participant": row["participant_name"],
            "link": "/compliance",
        })

    # Open incidents (Critical/High)
    for inc in session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all():
        if inc.severity.value in ("Critical", "High"):
            items.append({
                "id": f"incident:{inc.id}",
                "type": "incident",
                "severity": inc.severity.value,
                "title": inc.description[:80],
                "participant": None,
                "link": "/compliance",
            })

    # Unacknowledged AI alerts
    for alert in session.exec(select(AnomalyAlert).where(AnomalyAlert.status == ALERT_GENERATED)).all():
        items.append({
            "id": f"alert:{alert.id}",
            "type": "ai_alert",
            "severity": alert.severity,
            "title": f"ALT-{alert.id}: {alert.indicator}",
            "participant": None,
            "link": f"/ai?alert={alert.id}",
        })

    # Failed integrations
    _participants = {p.id: p for p in session.exec(select(Participant)).all()}
    for intg in session.exec(select(Integration).where(
        Integration.status.in_([IntegrationStatus.failed, IntegrationStatus.disconnected])
    )).all():
        pname = _participants[intg.participant_id].name if intg.participant_id in _participants else f"#{intg.participant_id}"
        items.append({
            "id": f"integration:{intg.id}",
            "type": "integration",
            "severity": "High",
            "title": f"Integration failed: {pname}",
            "participant": pname,
            "link": "/integrations",
        })

    # Sort: Critical first, then High, then others
    _rank = {"Critical": 0, "CRITICAL": 0, "High": 1, "HIGH": 1, "Medium": 2, "MEDIUM": 2, "Low": 3, "LOW": 3}
    items.sort(key=lambda x: _rank.get(x["severity"], 4))
    return items[:20]


def _recent_activity(session: Session, role: str, limit: int = 10) -> list[dict]:
    """DASH-008: last N role-relevant audit events."""
    query = select(AuditEvent).order_by(AuditEvent.timestamp.desc()).limit(limit * 3)
    events = session.exec(query).all()

    # Filter by role relevance
    role_actions = {
        "compliance": {"COMPLIANCE_", "INCIDENT_", "SUBMISSION_", "DOCUMENT_", "REMEDIATION_"},
        "business": {"REPORT_", "AI_", "INCLUSION_", "GOVERNANCE_"},
        "technical": {"INTEGRATION_", "PIPELINE_", "PARTICIPANT_", "USER_", "SETTING_", "MAPPING_"},
    }
    prefixes = role_actions.get(role, set())
    filtered = [
        {
            "timestamp": e.timestamp.isoformat(),
            "action": e.action,
            "resource": e.resource,
            "actor": e.actor_name or e.actor_email,
            "status": e.status,
        }
        for e in events
        if not prefixes or any(e.action.startswith(p) for p in prefixes)
    ]
    return filtered[:limit]


# ---- Compliance dashboard (§15.1) -------------------------------------------

@router.get("/compliance")
def compliance_dashboard(
    days: int = Query(30, ge=1, le=366),
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """§15.1 Compliance role dashboard."""
    summary = comp_svc.dashboard_summary(session, days)
    summary["attention_queue"] = _attention_queue(session, "compliance")
    summary["recent_activity"] = _recent_activity(session, "compliance")
    return summary


# ---- Business dashboard (§15.2) ---------------------------------------------

@router.get("/business")
def business_dashboard(
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """§15.2 Business role dashboard."""
    from app.services import inclusion

    # Integration health
    integ_health = _integration_health(session)

    # Unacknowledged AI alerts
    unack_alerts = session.exec(
        select(AnomalyAlert).where(AnomalyAlert.status == ALERT_GENERATED)
    ).all()

    # Inclusion snapshot
    try:
        inclusion_snap = inclusion.summary(session, 3)
    except Exception:
        inclusion_snap = {}

    # Risk distribution
    risk_dist = risk_svc.distribution(session)

    # Last 5 reports
    recent_reports = [
        {
            "id": r.id,
            "report": r.report,
            "filename": r.filename,
            "format": r.format,
            "generated_by": r.generated_by,
            "generated_at": r.generated_at.isoformat(),
        }
        for r in session.exec(
            select(ReportRun).order_by(ReportRun.generated_at.desc()).limit(5)
        ).all()
    ]

    # Compliance rate (last 30 days)
    comp_summary = comp_svc.dashboard_summary(session, 30)
    compliance_rate = comp_summary["compliance_rate_30d"]

    return {
        "integration_health": integ_health,
        "unacknowledged_alerts": len(unack_alerts),
        "unacknowledged_alert_ids": [a.id for a in unack_alerts[:10]],
        "inclusion_snapshot": inclusion_snap,
        "risk_distribution": risk_dist,
        "recent_reports": recent_reports,
        "compliance_rate_30d": compliance_rate,
        "attention_queue": _attention_queue(session, "business"),
        "recent_activity": _recent_activity(session, "business"),
    }


# ---- Technical dashboard (§15.3) --------------------------------------------

@router.get("/technical")
def technical_dashboard(
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """§15.3 Technical role dashboard."""
    from app.models.template import IngestionTemplate
    from app.models.integration import IntegrationMode
    from app.services.settings_store import get_setting

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Pipeline summary (today)
    jobs_today = session.exec(
        select(PipelineJob).where(PipelineJob.started_at >= today_start)
    ).all()
    active_jobs = [j for j in jobs_today if j.status in ("Running", "Queued")]
    failed_jobs_today = [j for j in jobs_today if j.status == "Failed"]

    # Queue depth: jobs queued or running
    all_pending = session.exec(
        select(PipelineJob).where(PipelineJob.status.in_(["Running", "Queued"]))
    ).all()

    # Failed integrations
    _all_participants = {p.id: p for p in session.exec(select(Participant)).all()}
    failed_integrations = session.exec(
        select(Integration).where(
            Integration.status.in_([IntegrationStatus.failed, IntegrationStatus.disconnected])
        )
    ).all()

    # Data freshness per source (last pipeline job per integration)
    integrations = session.exec(select(Integration)).all()
    freshness = []
    for intg in integrations:
        p = _all_participants.get(intg.participant_id)
        last_job = session.exec(
            select(PipelineJob)
            .where(PipelineJob.integration_id == intg.id)
            .order_by(PipelineJob.started_at.desc())
            .limit(1)
        ).first()
        freshness.append({
            "participant_name": p.name if p else "",
            "participant_code": p.code if p else "",
            "integration_id": intg.id,
            "status": intg.status.value,
            "last_run_at": last_job.started_at.isoformat() if last_job else None,
            "hours_since_last_run": round((now - last_job.started_at).total_seconds() / 3600, 1) if last_job else None,
        })

    # Draft mappings count (templates with version == 0 are drafts)
    from app.models.template import IngestionTemplate
    draft_mappings = session.exec(
        select(IngestionTemplate).where(IngestionTemplate.version == 0)
    ).all()

    # Last 10 pipeline runs
    last_runs = [
        {
            "id": j.id,
            "integration_id": j.integration_id,
            "status": j.status,
            "trigger": j.trigger,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
            "records_processed": j.records_processed,
            "error_count": j.error_count,
        }
        for j in session.exec(
            select(PipelineJob).order_by(PipelineJob.started_at.desc()).limit(10)
        ).all()
    ]

    # System health proxy: error rate from audit log (last hour)
    hour_ago = now - timedelta(hours=1)
    recent_events = session.exec(
        select(AuditEvent).where(AuditEvent.timestamp >= hour_ago)
    ).all()
    total_events = len(recent_events)
    error_events = sum(1 for e in recent_events if e.status == "FAILED")
    error_rate = round(error_events / total_events * 100, 1) if total_events else 0.0

    return {
        "pipeline_summary": {
            "active_today": len(active_jobs),
            "failed_today": len(failed_jobs_today),
            "queue_depth": len(all_pending),
            "total_today": len(jobs_today),
        },
        "failed_integrations": [
            {
                "id": i.id,
                "participant_name": _all_participants[i.participant_id].name if i.participant_id in _all_participants else "",
                "participant_code": _all_participants[i.participant_id].code if i.participant_id in _all_participants else "",
                "status": i.status.value,
                "note": i.note,
                "updated_at": i.updated_at.isoformat() if i.updated_at else None,
            }
            for i in failed_integrations
        ],
        "data_freshness": freshness,
        "system_health": {
            "error_rate_1h": error_rate,
            "events_1h": total_events,
            "queue_depth": len(all_pending),
            "note": "Error rate from audit log (last hour). Queue depth = running + queued pipeline jobs.",
        },
        "draft_mappings_count": len(draft_mappings),
        "last_pipeline_runs": last_runs,
        "attention_queue": _attention_queue(session, "technical"),
        "recent_activity": _recent_activity(session, "technical"),
    }


# ---- Generic dashboard (role-agnostic, for the frontend to call) -------------

@router.get("")
def dashboard(
    role: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    """Returns the appropriate role dashboard based on the ?role= param or
    the authenticated user's role. The frontend passes role= so it can
    request a specific view without re-authenticating."""
    effective_role = (role or user.role.value).lower()
    if "compliance" in effective_role:
        return compliance_dashboard(session=session, _=user)
    if "business" in effective_role:
        return business_dashboard(session=session, _=user)
    return technical_dashboard(session=session, _=user)
