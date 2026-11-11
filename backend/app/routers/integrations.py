"""Integrations (SRS §5.3, §10.2, §19.4): each participant's data sources,
their status, and the manual sync trigger. Credentials and endpoint URLs are
stored encrypted and only ever returned masked."""

import csv
import hashlib
import io
import json
import random
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import settings
from app.core import crypto
from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.enums import IntegrationSource, IntegrationStatus
from app.models.integration import AuthType, Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import PipelineConfig, PipelineJob
from app.models.submission import Submission
from app.models.template import FieldMapping, IngestionTemplate, MappingVersion
from app.models.user import User
from app.routers import mappings
from app.services import audit, pipeline_jobs, pipeline_runner

router = APIRouter(prefix="/integrations", tags=["Integrations"])
# Standards & Mapping lives inside the Integrations area (REQ-MAP-009).
# Included first so /integrations/mappings never reaches /{integration_id}.
router.include_router(mappings.router)

view = require_cap("integrations.view")
manage = require_cap("integrations.manage")

MODES = [m.value for m in IntegrationMode]
AUTH_TYPES = [a.value for a in AuthType]


def _who(user: User) -> str:
    return user.full_name or user.email


# ---- output -------------------------------------------------------------------

def _masked_credentials(integration: Integration) -> dict:
    out = {}
    for key, value in pipeline_runner.credentials(integration).items():
        if not value:
            continue
        out[key] = "••••••••" if key == "client_secret" else crypto.mask(str(value), 8 if key == "token_url" else 4)
    return out


def integration_out(session: Session, i: Integration, participant: Optional[Participant] = None) -> dict:
    participant = participant or session.get(Participant, i.participant_id)
    template = session.get(IngestionTemplate, i.template_id) if i.template_id else None
    target = session.get(FieldMapping, i.mapping_id) if i.mapping_id else None
    version = session.get(MappingVersion, target.active_version_id) if target and target.active_version_id else None
    last = session.exec(
        select(Submission).where(Submission.integration_id == i.id).order_by(Submission.uploaded_at.desc(), Submission.id.desc())
    ).first()
    job = pipeline_runner.active_job(session, i.id)
    config = session.exec(
        select(PipelineConfig).where(PipelineConfig.integration_id == i.id, PipelineConfig.is_default == True,  # noqa: E712
                                     PipelineConfig.active == True)  # noqa: E712
    ).first()
    url = crypto.decrypt(i.endpoint_url_encrypted)
    return {
        "id": i.id,
        "participant_id": i.participant_id,
        "participant_name": participant.name if participant else "",
        "participant_code": participant.code if participant else "",
        "participant_type": participant.type if participant else "",
        "source_name": i.source_name,
        "integration_mode": i.integration_mode,
        "auth_type": i.auth_type,
        "endpoint_url_masked": crypto.mask(url, 8) if url else "",
        "credentials_masked": _masked_credentials(i),
        "configured": pipeline_runner.is_configured(i),
        "schedule_cron": i.schedule_cron,
        "next_run_at": config.next_run_at if config else None,
        "template_id": i.template_id,
        "template_name": f"{template.name} v{template.version}" if template else None,
        "mapping_id": i.mapping_id,
        "mapping_code": target.code if target else None,
        "mapping_version": version.label if version else None,
        "status": i.status,
        "paused": i.paused,
        "note": i.note,
        "source": i.source,
        "warnings": i.warnings or [],
        "last_sync_at": i.last_sync_at,
        "last_sync_records": i.last_sync_records,
        "last_sync_errors": i.last_sync_errors,
        "last_success_at": i.last_submission_at,  # REQ-INTG-004
        "last_submission": {  # REQ-INTG-009
            "id": last.id,
            "period": last.period,
            "status": last.status,
            "uploaded_at": last.uploaded_at,
            "records_received": last.records_received,
            "error_count": last.error_count,
            "warning_count": last.warning_count,
        } if last else None,
        "active_job": {"id": job.id, "status": job.status, "progress": job.progress} if job else None,
        "created_at": i.created_at,
        "created_by": i.created_by,
        "updated_at": i.updated_at,
        "updated_by": i.updated_by,
    }


# ---- DEMO feed (must stay above /{integration_id}) ------------------------------

def demo_feed_key(code: str) -> str:
    """API key the demo feed accepts for a participant (seeded, encrypted, on
    its Automated API integration)."""
    return "demo-" + hashlib.sha256(f"{settings.jwt_secret}:demo-feed:{code.upper()}".encode()).hexdigest()[:24]


@router.get("/demo-feed/{code}", tags=["Demo"])
def demo_feed(
    code: str,
    since: Optional[datetime] = Query(default=None, description="Last successful transfer (UTC); only newer hours are returned"),
    x_api_key: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    """DEMO ONLY — stands in for a participant's own API so the Automated API
    path (REQ-INTG-002b, INTG-006) can be shown end to end without a real
    institution. Returns SYNTHETIC hourly transaction summaries (aggregates,
    no customer-level data) as CSV, authenticated with the participant's
    demo API key. Not RSwitch data."""
    participant = session.exec(select(Participant).where(Participant.code == code.upper())).first()
    if not participant:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    if x_api_key != demo_feed_key(participant.code):
        raise HTTPException(status_code=401, detail="Invalid API key")
    now_hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start = now_hour - timedelta(hours=24)
    if since is not None:
        since = since.replace(tzinfo=None)
        start = max(since.replace(minute=0, second=0, microsecond=0), now_hour - timedelta(hours=72))
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["period_start", "channel_code", "txn_count", "txn_value_rwf"])
    hour = start
    while hour < now_hour:
        for channel, weight in (("Mobile", 6), ("Web", 2), ("POS", 2), ("ATM", 1)):
            rng = random.Random(f"{participant.code}:{hour.isoformat()}:{channel}")
            count = rng.randint(0, weight * 3)
            writer.writerow([hour.strftime("%Y-%m-%dT%H:%M:%S"), channel, count, round(count * rng.uniform(2500, 6000), 2)])
        hour += timedelta(hours=1)
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{participant.code}_demo_feed.csv"'})


# ---- reads ---------------------------------------------------------------------

@router.get("")
def list_integrations(
    status: Optional[IntegrationStatus] = None,
    participant_id: Optional[int] = None,
    participant_code: Optional[str] = None,
    mode: Optional[str] = None,
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    query = select(Integration, Participant).where(Integration.participant_id == Participant.id)
    if status is not None:
        query = query.where(Integration.status == status)
    if participant_id is not None:
        query = query.where(Integration.participant_id == participant_id)
    if participant_code is not None:
        query = query.where(Participant.code == participant_code)
    if mode is not None:
        query = query.where(Integration.integration_mode == mode)
    rows = session.exec(query.order_by(Participant.name, Integration.source_name)).all()
    return [integration_out(session, i, p) for i, p in rows]


def _get(session: Session, integration_id: int) -> Integration:
    integration = session.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return integration


@router.get("/{integration_id}")
def get_integration(integration_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    return integration_out(session, _get(session, integration_id))


# ---- configuration (REQ-INTG-005, Technical/Admin) ----------------------------

class CredentialsIn(BaseModel):
    api_key: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    token_url: Optional[str] = None


class IntegrationIn(BaseModel):
    participant_id: int
    source_name: str
    integration_mode: str = IntegrationMode.manual.value
    endpoint_url: Optional[str] = None
    auth_type: str = AuthType.none.value
    credentials: Optional[CredentialsIn] = None
    schedule_cron: str = ""
    template_id: Optional[int] = None
    mapping_id: Optional[int] = None


class IntegrationUpdate(BaseModel):
    source_name: Optional[str] = None
    integration_mode: Optional[str] = None
    endpoint_url: Optional[str] = None
    auth_type: Optional[str] = None
    credentials: Optional[CredentialsIn] = None  # replaces the stored ones when given
    clear_credentials: bool = False
    schedule_cron: Optional[str] = None
    template_id: Optional[int] = None
    mapping_id: Optional[int] = None
    paused: Optional[bool] = None


def _valid_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _apply(session: Session, integration: Integration, data: dict, problems: list[dict]) -> None:
    """Validate and copy configuration fields present in `data` onto the row."""
    if "source_name" in data:
        name = (data["source_name"] or "").strip()
        if not name:
            problems.append(problem("source_name", "required", "Name the data source, e.g. Core Banking"))
        else:
            clash = session.exec(select(Integration.id).where(
                Integration.participant_id == integration.participant_id, Integration.source_name == name,
                Integration.id != (integration.id or 0))).first()
            if clash:
                problems.append(problem("source_name", "unique", "This participant already has a data source with that name"))
            integration.source_name = name
    if "integration_mode" in data:
        if data["integration_mode"] not in MODES:
            problems.append(problem("integration_mode", "enum", f"Integration mode must be one of: {', '.join(MODES)}"))
        else:
            integration.integration_mode = data["integration_mode"]
    automated = integration.integration_mode == IntegrationMode.automated.value
    if "auth_type" in data and data["auth_type"] is not None:
        if data["auth_type"] not in AUTH_TYPES:
            problems.append(problem("auth_type", "enum", f"Authentication must be one of: {', '.join(AUTH_TYPES)}"))
        else:
            integration.auth_type = data["auth_type"]
    if data.get("endpoint_url"):
        url = data["endpoint_url"].strip()
        if not automated:
            problems.append(problem("endpoint_url", "mode", "An endpoint URL applies to Automated API mode only"))
        elif not _valid_url(url):
            problems.append(problem("endpoint_url", "url", "Enter a full http(s) URL, e.g. https://api.bank.rw/rdip/summary"))
        else:
            integration.endpoint_url_encrypted = crypto.encrypt(url)
    if data.get("clear_credentials"):
        integration.credentials_encrypted = ""
    creds = {k: (v or "").strip() for k, v in (data.get("credentials") or {}).items() if (v or "").strip()}
    if creds:
        if not automated:
            problems.append(problem("credentials", "mode", "Credentials apply to Automated API mode only"))
        else:
            needed = {AuthType.api_key.value: ["api_key"], AuthType.oauth2.value: ["client_id", "client_secret", "token_url"]}
            missing = [k for k in needed.get(integration.auth_type, []) if k not in creds]
            if missing:
                problems.append(problem("credentials", "required", f"{integration.auth_type} needs: {', '.join(missing)}"))
            elif integration.auth_type == AuthType.oauth2.value and not _valid_url(creds["token_url"]):
                problems.append(problem("credentials.token_url", "url", "Enter the full http(s) URL of the token endpoint"))
            else:
                integration.credentials_encrypted = crypto.encrypt(json.dumps(creds))
    if not automated:
        # Manual sources never hold API secrets.
        integration.endpoint_url_encrypted = ""
        integration.credentials_encrypted = ""
        integration.auth_type = AuthType.none.value
    if "schedule_cron" in data and data["schedule_cron"] is not None:
        cron = data["schedule_cron"].strip()
        if cron:
            try:
                pipeline_jobs.cron_trigger(cron)
            except ValueError as exc:
                problems.append(problem("schedule_cron", "cron", str(exc)))
        integration.schedule_cron = cron
    if "template_id" in data:
        template = session.get(IngestionTemplate, data["template_id"]) if data["template_id"] else None
        if data["template_id"] and (not template or template.participant_id != integration.participant_id):
            problems.append(problem("template_id", "exists", "Choose one of this participant's ingestion templates"))
        else:
            integration.template_id = template.id if template else None
    if "mapping_id" in data:
        if data["mapping_id"] and not session.get(FieldMapping, data["mapping_id"]):
            problems.append(problem("mapping_id", "exists", "Mapping not found"))
        else:
            integration.mapping_id = data["mapping_id"] or None


def _sync_default_config(session: Session, integration: Integration, participant: Participant, user: str) -> None:
    """API mode: the integration's schedule is its pull schedule, run by a
    default PipelineConfig kept in step here (REQ-INTG-002b, PIPE-008)."""
    config = session.exec(
        select(PipelineConfig).where(PipelineConfig.integration_id == integration.id, PipelineConfig.is_default == True)  # noqa: E712
    ).first()
    if integration.integration_mode == IntegrationMode.automated.value and integration.schedule_cron:
        if config is None:
            config = PipelineConfig(name="", integration_id=integration.id, schedule_cron=integration.schedule_cron,
                                    is_default=True, created_by=user)
        config.name = f"{participant.code} {integration.source_name} — scheduled pull"
        config.schedule_cron = integration.schedule_cron
        config.mapping_id = integration.mapping_id
        config.active = True
        config.updated_at = datetime.utcnow()
        pipeline_jobs.schedule_next(session, config)
        session.add(config)
    elif config is not None and config.active:
        config.active = False
        config.updated_at = datetime.utcnow()
        session.add(config)


def _settle_status(session: Session, integration: Integration, user: str, *, created: bool = False) -> None:
    if integration.paused:
        target = IntegrationStatus.paused
        note = f"Paused by {user}"
    elif not pipeline_runner.is_configured(integration):
        target = IntegrationStatus.not_configured
        note = "Endpoint URL or credentials not configured"
    elif created or integration.status in (IntegrationStatus.not_configured, IntegrationStatus.paused):
        target = pipeline_runner.status_after_resume(integration)
        note = "Configured — awaiting the first transfer" if target == IntegrationStatus.pending else f"Resumed by {user}"
    else:
        return
    if integration.status != target or created:
        pipeline_runner.set_integration_status(session, integration, target, note=note, source=IntegrationSource.manual,
                                               actor=user, notify=False)


@router.post("", status_code=201)
def create_integration(body: IntegrationIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    participant = session.get(Participant, body.participant_id)
    if not participant:
        raise validation_error([problem("participant_id", "exists", "Choose a participant")])
    integration = Integration(participant_id=participant.id, created_by=_who(user), updated_by=_who(user))
    problems: list[dict] = []
    data = body.model_dump()
    data["credentials"] = body.credentials.model_dump() if body.credentials else None
    _apply(session, integration, data, problems)
    if problems:
        raise validation_error(problems)
    session.add(integration)
    session.commit()
    session.refresh(integration)
    _sync_default_config(session, integration, participant, _who(user))
    _settle_status(session, integration, _who(user), created=True)
    session.commit()
    audit.record(session, "INTEGRATION_CREATE", f"{participant.code} · {integration.source_name} ({integration.integration_mode})",
                 user, request)
    return integration_out(session, integration, participant)


@router.put("/{integration_id}")
def update_integration(integration_id: int, body: IntegrationUpdate, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(manage)):
    integration = _get(session, integration_id)
    participant = session.get(Participant, integration.participant_id)
    data = {k: getattr(body, k) for k in body.model_fields_set}
    if body.credentials is not None:
        data["credentials"] = body.credentials.model_dump()
    if body.clear_credentials:
        data["clear_credentials"] = True
    problems: list[dict] = []
    _apply(session, integration, data, problems)
    if problems:
        session.rollback()
        raise validation_error(problems)
    if body.paused is not None:
        integration.paused = body.paused
    integration.updated_at = datetime.utcnow()
    integration.updated_by = _who(user)
    session.add(integration)
    session.commit()
    _sync_default_config(session, integration, participant, _who(user))
    _settle_status(session, integration, _who(user))
    session.commit()
    changed = ", ".join(sorted(k for k in data if k != "credentials")) + (", credentials" if body.credentials else "")
    audit.record(session, "INTEGRATION_UPDATE", f"{participant.code} · {integration.source_name}: {changed}", user, request)
    return integration_out(session, integration, participant)


@router.post("/{integration_id}/sync", status_code=202)
def sync_now(integration_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """REQ-INTG-006: queue a pull from the participant's endpoint now."""
    integration = _get(session, integration_id)
    if integration.integration_mode != IntegrationMode.automated.value:
        raise validation_error([problem("integration_mode", "mode", "Manual sync applies to Automated API integrations only")])
    if not pipeline_runner.is_configured(integration):
        raise validation_error([problem("endpoint_url", "required", "Configure the endpoint URL and credentials first")])
    if integration.paused:
        raise HTTPException(status_code=409, detail="This data source is paused. Resume it before syncing.")
    running = pipeline_runner.active_job(session, integration.id)
    if running:
        raise HTTPException(status_code=409, detail=f"JOB-{running.id} for this data source is already {running.status.lower()}.")
    job = pipeline_runner.enqueue(session, integration=integration, trigger="Manual sync", triggered_by=_who(user))
    participant = session.get(Participant, integration.participant_id)
    audit.record(session, "INTEGRATION_SYNC", f"{participant.code} · {integration.source_name} → JOB-{job.id}", user, request)
    from app.routers.pipelines import job_out

    return job_out(session, job)


@router.get("/{integration_id}/submissions")
def integration_submissions(integration_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """Every transfer on this data source (REQ-INTG-009/011)."""
    _get(session, integration_id)
    from app.routers.submissions import submission_out

    rows = session.exec(
        select(Submission).where(Submission.integration_id == integration_id).order_by(Submission.uploaded_at.desc(), Submission.id.desc())
    ).all()
    return [submission_out(session, s) for s in rows]


@router.get("/{integration_id}/jobs")
def integration_jobs(integration_id: int, limit: int = 20, session: Session = Depends(get_session), _: User = Depends(view)):
    _get(session, integration_id)
    from app.routers.pipelines import job_out

    jobs = session.exec(
        select(PipelineJob).where(PipelineJob.integration_id == integration_id).order_by(PipelineJob.queued_at.desc()).limit(min(limit, 100))
    ).all()
    return [job_out(session, j) for j in jobs]

