"""The only automated status logic in this system: a schedule check, not a
model. Flags Integration.status as Degraded/Disconnected purely from how
overdue the last submission is against the participant's expected cadence —
never touches Participant.is_active."""

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from app.db import engine
from app.models.enums import IntegrationSource, IntegrationStatus
from app.models.integration import Integration
from app.models.participant import Participant

GRACE_DAYS = 3
DISCONNECTED_MULTIPLIER = 2


def check_overdue_integrations() -> None:
    with Session(engine) as session:
        rows = session.exec(select(Integration, Participant).where(Integration.participant_id == Participant.id)).all()
        now = datetime.utcnow()
        for integration, participant in rows:
            if integration.status == IntegrationStatus.maintenance:
                continue
            reference = integration.last_submission_at
            if reference is None:
                age_days = participant.expected_frequency_days + GRACE_DAYS + 1
            else:
                age_days = (now - reference).days

            threshold = participant.expected_frequency_days + GRACE_DAYS
            if age_days > threshold * DISCONNECTED_MULTIPLIER:
                new_status = IntegrationStatus.disconnected
            elif age_days > threshold:
                new_status = IntegrationStatus.degraded
            else:
                continue  # on schedule — leave any manually-set status alone

            if integration.status != new_status:
                integration.status = new_status
                integration.source = IntegrationSource.schedule_check
                integration.updated_at = now
                integration.updated_by = "System"
                session.add(integration)
        session.commit()


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_overdue_integrations, "interval", hours=6, id="overdue-check")
    scheduler.start()
    return scheduler
