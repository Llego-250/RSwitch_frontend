"""Scheduled pipeline work (SRS §17.6.3 cron-based scheduler): enqueue the
pipeline configurations that are due (REQ-PIPE-008) and purge execution logs
past the retention period (REQ-PIPE-009). run() is called on every scheduler
tick and is idempotent: a due configuration is enqueued once, then its next
run moves forward."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import delete
from sqlmodel import Session, select

from app.models.integration import Integration, IntegrationMode
from app.models.pipeline import PipelineConfig, PipelineJob, PipelineJobStatus, PipelineLog
from app.services.settings_store import get_setting

MIN_RETENTION_DAYS = 90  # REQ-PIPE-009 floor, whatever the setting says


def _timezone(session: Optional[Session]) -> str:
    if session is None:
        return "Africa/Kigali"
    return get_setting(session, "organization").get("timezone") or "Africa/Kigali"


def cron_trigger(expr: str, tz: str = "Africa/Kigali") -> CronTrigger:
    """Raises ValueError with a readable message for an invalid expression."""
    expr = (expr or "").strip()
    if len(expr.split()) != 5:
        raise ValueError("A cron schedule has five fields: minute hour day-of-month month day-of-week (e.g. 0 2 * * *)")
    try:
        return CronTrigger.from_crontab(expr, timezone=tz)
    except (ValueError, KeyError) as exc:
        raise ValueError(f"Invalid cron expression: {exc}") from exc


def next_runs(expr: str, after: datetime, count: int = 1, tz: str = "Africa/Kigali") -> list[datetime]:
    """The next fire times strictly after `after` (naive UTC in, naive UTC out),
    evaluated in the organisation's timezone."""
    trigger = cron_trigger(expr, tz)
    runs: list[datetime] = []
    cursor = after.replace(tzinfo=timezone.utc)
    for _ in range(count):
        fire = trigger.get_next_fire_time(None, cursor + timedelta(seconds=1))
        if fire is None:
            break
        runs.append(fire.astimezone(timezone.utc).replace(tzinfo=None))
        cursor = fire.astimezone(timezone.utc)
    return runs


def schedule_next(session: Session, config: PipelineConfig, after: Optional[datetime] = None) -> None:
    runs = next_runs(config.schedule_cron, after or datetime.utcnow(), tz=_timezone(session))
    config.next_run_at = runs[0] if runs else None


def enqueue_due(session: Session, now: Optional[datetime] = None) -> int:
    from app.services import pipeline_runner

    now = now or datetime.utcnow()
    due = session.exec(
        select(PipelineConfig).where(PipelineConfig.active == True, PipelineConfig.next_run_at != None,  # noqa: E711,E712
                                     PipelineConfig.next_run_at <= now)
    ).all()
    queued = 0
    for config in due:
        integration = session.get(Integration, config.integration_id)
        runnable = (
            integration is not None
            and not integration.paused
            and integration.integration_mode == IntegrationMode.automated.value
            and pipeline_runner.active_job(session, integration.id) is None
        )
        if runnable:
            pipeline_runner.enqueue(session, integration=integration, config=config, trigger="Schedule",
                                    triggered_by=f"Scheduler ({config.name})")
            config.last_enqueued_at = now
            queued += 1
        # Skipped runs (paused source, previous run still going) are not
        # caught up later — the schedule simply moves on.
        schedule_next(session, config, now)
        config.updated_at = datetime.utcnow()
        session.add(config)
        session.commit()
    return queued


def retention_days(session: Session) -> int:
    return max(MIN_RETENTION_DAYS, int(get_setting(session, "pipelines").get("log_retention_days") or MIN_RETENTION_DAYS))


def purge_old_logs(session: Session, now: Optional[datetime] = None) -> int:
    """Delete finished jobs, and log lines, older than the retention period.
    Nothing younger than 90 days is ever removed."""
    cutoff = (now or datetime.utcnow()) - timedelta(days=retention_days(session))
    finished = (PipelineJobStatus.completed.value, PipelineJobStatus.failed.value, PipelineJobStatus.paused.value)
    old_jobs = session.exec(
        select(PipelineJob.id).where(PipelineJob.status.in_(finished), PipelineJob.finished_at != None,  # noqa: E711
                                     PipelineJob.finished_at < cutoff)
    ).all()
    removed = 0
    if old_jobs:
        session.exec(delete(PipelineLog).where(PipelineLog.job_id.in_(old_jobs)))
        removed = session.exec(delete(PipelineJob).where(PipelineJob.id.in_(old_jobs))).rowcount or 0
    session.exec(delete(PipelineLog).where(PipelineLog.at < cutoff))
    session.commit()
    return removed


def run(session: Session) -> None:
    enqueue_due(session)
    purge_old_logs(session)
