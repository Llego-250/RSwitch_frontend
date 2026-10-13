"""Background scheduling (SRS §17.6.3): the cron-style ticks and the pipeline
worker, started with the API.

check_overdue_integrations is a schedule check, not a model: it marks a data
source Warning or Failed purely from how long it has gone without a
successful transfer against the participant's expected cadence, and tells
the Technical/Admin team (REQ-INTG-010). It never touches
Participant.is_active."""

import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from app.db import engine
from app.models.enums import IntegrationSource, IntegrationStatus
from app.models.integration import Integration
from app.models.participant import Participant

log = logging.getLogger("rdip.scheduler")

# Statuses describing a transfer in flight or a source nobody expects data
# from yet — the overdue check leaves them alone.
_NOT_CHECKED = (IntegrationStatus.running, IntegrationStatus.queued, IntegrationStatus.paused, IntegrationStatus.not_configured)


def _due_after(integration: Integration, participant: Participant, reference: datetime) -> tuple[datetime, str]:
    """When the next transfer is due: the data source's own expected
    schedule (cron) if it has one, else the participant's expected
    frequency (§10.1). Each scheduled time is a deadline, and a transfer
    counts for the first deadline after it — so the one that can be missed
    is the deadline after that."""
    from app.services.pipeline_jobs import next_runs

    if integration.schedule_cron:
        try:
            return next_runs(integration.schedule_cron, reference, count=2)[1], f"on schedule {integration.schedule_cron}"
        except (ValueError, IndexError):
            pass
    days = max(1, participant.expected_frequency_days)
    return reference + timedelta(days=days), f"every {days} day(s)"


def check_overdue(session: Session, now: Optional[datetime] = None) -> int:
    """Within the grace period a late source turns Warning (recorded as a
    warning); past it, Failed, with one notification per missed due date.
    Returns the number of overdue notifications sent."""
    from app.services.pipeline_runner import notify_technical, set_integration_status
    from app.services.settings_store import get_setting

    now = now or datetime.utcnow()
    grace = int(get_setting(session, "pipelines").get("overdue_grace_days", 3))
    rows = session.exec(
        select(Integration, Participant).where(Integration.participant_id == Participant.id, Participant.status == "Active")
    ).all()
    notified = 0
    for integration, participant in rows:
        if integration.paused or integration.status in _NOT_CHECKED:
            continue
        reference = integration.last_submission_at or integration.created_at
        due_at, expected = _due_after(integration, participant, reference)
        if now <= due_at:
            continue
        hours = int((now - reference).total_seconds() // 3600)
        age = f"{hours // 24} day(s)" if hours >= 24 else f"{hours} hour(s)"
        if now <= due_at + timedelta(days=grace):
            if integration.status == IntegrationStatus.healthy:
                reason = f"No transfer for {age} (expected {expected}); within the {grace}-day grace period"
                set_integration_status(
                    session, integration, IntegrationStatus.warning, note=reason, source=IntegrationSource.schedule_check,
                    warnings=[{"row": 0, "column": "schedule", "rule": "overdue_within_grace", "description": reason}],
                    notify=False,
                )
            continue
        never = integration.last_submission_at is None
        reason = (f"No data received {age} after the data source was set up" if never else
                  f"No successful transfer for {age}") + f" (expected {expected}; {grace}-day grace period over)"
        if integration.status != IntegrationStatus.failed:
            set_integration_status(session, integration, IntegrationStatus.failed, note=reason,
                                   source=IntegrationSource.schedule_check, notify=False)
        notify_technical(
            session,
            "integration_failed",
            integration,
            f"Submission overdue — {participant.name} · {integration.source_name}",
            reason,
            dedupe_key=f"integration_overdue:{integration.id}:{due_at:%Y%m%d}",
        )
        notified += 1
    return notified


def check_overdue_integrations() -> None:
    with Session(engine) as session:
        check_overdue(session)


def run_pipeline_schedules() -> None:
    """Every minute, so a cron schedule fires within a minute of its time."""
    from app.services import pipeline_jobs

    with Session(engine) as session:
        pipeline_jobs.enqueue_due(session)


def run_intelligence_jobs() -> None:
    """Anomaly scan, auto-escalation, notifications and due report
    schedules. Each is idempotent, so running often is safe."""
    from app.routers.reports import run_due_schedules
    from app.services import anomaly, compliance_jobs, governance_jobs, notifications, pipeline_jobs

    with Session(engine) as session:
        anomaly.detect(session)
        anomaly.auto_escalate(session)
        compliance_jobs.run(session)
        governance_jobs.run(session)
        pipeline_jobs.run(session)
        notifications.generate(session)
        run_due_schedules(session)


def start_scheduler() -> BackgroundScheduler:
    from app.services import pipeline_runner

    scheduler = BackgroundScheduler()
    scheduler.add_job(check_overdue_integrations, "interval", hours=1, id="overdue-check")
    scheduler.add_job(run_pipeline_schedules, "interval", minutes=1, id="pipeline-schedules")
    scheduler.add_job(run_intelligence_jobs, "interval", minutes=15, id="intelligence", next_run_time=datetime.now())
    scheduler.start()
    # §17.3 / §17.6.3: pipeline jobs run on a background queue, not in requests.
    pipeline_runner.start_worker()
    return scheduler
