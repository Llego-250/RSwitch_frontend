"""Demo data for the Participant risk assessment (REQ-P360-009..012, §11.5).

Runs last (seeds run alphabetically), after every module's demo records
exist. Two steps, both from real seeded rows:

1. Data source status history. The other seeds back-date their transfers
   after running them, so the status changes recorded while seeding carry
   seeding-time timestamps. Each source's history is rebuilt from its
   back-dated outcomes instead — a failed upload or job turns it Failed, a
   completed one Healthy (Warning with warnings), a stopped job Paused —
   the same rule seeds/pipelines.py uses to settle its current status.
2. Scores: a few past nightly runs, each computed as of its own night (only
   records that existed then), then tonight's run, so the profile's trend
   and the stored history (§18) aren't empty."""

from datetime import datetime, time, timedelta, timezone

from sqlmodel import Session, delete, select

from app.models.enums import IntegrationStatus, SubmissionResult
from app.models.integration import Integration
from app.models.pipeline import PipelineJob, PipelineJobStatus
from app.models.risk import IntegrationStatusChange, ParticipantRiskScore
from app.models.submission import Submission
from app.services import risk
from app.services.governance_jobs import org_zone

PAST_NIGHTS = (56, 42, 28, 21, 14, 7, 3, 2, 1)  # nights before the latest one


def _rebuild_history(session: Session, integration: Integration) -> None:
    events: list[tuple[datetime, str]] = []
    jobs = session.exec(select(PipelineJob).where(PipelineJob.integration_id == integration.id,
                                                  PipelineJob.finished_at != None)).all()  # noqa: E711
    with_job = {j.submission_id for j in jobs if j.submission_id}
    for j in jobs:
        if j.status == PipelineJobStatus.completed.value:
            events.append((j.finished_at, (IntegrationStatus.warning if j.warning_count else IntegrationStatus.healthy).value))
        elif j.status == PipelineJobStatus.failed.value:
            events.append((j.finished_at, IntegrationStatus.failed.value))
        elif j.status == PipelineJobStatus.paused.value:
            events.append((j.finished_at, IntegrationStatus.paused.value))
    for s in session.exec(select(Submission).where(Submission.integration_id == integration.id)).all():
        if s.result == SubmissionResult.failed:
            events.append((s.uploaded_at, IntegrationStatus.failed.value))
        elif s.id not in with_job:  # loaded directly by the core seed
            events.append((s.loaded_at or s.uploaded_at, (IntegrationStatus.warning if s.warning_count else IntegrationStatus.healthy).value))
    events.sort()
    current = IntegrationStatus(integration.status).value
    known_since = integration.updated_at or integration.created_at
    if not events or events[-1][1] != current:
        events.append((max(known_since, events[-1][0]) if events else known_since, current))

    session.exec(delete(IntegrationStatusChange).where(IntegrationStatusChange.integration_id == integration.id))
    previous = None
    for at, status in events:
        if status == previous:
            continue
        session.add(IntegrationStatusChange(integration_id=integration.id, participant_id=integration.participant_id,
                                            status=status, at=at, source="Reconstructed",
                                            note="Rebuilt from the back-dated demo transfer history"))
        previous = status
    session.commit()


def seed(session: Session) -> None:
    if session.exec(select(ParticipantRiskScore.id)).first() is not None:
        return
    for integration in session.exec(select(Integration)).all():
        _rebuild_history(session, integration)

    zone = org_zone(session)
    now = datetime.utcnow()
    local = now.replace(tzinfo=timezone.utc).astimezone(zone)
    night = local.date() if local.hour >= risk.NIGHTLY_HOUR else local.date() - timedelta(days=1)

    def at_night(days_before: int) -> datetime:
        start = datetime.combine(night - timedelta(days=days_before), time(risk.NIGHTLY_HOUR, 5), tzinfo=zone)
        return start.astimezone(timezone.utc).replace(tzinfo=None)

    for days in PAST_NIGHTS:
        risk.recompute(session, trigger="Nightly", now=at_night(days))
    risk.recompute(session, trigger="Nightly", now=min(at_night(0), now))
