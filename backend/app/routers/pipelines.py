"""Pipeline Monitor API (SRS §5.4, §19.4): jobs, their step logs, the stop
and reprocess actions, scheduled pipeline configurations and log retention.
Everything returned is aggregate counts and metadata — no row values
(REQ-PIPE-010)."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.integration import Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import PipelineConfig, PipelineJob, PipelineJobStatus, PipelineLog
from app.models.template import FieldMapping
from app.models.user import User
from app.services import audit, pipeline_jobs, pipeline_runner
from app.services.settings_store import get_setting, put_setting

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

view = require_cap("pipelines.view")
manage = require_cap("pipelines.manage")

STATUSES = [s.value for s in PipelineJobStatus]


def _who(user: User) -> str:
    return user.full_name or user.email


def job_out(session: Session, job: PipelineJob) -> dict:
    participant = session.get(Participant, job.participant_id)
    integration = session.get(Integration, job.integration_id) if job.integration_id else None
    end = job.finished_at or (datetime.utcnow() if job.status == PipelineJobStatus.running.value else None)
    return {
        "id": job.id,
        "name": job.name,
        "participant_id": job.participant_id,
        "participant_name": participant.name if participant else "",
        "participant_code": participant.code if participant else "",
        "integration_id": job.integration_id,
        "source_name": integration.source_name if integration else None,
        "integration_mode": integration.integration_mode if integration else None,
        "submission_id": job.submission_id,
        "config_id": job.config_id,
        "trigger": job.trigger,
        "triggered_by": job.triggered_by,
        "status": job.status,
        "progress": job.progress,
        "current_step": job.current_step,
        "queued_at": job.queued_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "duration_seconds": round((end - job.started_at).total_seconds(), 1) if job.started_at and end else None,
        "records_processed": job.records_processed,
        "error_count": job.error_count,
        "warning_count": job.warning_count,
        "mapping_label": job.mapping_label,
        "stop_requested": job.stop_requested,
        "stopped_by": job.stopped_by,
        "reprocess_of_id": job.reprocess_of_id,
        "summary": job.summary,
    }


def _get_job(session: Session, job_id: int) -> PipelineJob:
    job = session.get(PipelineJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return job


# ---- jobs (REQ-PIPE-001..007) -------------------------------------------------

@router.get("/jobs")
def list_jobs(
    status: Optional[str] = None,
    participant_id: Optional[int] = None,
    integration_id: Optional[int] = None,
    limit: int = Query(default=200, ge=1, le=500),
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """Active and recent jobs, newest first, filtered by status and source
    institution (REQ-PIPE-007)."""
    if status is not None and status not in STATUSES:
        raise validation_error([problem("status", "enum", f"Status must be one of: {', '.join(STATUSES)}")])
    query = select(PipelineJob)
    if status is not None:
        query = query.where(PipelineJob.status == status)
    if participant_id is not None:
        query = query.where(PipelineJob.participant_id == participant_id)
    if integration_id is not None:
        query = query.where(PipelineJob.integration_id == integration_id)
    jobs = session.exec(query.order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc()).limit(limit)).all()
    return [job_out(session, j) for j in jobs]


@router.get("/summary")
def summary(session: Session = Depends(get_session), _: User = Depends(view)):
    """Counts for the monitor's KPI cards and the Technical dashboard
    (§15.3 Active Pipelines, queue depth)."""
    by_status = dict(session.exec(select(PipelineJob.status, func.count()).group_by(PipelineJob.status)).all())
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    finished_today = session.exec(select(PipelineJob).where(PipelineJob.finished_at != None, PipelineJob.finished_at >= today)).all()  # noqa: E711
    return {
        "by_status": {s: int(by_status.get(s, 0)) for s in STATUSES},
        "running": int(by_status.get(PipelineJobStatus.running.value, 0)),
        "queue_depth": int(by_status.get(PipelineJobStatus.queued.value, 0)),
        "completed_today": sum(1 for j in finished_today if j.status == PipelineJobStatus.completed.value),
        "failed_today": sum(1 for j in finished_today if j.status == PipelineJobStatus.failed.value),
        "records_today": sum(j.records_processed for j in finished_today if j.status == PipelineJobStatus.completed.value),
        "retention_days": pipeline_jobs.retention_days(session),
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    return job_out(session, _get_job(session, job_id))


@router.get("/jobs/{job_id}/logs")
def job_logs(job_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """REQ-PIPE-004: the step-by-step execution log."""
    _get_job(session, job_id)
    lines = session.exec(select(PipelineLog).where(PipelineLog.job_id == job_id).order_by(PipelineLog.at, PipelineLog.id)).all()
    return [{"id": line.id, "at": line.at, "step": line.step, "level": line.level, "message": line.message} for line in lines]


@router.post("/jobs/{job_id}/stop")
def stop_job(job_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """REQ-PIPE-006: the job ends Paused (§9.1) and can be reprocessed."""
    job = _get_job(session, job_id)
    try:
        job = pipeline_runner.request_stop(session, job, _who(user))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit.record(session, "PIPELINE_JOB_STOP", f"JOB-{job.id} {job.name}", user, request, status="WARNING")
    return job_out(session, job)


@router.post("/jobs/{job_id}/reprocess", status_code=202)
def reprocess_job(job_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """REQ-PIPE-005: failed (or stopped) jobs run again as a new job."""
    job = _get_job(session, job_id)
    try:
        new = pipeline_runner.reprocess(session, job, _who(user))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit.record(session, "PIPELINE_JOB_REPROCESS", f"JOB-{job.id} → JOB-{new.id}", user, request)
    return job_out(session, new)


# ---- configurations (REQ-PIPE-008) --------------------------------------------

def config_out(session: Session, config: PipelineConfig) -> dict:
    integration = session.get(Integration, config.integration_id)
    participant = session.get(Participant, integration.participant_id) if integration else None
    target = session.get(FieldMapping, config.mapping_id) if config.mapping_id else None
    return {
        "id": config.id,
        "name": config.name,
        "integration_id": config.integration_id,
        "source_name": integration.source_name if integration else None,
        "participant_id": participant.id if participant else None,
        "participant_name": participant.name if participant else None,
        "schedule_cron": config.schedule_cron,
        "mapping_id": config.mapping_id,
        "mapping_code": target.code if target else None,
        "active": config.active,
        "is_default": config.is_default,
        "next_run_at": config.next_run_at if config.active else None,
        "last_enqueued_at": config.last_enqueued_at,
        "created_by": config.created_by,
        "created_at": config.created_at,
        "updated_at": config.updated_at,
    }


class ConfigIn(BaseModel):
    name: str
    integration_id: int
    schedule_cron: str
    mapping_id: Optional[int] = None
    active: bool = True


class ConfigUpdate(BaseModel):
    name: Optional[str] = None
    schedule_cron: Optional[str] = None
    mapping_id: Optional[int] = None
    active: Optional[bool] = None


def _check_config(session: Session, data: dict, problems: list[dict]) -> None:
    if "name" in data and not (data["name"] or "").strip():
        problems.append(problem("name", "required", "Name the pipeline"))
    if "integration_id" in data:
        integration = session.get(Integration, data["integration_id"])
        if not integration:
            problems.append(problem("integration_id", "exists", "Choose a source"))
        elif integration.integration_mode != IntegrationMode.automated.value:
            problems.append(problem("integration_id", "mode",
                                    "Scheduled pipelines pull from Automated API sources; manual uploads are queued when they arrive"))
    if "schedule_cron" in data:
        try:
            pipeline_jobs.cron_trigger(data["schedule_cron"])
        except ValueError as exc:
            problems.append(problem("schedule_cron", "cron", str(exc)))
    if data.get("mapping_id") and not session.get(FieldMapping, data["mapping_id"]):
        problems.append(problem("mapping_id", "exists", "Mapping not found"))


@router.get("/configs")
def list_configs(session: Session = Depends(get_session), _: User = Depends(view)):
    return [config_out(session, c) for c in session.exec(select(PipelineConfig).order_by(PipelineConfig.name)).all()]


@router.post("/configs", status_code=201)
def create_config(body: ConfigIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    data = body.model_dump()
    problems: list[dict] = []
    _check_config(session, data, problems)
    if problems:
        raise validation_error(problems)
    config = PipelineConfig(name=body.name.strip(), integration_id=body.integration_id, schedule_cron=body.schedule_cron.strip(),
                            mapping_id=body.mapping_id, active=body.active, created_by=_who(user))
    pipeline_jobs.schedule_next(session, config)
    session.add(config)
    session.commit()
    session.refresh(config)
    audit.record(session, "PIPELINE_CONFIG_CREATE", f"{config.name} ({config.schedule_cron})", user, request)
    return config_out(session, config)


@router.put("/configs/{config_id}")
def update_config(config_id: int, body: ConfigUpdate, request: Request, session: Session = Depends(get_session),
                  user: User = Depends(manage)):
    config = session.get(PipelineConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    data = {k: getattr(body, k) for k in body.model_fields_set}
    problems: list[dict] = []
    _check_config(session, data, problems)
    if problems:
        raise validation_error(problems)
    if body.name is not None:
        config.name = body.name.strip()
    if body.schedule_cron is not None:
        config.schedule_cron = body.schedule_cron.strip()
    if "mapping_id" in data:
        config.mapping_id = body.mapping_id or None
    if body.active is not None:
        config.active = body.active
    pipeline_jobs.schedule_next(session, config)
    config.updated_at = datetime.utcnow()
    session.add(config)
    session.commit()
    audit.record(session, "PIPELINE_CONFIG_UPDATE", f"{config.name}: {', '.join(sorted(data))}", user, request)
    return config_out(session, config)


@router.get("/cron-preview")
def cron_preview(expr: str, session: Session = Depends(get_session), _: User = Depends(view)):
    """Validates a cron expression and shows its next runs (UTC), so the form
    can flag a bad schedule next to the input (§20.2)."""
    tz = get_setting(session, "organization").get("timezone") or "Africa/Kigali"
    try:
        runs = pipeline_jobs.next_runs(expr, datetime.utcnow(), count=3, tz=tz)
    except ValueError as exc:
        return {"valid": False, "message": str(exc), "next_runs": [], "timezone": tz}
    return {"valid": True, "message": "", "next_runs": runs, "timezone": tz}


# ---- settings (REQ-PIPE-009) --------------------------------------------------

class PipelineSettingsIn(BaseModel):
    log_retention_days: Optional[int] = None
    overdue_grace_days: Optional[int] = None


@router.get("/settings")
def read_settings(session: Session = Depends(get_session), _: User = Depends(require_cap("settings.view"))):
    return get_setting(session, "pipelines")


@router.put("/settings")
def write_settings(body: PipelineSettingsIn, request: Request, session: Session = Depends(get_session),
                   user: User = Depends(require_cap("settings.manage"))):
    problems: list[dict] = []
    if body.log_retention_days is not None and body.log_retention_days < pipeline_jobs.MIN_RETENTION_DAYS:
        problems.append(problem("log_retention_days", "min", "Pipeline logs must be kept for at least 90 days (REQ-PIPE-009)"))
    if body.overdue_grace_days is not None and not 0 <= body.overdue_grace_days <= 30:
        problems.append(problem("overdue_grace_days", "range", "Grace period must be between 0 and 30 days"))
    if problems:
        raise validation_error(problems)
    saved = put_setting(session, "pipelines", body.model_dump(exclude_none=True))
    audit.record(session, "SETTINGS_UPDATE", f"pipelines: {body.model_dump(exclude_none=True)}", user, request)
    return saved

