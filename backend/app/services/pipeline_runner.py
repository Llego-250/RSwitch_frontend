"""Asynchronous pipeline execution (SRS §5.4, §17.3, §17.6.3).

Jobs are rows in PipelineJob; a background worker thread (started with the
scheduler) takes them Queued → Running → Completed / Failed, or Paused when a
Technical/Admin user stops one. The database is the queue's source of truth:
the in-memory queue only wakes the worker early, the worker also polls, and a
job is claimed with an atomic UPDATE so it can never run twice.

Steps: Extract (read the stored file or pull from the participant's API) →
Validate (expected schema) → Transform (the active published mapping,
REQ-MAP-007) → Load (aggregates only). Logs carry counts, field names and
row numbers — never row values (REQ-PIPE-010).

The worker runs inside the API process, so v1 assumes a single API process
(§17.6.3 single-server deployment)."""

import json
import logging
import queue
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from sqlalchemy import update
from sqlmodel import Session, select

from app.core import crypto
from app.db import engine
from app.models.enums import IntegrationSource, IntegrationStatus, SubmissionResult, UserRole
from app.models.integration import AuthType, Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import ACTIVE_JOB_STATUSES, PipelineConfig, PipelineJob, PipelineJobStatus, PipelineLog
from app.models.submission import Submission
from app.services import ingestion, mapping

log = logging.getLogger("rdip.pipelines")

PROGRESS_AT = {"Extract": 5, "Validate": 30, "Transform": 55, "Load": 80}
MAX_LOGGED_ISSUES = 20
HEARTBEAT_STALE = timedelta(minutes=2)
POLL_SECONDS = 5
FETCH_TIMEOUT_SECONDS = 30
ACCEPT = "text/csv, application/xml, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_queue: "queue.Queue[int]" = queue.Queue()
_worker: Optional[threading.Thread] = None
_worker_lock = threading.Lock()

Q, R, C, F, P = (s.value for s in (PipelineJobStatus.queued, PipelineJobStatus.running, PipelineJobStatus.completed,
                                   PipelineJobStatus.failed, PipelineJobStatus.paused))


class JobStopped(Exception):
    pass


class JobFailed(Exception):
    pass


def _size(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} MB" if n >= 1024 * 1024 else f"{n / 1024:.1f} KB"


def is_configured(integration: Integration) -> bool:
    """API mode needs an endpoint and the credentials its auth type uses."""
    if integration.integration_mode != IntegrationMode.automated.value:
        return True
    if not integration.endpoint_url_encrypted:
        return False
    if integration.auth_type == AuthType.none.value:
        return True
    creds = credentials(integration)
    if integration.auth_type == AuthType.api_key.value:
        return bool(creds.get("api_key"))
    return all(creds.get(k) for k in ("client_id", "client_secret", "token_url"))


def credentials(integration: Integration) -> dict:
    """Decrypted only at the moment of use; never logged or returned."""
    raw = crypto.decrypt(integration.credentials_encrypted)
    try:
        return json.loads(raw) if raw else {}
    except ValueError:
        return {}


# ---- integration status (§9.1) ----------------------------------------------

def set_integration_status(
    session: Session,
    integration: Integration,
    status: IntegrationStatus,
    *,
    note: str = "",
    source: IntegrationSource = IntegrationSource.pipeline,
    actor: str = "System",
    warnings: Optional[list] = None,
    notify: bool = True,
    dedupe: str = "",
) -> None:
    """Every status change goes through here. Turning Failed notifies the
    Technical/Admin team (REQ-INTG-010, §13) — once per failure, not on
    every later failed attempt."""
    previous = integration.status
    previous_since = integration.updated_at
    integration.status = status
    integration.note = note
    integration.source = source
    integration.updated_at = datetime.utcnow()
    integration.updated_by = actor
    if warnings is not None:
        integration.warnings = warnings
    session.add(integration)
    if status != previous:  # status history for integration uptime (REQ-P360-007)
        from app.services.risk import record_status_change

        record_status_change(session, integration, previous=previous, since=previous_since)
    session.commit()
    if notify and status == IntegrationStatus.failed and previous != IntegrationStatus.failed:
        notify_technical(
            session,
            "integration_failed",
            integration,
            f"Integration failed — {_label(session, integration)}",
            note,
            dedupe_key=f"integration_failed:{integration.id}:{dedupe or uuid4().hex}",
        )


def _label(session: Session, integration: Integration) -> str:
    participant = session.get(Participant, integration.participant_id)
    return f"{participant.name if participant else 'Participant'} · {integration.source_name}"


def notify_technical(session: Session, event: str, integration: Optional[Integration], title: str, message: str,
                     *, dedupe_key: str, link: str = "/integrations") -> None:
    from app.services.notify import dispatch, users_with_roles

    dispatch(session, event, users_with_roles(session, UserRole.technical), title, message,
             link=link, severity="alert", dedupe_key=dedupe_key)


def record_rejected_transfer(session: Session, integration: Integration, submission: Submission) -> None:
    """A manual upload that failed validation: the last transfer was rejected."""
    integration.last_sync_at = submission.uploaded_at
    integration.last_sync_records = submission.records_received
    integration.last_sync_errors = submission.error_count
    set_integration_status(
        session, integration, IntegrationStatus.failed,
        note=f"SUB-{submission.id} ({submission.period}) failed validation with {submission.error_count} error(s)",
        dedupe=f"sub{submission.id}",
    )


def status_after_resume(integration: Integration) -> IntegrationStatus:
    """When an admin un-pauses a data source, show what its last transfer said."""
    if not is_configured(integration):
        return IntegrationStatus.not_configured
    if integration.last_sync_at is None:
        return IntegrationStatus.pending
    if integration.last_sync_errors or (integration.last_submission_at or datetime.min) < integration.last_sync_at:
        return IntegrationStatus.failed
    return IntegrationStatus.warning if integration.warnings else IntegrationStatus.healthy


# ---- queueing and control -------------------------------------------------------

def active_job(session: Session, integration_id: int) -> Optional[PipelineJob]:
    return session.exec(
        select(PipelineJob).where(PipelineJob.integration_id == integration_id, PipelineJob.status.in_(ACTIVE_JOB_STATUSES))
    ).first()


def _job_name(session: Session, integration: Optional[Integration], submission: Optional[Submission], participant: Participant) -> str:
    source = integration.source_name if integration else "Data submission"
    what = f"SUB-{submission.id} ({submission.period})" if submission else "API pull"
    return f"{participant.code} · {source} · {what}"


def add_log(session: Session, job_id: int, step: str, message: str, level: str = "INFO") -> None:
    session.add(PipelineLog(job_id=job_id, step=step, level=level, message=message[:500]))


def enqueue(
    session: Session,
    *,
    integration: Optional[Integration],
    submission: Optional[Submission] = None,
    participant_id: Optional[int] = None,
    config: Optional[PipelineConfig] = None,
    trigger: str,
    triggered_by: str,
    reprocess_of: Optional[PipelineJob] = None,
) -> PipelineJob:
    participant = session.get(Participant, participant_id or (integration.participant_id if integration else submission.participant_id))
    job = PipelineJob(
        name=_job_name(session, integration, submission, participant),
        participant_id=participant.id,
        integration_id=integration.id if integration else None,
        submission_id=submission.id if submission else None,
        config_id=config.id if config else None,
        trigger=trigger,
        triggered_by=triggered_by,
        reprocess_of_id=reprocess_of.id if reprocess_of else None,
    )
    session.add(job)
    session.flush()
    origin = f" — reprocessing JOB-{reprocess_of.id}" if reprocess_of else ""
    add_log(session, job.id, "Queue", f"Queued ({trigger}) by {triggered_by}{origin}")
    session.commit()
    session.refresh(job)
    if integration:
        set_integration_status(session, integration, IntegrationStatus.queued, note=f"JOB-{job.id} queued ({trigger})")
    _queue.put(job.id)
    return job


def request_stop(session: Session, job: PipelineJob, user: str) -> PipelineJob:
    """REQ-PIPE-006. A queued job stops at once; a running one at its next
    checkpoint (between steps) and ends Paused, having loaded nothing."""
    if job.status == Q:
        job.status = P
        job.finished_at = datetime.utcnow()
        job.stopped_by = user
        job.summary = f"Stopped by {user} before it started"
        add_log(session, job.id, "Queue", job.summary, "WARN")
        session.add(job)
        session.commit()
        integration = session.get(Integration, job.integration_id) if job.integration_id else None
        if integration:
            set_integration_status(session, integration, IntegrationStatus.paused, note=f"JOB-{job.id} stopped by {user}", actor=user)
    elif job.status == R:
        job.stop_requested = True
        job.stopped_by = user
        add_log(session, job.id, job.current_step or "Queue", f"Stop requested by {user}", "WARN")
        session.add(job)
        session.commit()
    else:
        raise ValueError("Only a running or queued job can be stopped")
    session.refresh(job)
    return job


def reprocess(session: Session, job: PipelineJob, user: str) -> PipelineJob:
    """REQ-PIPE-005: a new job over the same input; the old one stays in the
    history untouched."""
    if job.status not in (F, P):
        raise ValueError("Only failed or paused jobs can be reprocessed")
    integration = session.get(Integration, job.integration_id) if job.integration_id else None
    submission = session.get(Submission, job.submission_id) if job.submission_id else None
    config = session.get(PipelineConfig, job.config_id) if job.config_id else None
    return enqueue(session, integration=integration, submission=submission, participant_id=job.participant_id,
                   config=config, trigger="Reprocess", triggered_by=user, reprocess_of=job)


# ---- worker -----------------------------------------------------------------

def start_worker() -> None:
    global _worker
    with _worker_lock:
        if _worker is not None and _worker.is_alive():
            return
        _recover_orphans()
        with Session(engine) as session:  # pick up what was waiting at once
            for job_id in session.exec(select(PipelineJob.id).where(PipelineJob.status == Q).order_by(PipelineJob.queued_at)).all():
                _queue.put(job_id)
        _worker = threading.Thread(target=_work_loop, name="rdip-pipeline-worker", daemon=True)
        _worker.start()


def _recover_orphans() -> None:
    """A job left Running by a crash or restart (stale heartbeat) is queued again."""
    cutoff = datetime.utcnow() - HEARTBEAT_STALE
    with Session(engine) as session:
        orphans = session.exec(
            select(PipelineJob).where(PipelineJob.status == R, (PipelineJob.heartbeat_at == None) | (PipelineJob.heartbeat_at < cutoff))  # noqa: E711
        ).all()
        for job in orphans:
            job.status = Q
            job.stop_requested = False
            add_log(session, job.id, job.current_step or "Queue", "Worker restarted while this job was running — queued again", "WARN")
            session.add(job)
        session.commit()


def _next_queued_id() -> Optional[int]:
    with Session(engine) as session:
        return session.exec(select(PipelineJob.id).where(PipelineJob.status == Q).order_by(PipelineJob.queued_at, PipelineJob.id)).first()


def _work_loop() -> None:
    while True:
        try:
            try:
                job_id: Optional[int] = _queue.get(timeout=POLL_SECONDS)
            except queue.Empty:
                _recover_orphans()
                job_id = _next_queued_id()
            if job_id is not None:
                run_job(job_id)
        except Exception:  # the worker must outlive any single job
            log.exception("Pipeline worker error")


def run_pending(limit: int = 100) -> int:
    """Run queued jobs in the calling thread (seed, tests, CLI)."""
    done = 0
    while done < limit:
        job_id = _next_queued_id()
        if job_id is None or run_job(job_id) is None:
            break
        done += 1
    return done


def _claim(session: Session, job_id: int) -> bool:
    now = datetime.utcnow()
    result = session.exec(
        update(PipelineJob)
        .where(PipelineJob.id == job_id, PipelineJob.status == Q)
        .values(status=R, started_at=now, heartbeat_at=now, finished_at=None, progress=0, stop_requested=False)
    )
    session.commit()
    return result.rowcount == 1


def run_job(job_id: int, *, quiet: bool = False) -> Optional[str]:
    """Execute one queued job to the end. Returns its final status, or None
    when the job was not (or no longer) queued. quiet=True skips
    notifications and post-load analytics (used for seeding history)."""
    with Session(engine) as session:
        if not _claim(session, job_id):
            return None
        run = _Run(session, session.get(PipelineJob, job_id), quiet=quiet)
        try:
            run.execute()
        except JobStopped:
            run.pause()
        except JobFailed as exc:
            run.fail(str(exc))
        except Exception as exc:
            log.exception("Pipeline job %s crashed in %s", job_id, run.step)
            session.rollback()
            run.fail(f"Unexpected {type(exc).__name__} during {run.step} — details are in the server log")
        status = run.job.status
    if status == C and not quiet:
        _after_load()
    return status


def _after_load() -> None:
    """New aggregates feed the AI anomaly scan (advisory; its failure never
    affects the job)."""
    try:
        from app.services import anomaly

        with Session(engine) as session:
            anomaly.detect(session)
    except Exception:
        log.exception("Anomaly scan after pipeline load failed")


class _Run:
    def __init__(self, session: Session, job: PipelineJob, *, quiet: bool):
        self.session = session
        self.job = job
        self.quiet = quiet
        self.step = "Queue"
        self.participant = session.get(Participant, job.participant_id)
        self.integration = session.get(Integration, job.integration_id) if job.integration_id else None
        self.submission = session.get(Submission, job.submission_id) if job.submission_id else None
        self.config = session.get(PipelineConfig, job.config_id) if job.config_id else None

    # -- bookkeeping --
    def log(self, message: str, level: str = "INFO") -> None:
        add_log(self.session, self.job.id, self.step, message, level)
        self.job.heartbeat_at = datetime.utcnow()
        self.session.add(self.job)
        self.session.commit()

    def enter(self, step: str) -> None:
        self.check_stop()
        self.step = step
        self.job.current_step = step
        self.job.progress = PROGRESS_AT[step]
        self.log(f"{step} started")

    def check_stop(self) -> None:
        self.session.refresh(self.job, attribute_names=["stop_requested", "stopped_by"])
        if self.job.stop_requested:
            raise JobStopped()

    def log_issues(self, issues: list[dict], level: str) -> None:
        for entry in issues[:MAX_LOGGED_ISSUES]:
            where = f"Row {entry['row']}" if entry.get("row") else "File"
            self.log(f"{where} · {entry.get('column', '')}: {entry.get('description', '')}", level)
        if len(issues) > MAX_LOGGED_ISSUES:
            self.log(f"…and {len(issues) - MAX_LOGGED_ISSUES} more", level)

    # -- the steps --
    def execute(self) -> None:
        if self.integration:
            set_integration_status(self.session, self.integration, IntegrationStatus.running,
                                   note=f"JOB-{self.job.id} running", notify=False)
        self.log(f"Started by the pipeline worker ({self.job.trigger})")

        self.enter("Extract")
        data, filename = self.extract()
        try:
            table = ingestion.read_rows(filename, data)
        except (ingestion.FileRejected, ingestion.UnsupportedFormat) as exc:
            description = getattr(exc, "description", str(exc))
            if self.submission is None:
                self.record_pulled(data, filename, [ingestion.issue(0, "file", getattr(exc, "rule", "format"), description)], [], 0)
            self.job.error_count = 1
            raise JobFailed(description)
        self.job.records_processed = len(table.rows)
        self.log(f"Read {len(table.rows):,} records with {len(table.columns)} columns")

        self.enter("Validate")
        template = self.template()
        columns = ingestion.template_columns(self.session, template.id)
        errors, warnings = ingestion.validate_rows(table, columns)
        if self.submission is None and not table.rows:
            # An incremental pull with nothing new is normal, not a warning.
            warnings = [w for w in warnings if w["rule"] != "no_rows"]
            self.log("No new records since the last successful transfer")
        self.log(f"Validated against TPL-{template.id} '{template.name}' v{template.version}: "
                 f"{len(errors)} error(s), {len(warnings)} warning(s)")
        self.log_issues(errors, "ERROR")
        self.log_issues(warnings, "WARN")
        self.after_validation(data, filename, table, errors, warnings, template)
        if errors:
            self.job.error_count = len(errors)
            raise JobFailed(f"{len(errors)} validation error(s) — nothing was loaded (no partial ingestion)")

        self.enter("Transform")
        mapping_id = (self.config.mapping_id if self.config and self.config.mapping_id else None) or (
            self.integration.mapping_id if self.integration else None)
        try:
            plan = mapping.resolve_plan(self.session, mapping_id, columns)
        except mapping.MappingUnavailable as exc:
            raise JobFailed(str(exc))
        self.job.mapping_id, self.job.mapping_version_id = plan.mapping_id, plan.version_id
        self.job.mapping_label = plan.label if plan.mapping_id else ""
        self.log(plan.description)
        canonical, t_errors, t_warnings = plan.apply(table.rows, [c.name for c in columns])
        self.log_issues(t_errors, "ERROR")
        self.log_issues(t_warnings, "WARN")
        if t_errors:
            self.job.error_count = len(t_errors)
            raise JobFailed(f"{len(t_errors)} value(s) could not be transformed — nothing was loaded (no partial ingestion)")
        warnings = warnings + t_warnings
        self.log(f"Transformed {len(canonical):,} records")

        self.enter("Load")
        transactions, totals, breakdowns = ingestion.aggregate(canonical, plan.numeric, plan.categorical, plan.weight_field)
        submission = self.submission
        submission.row_count = transactions
        submission.numeric_totals = totals
        submission.breakdowns = breakdowns
        submission.warnings = warnings[: ingestion.MAX_STORED_ISSUES]
        submission.warning_count = len(warnings)
        submission.loaded_at = datetime.utcnow()
        self.session.add(submission)
        self.session.commit()
        self.log(f"Loaded aggregates for SUB-{submission.id}: {transactions:,} transactions; "
                 f"totals for {', '.join(totals) or 'no numeric fields'}; breakdowns by {', '.join(breakdowns) or 'none'}")
        self.complete(warnings)

    def extract(self) -> tuple[bytes, str]:
        if self.submission is not None:
            from app.storage import get_file

            data = get_file(self.submission.storage_key)
            self.log(f"Read {self.submission.filename} ({_size(len(data))}) from file storage")
            return data, self.submission.filename
        integration = self.integration
        if integration is None or integration.integration_mode != IntegrationMode.automated.value:
            raise JobFailed("Nothing to extract: no stored file and the data source is not an Automated API integration")
        if not is_configured(integration):
            raise JobFailed("The integration's endpoint URL or credentials are not configured")
        url = crypto.decrypt(integration.endpoint_url_encrypted)
        if integration.last_submission_at:
            # Incremental pull: the source sends only what is newer than the
            # last successful transfer.
            since = urllib.parse.quote(integration.last_submission_at.strftime("%Y-%m-%dT%H:%M:%S"))
            url = f"{url}{'&' if urllib.parse.urlparse(url).query else '?'}since={since}"
        headers = {"Accept": ACCEPT}
        creds = credentials(integration)
        if integration.auth_type == AuthType.api_key.value:
            headers["X-API-Key"] = creds["api_key"]
        elif integration.auth_type == AuthType.oauth2.value:
            headers["Authorization"] = f"Bearer {self.oauth_token(creds)}"
        self.log(f"Requesting data from the configured endpoint ({integration.auth_type} authentication)")
        status, content_type, body = fetch("GET", url, headers)
        if status >= 400:
            raise JobFailed(f"The endpoint responded HTTP {status}")
        if len(body) > ingestion.MAX_UPLOAD_BYTES:
            raise JobFailed("The endpoint returned more than 50 MB")
        ext = _extension_for(content_type, url)
        self.log(f"Received {_size(len(body))} ({ext.upper()}), HTTP {status}")
        stamp = datetime.utcnow().strftime("%Y%m%d%H%M")
        return body, f"{self.participant.code}_{stamp}.{ext}"

    def oauth_token(self, creds: dict) -> str:
        """OAuth 2.0 client-credentials grant (§16)."""
        form = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": creds["client_id"],
                                       "client_secret": creds["client_secret"]}).encode()
        status, _, body = fetch("POST", creds["token_url"], {"Content-Type": "application/x-www-form-urlencoded",
                                                             "Accept": "application/json"}, form)
        if status >= 400:
            raise JobFailed(f"The OAuth token endpoint responded HTTP {status}")
        try:
            token = json.loads(body or b"{}").get("access_token")
        except ValueError:
            token = None
        if not token:
            raise JobFailed("The OAuth token endpoint returned no access_token")
        self.log("Obtained an OAuth 2.0 access token")
        return token

    def template(self):
        template = None
        if self.submission and self.submission.template_id:
            from app.models.template import IngestionTemplate

            template = self.session.get(IngestionTemplate, self.submission.template_id)
        if template is None:
            template = ingestion.resolve_template(self.session, self.job.participant_id, integration=self.integration)
        if template is None:
            raise JobFailed("No expected schema (ingestion template) is configured for this data source")
        return template

    def after_validation(self, data, filename, table, errors, warnings, template) -> None:
        """Make sure the transfer is a Submission in the history (REQ-INTG-011):
        an API pull becomes one now; re-validating a failed upload that now
        passes records a new attempt that replaces it (§6.4)."""
        if self.submission is None:
            self.record_pulled(data, filename, errors, warnings, len(table.rows), template.id)
        elif self.submission.status == "Validation Failed" and not errors:
            old = self.submission
            new = Submission(
                participant_id=old.participant_id, integration_id=old.integration_id, template_id=template.id,
                requirement_id=old.requirement_id, replaces_submission_id=old.id, period=old.period,
                filename=old.filename, storage_key=old.storage_key, uploaded_by=f"Reprocessed by {self.job.triggered_by}",
                result=SubmissionResult.passed, status="Submitted", records_received=len(table.rows),
                warning_count=len(warnings), warnings=warnings[: ingestion.MAX_STORED_ISSUES],
            )
            self.session.add(new)
            self.session.commit()
            self.session.refresh(new)
            self.submission = new
            self.job.submission_id = new.id
            self.log(f"SUB-{old.id} now passes validation — recorded as SUB-{new.id}, which replaces it")
            self.on_ingested(new)

    def record_pulled(self, data: bytes, filename: str, errors: list, warnings: list, records: int,
                      template_id: Optional[int] = None) -> None:
        from app.storage import put_file

        ext = ingestion.file_extension(filename)
        key = f"submissions/{self.participant.id}/{uuid4()}-{filename}"
        put_file(key, data, ingestion.CONTENT_TYPES.get(ext, "application/octet-stream"))
        requirement_id = None
        if template_id:
            from app.models.compliance import ComplianceRequirement

            requirement_id = self.session.exec(
                select(ComplianceRequirement.id).where(
                    ComplianceRequirement.participant_id == self.participant.id,
                    ComplianceRequirement.template_id == template_id,
                    ComplianceRequirement.kind == "Data Return",
                    ComplianceRequirement.active == True,  # noqa: E712
                ).order_by(ComplianceRequirement.due_date)
            ).first()
        submission = Submission(
            participant_id=self.participant.id, integration_id=self.integration.id, template_id=template_id,
            requirement_id=requirement_id, period=datetime.utcnow().strftime("%d %B %Y"), filename=filename,
            storage_key=key, uploaded_by="Automated API sync",
            result=SubmissionResult.failed if errors else SubmissionResult.passed,
            status="Validation Failed" if errors else "Submitted", records_received=records,
            error_count=len(errors), errors=errors[: ingestion.MAX_STORED_ISSUES],
            warning_count=len(warnings), warnings=warnings[: ingestion.MAX_STORED_ISSUES],
        )
        self.session.add(submission)
        self.session.commit()
        self.session.refresh(submission)
        self.submission = submission
        self.job.submission_id = submission.id
        self.log(f"Recorded the pull as SUB-{submission.id} ({submission.status})")
        if errors and not self.quiet:
            ingestion.notify_validation_failed(self.session, submission, self.participant)
        self.on_ingested(submission)

    def on_ingested(self, submission: Submission) -> None:
        from app.services import compliance_hooks

        compliance_hooks.on_submission_ingested(self.session, submission)

    # -- endings --
    def _finish(self, status: str, summary: str) -> None:
        now = datetime.utcnow()
        self.job.status = status
        self.job.finished_at = now
        self.job.heartbeat_at = now
        self.job.summary = summary[:500]
        self.session.add(self.job)
        self.session.commit()

    def _record_sync(self, success: bool) -> None:
        integration = self.integration
        integration.last_sync_at = self.job.finished_at
        integration.last_sync_records = self.job.records_processed
        integration.last_sync_errors = self.job.error_count
        if success:
            integration.last_submission_at = self.job.finished_at
        self.session.add(integration)

    def complete(self, warnings: list) -> None:
        self.job.progress = 100
        self.job.warning_count = len(warnings)
        summary = (f"{self.job.records_processed:,} records loaded"
                   + (f" with {len(warnings)} warning(s)" if warnings else ""))
        self.log(f"Completed: {summary}")
        self._finish(C, summary)
        if self.integration:
            self._record_sync(success=True)
            set_integration_status(
                self.session, self.integration,
                IntegrationStatus.warning if warnings else IntegrationStatus.healthy,
                note=f"JOB-{self.job.id}: {summary}", warnings=warnings[:50],
            )

    def fail(self, reason: str) -> None:
        self.log(f"Failed: {reason}", "ERROR")
        self._finish(F, reason)
        label = f"{self.participant.name} · {self.integration.source_name}" if self.integration else self.participant.name
        if self.integration:
            self._record_sync(success=False)
            set_integration_status(self.session, self.integration, IntegrationStatus.failed,
                                   note=f"JOB-{self.job.id} failed: {reason}", notify=not self.quiet,
                                   dedupe=f"job{self.job.id}")
        if not self.quiet:
            # §17.6.4: immediate in-app + email alert to the Technical team.
            notify_technical(self.session, "pipeline_failed", self.integration, f"Pipeline job JOB-{self.job.id} failed",
                             f"{label}: {reason}", dedupe_key=f"pipeline_failed:{self.job.id}", link="/pipelines")

    def pause(self) -> None:
        who = self.job.stopped_by or "an administrator"
        self.log(f"Stopped by {who} during {self.step}; nothing was loaded. Reprocess to run it again", "WARN")
        self._finish(P, f"Stopped by {who} during {self.step}")
        if self.integration:
            set_integration_status(self.session, self.integration, IntegrationStatus.paused,
                                   note=f"JOB-{self.job.id} stopped by {who}", actor=who)


def _extension_for(content_type: str, url: str) -> str:
    content_type = (content_type or "").lower()
    if "xml" in content_type:
        return "xml"
    if "spreadsheetml" in content_type:
        return "xlsx"
    if "csv" in content_type or "text/plain" in content_type:
        return "csv"
    ext = ingestion.file_extension(urllib.parse.urlparse(url).path)
    return ext if ext in ingestion.ALLOWED_TYPES else "csv"


def fetch(method: str, url: str, headers: dict, body: Optional[bytes] = None) -> tuple[int, str, bytes]:
    """One outbound HTTP call to a participant system: (status, content type,
    body). Tests replace this function."""
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read(ingestion.MAX_UPLOAD_BYTES + 1)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", "") if exc.headers else "", b""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise JobFailed(f"Could not reach the configured endpoint ({reason})") from exc
