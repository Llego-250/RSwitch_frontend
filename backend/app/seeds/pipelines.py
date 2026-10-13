"""Demo data for Integrations, the Pipeline Monitor and Standards & Mapping.

Everything goes through the real code: mappings are created, edited and
published with services.mapping; pipeline jobs are queued and executed by
the actual pipeline runner over the core seed's stored files; and
MobiPesa's Automated API source pulls from the DEMO feed
(GET /integrations/demo-feed/MOB). No API server runs while seeding, so the
demo feed is called in-process here; at runtime the worker calls it over
HTTP like any participant endpoint. Job timestamps are then moved back to
when each transfer happened."""

import json
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core import crypto
from app.models.enums import IntegrationSource, IntegrationStatus, SubmissionResult
from app.models.integration import AuthType, Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import PipelineConfig, PipelineJob, PipelineLog
from app.models.submission import Submission
from app.models.template import FieldMapping, IngestionTemplate, MappingVersion, TemplateColumn
from app.services import mapping as svc
from app.services import pipeline_jobs, pipeline_runner

ADMIN = "RDIP Admin"
HISTORY_DAYS = 75  # inside the 90-day log retention, so nothing is purged at once
API_URL = os.environ.get("RDIP_INTERNAL_API_URL", "http://localhost:8000")


def _participant(session: Session, code: str) -> Optional[Participant]:
    return session.exec(select(Participant).where(Participant.code == code)).first()


def _manual_source(session: Session, participant: Participant) -> Optional[Integration]:
    return session.exec(
        select(Integration).where(Integration.participant_id == participant.id,
                                  Integration.integration_mode == IntegrationMode.manual.value).order_by(Integration.id)
    ).first()


def _publish_as(session: Session, m: FieldMapping, rules: list[dict], *, when: datetime, notes: str, confirm: bool = False) -> None:
    svc.save_draft_rules(session, m, rules, ADMIN)
    version = svc.publish(session, m, user=ADMIN, notes=notes, confirm_unmapped=confirm)
    version.published_at = when
    version.created_at = when - timedelta(hours=2)
    session.add(version)
    session.commit()


def _mapping(session: Session, *, name: str, source_system: str, standard: str, template: IngestionTemplate,
             created: datetime) -> FieldMapping:
    m = svc.create_mapping(session, name=name, source_system=source_system, target_standard=standard, user=ADMIN,
                           source_template_id=template.id)
    m.created_at = created
    session.add(m)
    session.commit()
    session.refresh(m)
    return m


def _rules(pairs: list[tuple[str, str, str]]) -> list[dict]:
    return [{"source_field": s, "target_field": t, "transform": x} for s, t, x in pairs]


def _backdate(session: Session, job_id: int, start: datetime) -> None:
    """Move a job (and its log lines) so it started at `start`."""
    session.expire_all()  # the job ran in the worker's own session
    job = session.get(PipelineJob, job_id)
    shift = start - (job.started_at or job.queued_at)
    for attr in ("queued_at", "started_at", "finished_at", "heartbeat_at"):
        if getattr(job, attr):
            setattr(job, attr, getattr(job, attr) + shift)
    job.queued_at = min(job.queued_at, start - timedelta(seconds=20))
    session.add(job)
    for line in session.exec(select(PipelineLog).where(PipelineLog.job_id == job_id)).all():
        line.at = line.at + shift
        session.add(line)
    if job.submission_id:
        sub = session.get(Submission, job.submission_id)
        if sub.uploaded_by == "Automated API sync":
            sub.uploaded_at = start + timedelta(seconds=5)
        if sub.loaded_at:
            sub.loaded_at = job.finished_at
        session.add(sub)
    session.commit()


def _run(session: Session, integration: Integration, *, submission=None, trigger: str, by: str, start: datetime,
         reprocess_of: Optional[PipelineJob] = None) -> PipelineJob:
    job = pipeline_runner.enqueue(session, integration=integration, submission=submission, trigger=trigger,
                                  triggered_by=by, reprocess_of=reprocess_of)
    pipeline_runner.run_job(job.id, quiet=True)
    _backdate(session, job.id, start)
    _settle(session, session.get(Integration, integration.id))
    session.refresh(job)
    return job


def _demo_fetch(session: Session):
    """In-process stand-in for the HTTP call to the demo feed (seeding only)."""
    from app.routers.integrations import demo_feed

    def fetch(method, url, headers, body=None):
        parsed = urlparse(url)
        code = parsed.path.rstrip("/").split("/")[-1]
        since = parse_qs(parsed.query).get("since", [None])[0]
        try:
            response = demo_feed(code, datetime.fromisoformat(since) if since else None, headers.get("X-API-Key"), session)
        except HTTPException as exc:
            return exc.status_code, "application/json", b""
        return 200, "text/csv", bytes(response.body)

    return fetch


def _settle(session: Session, integration: Integration) -> None:
    """After back-dating, the data source's last-transfer fields and status
    follow its real latest transfer (job, or upload rejected at validation)."""
    events = []
    for job in session.exec(select(PipelineJob).where(PipelineJob.integration_id == integration.id,
                                                      PipelineJob.finished_at != None)).all():  # noqa: E711
        events.append((job.finished_at, job.records_processed, job.error_count, job.status == "Completed",
                       job.warning_count, f"JOB-{job.id}: {job.summary}", job.status))
    for sub in session.exec(select(Submission).where(Submission.integration_id == integration.id,
                                                     Submission.result == SubmissionResult.failed)).all():
        events.append((sub.uploaded_at, sub.records_received, sub.error_count, False, 0,
                       f"SUB-{sub.id} ({sub.period}) failed validation with {sub.error_count} error(s)", "Failed"))
    if not events:
        return
    events.sort(key=lambda e: e[0])
    at, records, errors, ok, warnings, note, status = events[-1]
    successes = [e[0] for e in events if e[3]]
    integration.last_sync_at, integration.last_sync_records, integration.last_sync_errors = at, records, errors
    integration.last_submission_at = successes[-1] if successes else None
    if status == "Paused":
        integration.status = IntegrationStatus.paused
    elif ok:
        integration.status = IntegrationStatus.warning if warnings else IntegrationStatus.healthy
    else:
        integration.status = IntegrationStatus.failed
    if integration.status == IntegrationStatus.healthy:
        integration.warnings = []
    integration.note, integration.source = note, IntegrationSource.pipeline
    integration.updated_at, integration.updated_by = at, "System"
    session.add(integration)
    session.commit()


def seed(session: Session) -> None:
    if session.exec(select(FieldMapping)).first():
        return
    kvu, aks, mob, nym, rus = (_participant(session, c) for c in ("KVU", "AKS", "MOB", "NYM", "RUS"))
    if not all((kvu, aks, mob, nym, rus)):
        return
    now = datetime.utcnow()
    templates = {p.code: session.get(IngestionTemplate, _manual_source(session, p).template_id) for p in (kvu, aks, mob, nym, rus)}

    # ---- Standards & Mapping (MAP-001..) -----------------------------------
    # KVU → ISO 20022, with history: v1.0 left channel unmapped, v2.0 maps it.
    kvu_map = _mapping(session, name="Kivu core banking return → ISO 20022", source_system="Kivu Commercial Bank core banking",
                       standard="ISO 20022", template=templates["KVU"], created=now - timedelta(days=130))
    iso = [("transaction_id", "CdtTrfTxInf.PmtId.TxId", "trim"), ("transaction_date", "CdtTrfTxInf.IntrBkSttlmDt", "date"),
           ("amount", "CdtTrfTxInf.IntrBkSttlmAmt", "number")]
    _publish_as(session, kvu_map, _rules(iso + [("channel", "", "")]), when=now - timedelta(days=128),
                notes="Initial release; channel not yet agreed with the bank", confirm=True)
    _publish_as(session, kvu_map, _rules(iso + [("channel", "CdtTrfTxInf.PmtTpInf.LclInstrm.Prtry", "trim")]),
                when=now - timedelta(days=40), notes="Channel mapped to the local instrument code")

    # AKS → JSON Canonical, published with channel unmapped (Warning).
    aks_map = _mapping(session, name="Akagera MFI return → JSON Canonical", source_system="Akagera Savings & Credit MIS",
                       standard="JSON Canonical", template=templates["AKS"], created=now - timedelta(days=100))
    _publish_as(session, aks_map, _rules([("transaction_id", "transaction_id", "trim"), ("transaction_date", "transaction_date", "date"),
                                          ("amount", "amount", "number"), ("channel", "", "")]),
                when=now - timedelta(days=95), notes="Channel codes still being agreed with the MFI", confirm=True)

    # MOB automated feed → JSON Canonical (summary rows weighted by txn_count).
    feed_template = IngestionTemplate(participant_id=mob.id, name="Mobile money hourly summary", applies_to="MobiPesa API feed",
                                      created_at=now - timedelta(days=60))
    session.add(feed_template)
    session.commit()
    session.refresh(feed_template)
    session.add_all([
        TemplateColumn(template_id=feed_template.id, name="period_start", type="date", required=True, position=0),
        TemplateColumn(template_id=feed_template.id, name="channel_code", type="enum", rule="Mobile|Web|POS|ATM", required=True, position=1),
        TemplateColumn(template_id=feed_template.id, name="txn_count", type="number", required=True, position=2),
        TemplateColumn(template_id=feed_template.id, name="txn_value_rwf", type="number", required=True, position=3),
    ])
    session.commit()
    mob_map = _mapping(session, name="MobiPesa hourly summary → JSON Canonical", source_system="MobiPesa mobile money platform API",
                       standard="JSON Canonical", template=feed_template, created=now - timedelta(days=58))
    feed_rules = [("period_start", "transaction_date", "date"), ("txn_count", "transaction_count", "number"),
                  ("txn_value_rwf", "amount", "number")]
    _publish_as(session, mob_map, _rules(feed_rules + [("channel_code", "", "")]), when=now - timedelta(days=55),
                notes="Pilot: volumes only", confirm=True)
    _publish_as(session, mob_map, _rules(feed_rules + [("channel_code", "channel", "trim")]), when=now - timedelta(days=20),
                notes="Channel breakdown added for inclusion analytics")

    # RUS: a mapping still in draft (never published) — the "Pending
    # Mappings" count, not yet assigned to a data source.
    rus_map = _mapping(session, name="SACCO standard return → JSON Canonical", source_system="Rubavu Union SACCO ledger",
                       standard="JSON Canonical", template=templates["RUS"], created=now - timedelta(days=6))
    svc.save_draft_rules(session, rus_map, _rules([("transaction_id", "transaction_id", ""), ("transaction_date", "transaction_date", "date"),
                                                   ("amount", "", ""), ("channel", "", "")]), ADMIN)
    session.commit()
    # A clone, as the starting point for another bank (REQ-MAP-006).
    svc.clone(session, kvu_map, name="Commercial bank return → ISO 20022 (template)", user=ADMIN)
    session.commit()

    for participant, m in ((kvu, kvu_map), (aks, aks_map)):
        source = _manual_source(session, participant)
        source.mapping_id = m.id
        session.add(source)
    session.commit()

    # ---- MobiPesa Automated API source (REQ-INTG-002b) -----------------------
    mob_api = Integration(
        participant_id=mob.id,
        source_name="Mobile Money platform",
        integration_mode=IntegrationMode.automated.value,
        endpoint_url_encrypted=crypto.encrypt(f"{API_URL}/integrations/demo-feed/MOB"),
        auth_type=AuthType.api_key.value,
        # The key in force before MobiPesa rotated it — the first failed pull below.
        credentials_encrypted=crypto.encrypt(json.dumps({"api_key": "mobipesa-key-before-rotation"})),
        schedule_cron="0 * * * *",
        template_id=feed_template.id,
        mapping_id=mob_map.id,
        status=IntegrationStatus.pending,
        note="Configured — awaiting the first transfer",
        created_at=now - timedelta(days=60),
        created_by=ADMIN,
        updated_by=ADMIN,
    )
    session.add(mob_api)
    session.commit()
    session.refresh(mob_api)
    config = PipelineConfig(name="MOB Mobile Money platform — scheduled pull", integration_id=mob_api.id,
                            schedule_cron=mob_api.schedule_cron, mapping_id=mob_map.id, is_default=True,
                            created_by=ADMIN, created_at=now - timedelta(days=60))
    pipeline_jobs.schedule_next(session, config)
    session.add(config)
    session.commit()

    # ---- pipeline history over the core seed's uploads ----------------------
    cutoff = now - timedelta(days=HISTORY_DAYS)
    latest = {}
    for source in session.exec(select(Integration).where(Integration.integration_mode == IntegrationMode.manual.value)).all():
        uploads = session.exec(
            select(Submission).where(Submission.integration_id == source.id, Submission.result == SubmissionResult.passed)
            .order_by(Submission.uploaded_at)
        ).all()
        if uploads:
            latest[source.participant_id] = uploads[-1]
        for sub in uploads:
            if sub.uploaded_at < cutoff or sub is uploads[-1] and source.participant_id in (mob.id, rus.id):
                continue
            _run(session, source, submission=sub, trigger="Upload", by=sub.uploaded_by or ADMIN,
                 start=sub.uploaded_at + timedelta(minutes=1))

    # ---- MobiPesa pulls: failed (old key) → reprocessed after rotation ----------
    original_fetch = pipeline_runner.fetch
    pipeline_runner.fetch = _demo_fetch(session)
    try:
        failed = _run(session, mob_api, trigger="Schedule", by=f"Scheduler ({config.name})", start=now - timedelta(hours=5, minutes=58))
        mob_api = session.get(Integration, mob_api.id)
        from app.routers.integrations import demo_feed_key

        mob_api.credentials_encrypted = crypto.encrypt(json.dumps({"api_key": demo_feed_key("MOB")}))
        session.add(mob_api)
        session.commit()
        _run(session, mob_api, trigger="Reprocess", by=ADMIN, start=now - timedelta(hours=5, minutes=20), reprocess_of=failed)
        # A pull an administrator stopped before it started (Paused, REQ-PIPE-006).
        stopped = pipeline_runner.enqueue(session, integration=mob_api, trigger="Manual sync", triggered_by=ADMIN)
        pipeline_runner.request_stop(session, stopped, ADMIN)
        _backdate(session, stopped.id, now - timedelta(hours=2, minutes=40))
        _run(session, mob_api, trigger="Schedule", by=f"Scheduler ({config.name})", start=now - timedelta(minutes=58))
    finally:
        pipeline_runner.fetch = original_fetch
    config.last_enqueued_at = now - timedelta(minutes=58)
    session.add(config)
    session.commit()

    # ---- left for the worker: one Queued, one Running when the API starts ----
    # RUS's latest return waits in the queue; MOB's was mid-run when the
    # previous worker stopped (stale heartbeat) and is recovered, then loaded.
    for participant, state in ((rus, "Queued"), (mob, "Running")):
        sub = latest.get(participant.id)
        if not sub:
            continue
        sub.row_count, sub.numeric_totals, sub.breakdowns, sub.loaded_at = 0, {}, {}, None
        session.add(sub)
        session.commit()
        source = _manual_source(session, participant)
        job = pipeline_runner.enqueue(session, integration=source, submission=sub, trigger="Upload", triggered_by=sub.uploaded_by or ADMIN)
        if state == "Running":
            session.exec(PipelineJob.__table__.update().where(PipelineJob.id == job.id).values(status="Running"))
            session.commit()
            job = session.get(PipelineJob, job.id)
            run = pipeline_runner._Run(session, job, quiet=True)
            run.log(f"Started by the pipeline worker ({job.trigger})")
            run.enter("Extract")
            run.extract()
            stale = datetime.utcnow() - timedelta(minutes=10)
            job.started_at = job.started_at or stale
            job.heartbeat_at = stale
            session.add(job)
            session.commit()

    for source in session.exec(select(Integration)).all():
        if not session.exec(select(PipelineJob.id).where(PipelineJob.integration_id == source.id,
                                                         PipelineJob.status.in_(("Queued", "Running")))).first():
            _settle(session, source)

    # Late and failing sources, as the hourly overdue check would find them.
    from app.services.scheduler import check_overdue

    check_overdue(session)
