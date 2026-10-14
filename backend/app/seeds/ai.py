"""AI Decision Support demo data. Synthetic transaction files for three
SACCOs with nine months of history — enough for the R2 rolling baseline
(≥ 6 months) and an R3 peer group — then a detection run per baseline
method and a few alerts walked through the §9.3 lifecycle by the seeded
staff users. Idempotent."""

import random
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.models.alert import AnomalyAlert
from app.models.enums import IntegrationStatus, SubmissionResult
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User
from app.services import anomaly
from app.services.ingestion import aggregate, identity_fields, read_rows, validate_rows
from app.storage import put_file

HISTORY_MONTHS = 9
SACCOS = [
    # code, name, region, monthly rows, average amount, story
    ("HCS", "Huye Community SACCO", "Southern Province", 80, 22000, "peer"),
    ("MFS", "Musanze Farmers SACCO", "Northern Province", 95, 26000, "spike"),
    ("NDS", "Nyagatare Dairy SACCO", "Eastern Province", 60, 31000, "drop"),
]


def _month_floor(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _csv(rng: random.Random, month: datetime, rows: int, avg: float, broken: bool) -> bytes:
    lines = ["transaction_id,transaction_date,amount,channel"]
    for i in range(rows):
        day = month + timedelta(days=rng.randint(0, 26))
        lines.append(f"T{month:%y%m}{i:05d},{day:%Y-%m-%d},{round(rng.uniform(avg * 0.4, avg * 1.6), 2)},"
                     f"{rng.choice(['Mobile', 'POS', 'Agent'])}")
    if broken:  # a real validation failure: non-numeric amounts
        for j in range(3, min(rows, 9)):
            parts = lines[j].split(",")
            lines[j] = ",".join([parts[0], parts[1], "n/a", parts[3]])
    return "\n".join(lines).encode()


def _plan(story: str, offset: int) -> tuple[float, list[bool]]:
    """(volume factor, [broken?] per upload) for the month `offset` months ago."""
    if story == "spike" and offset == 0:
        return 2.3, [True, True, False]  # two failed uploads, then a corrected one
    if story == "drop" and offset == 0:
        return 0.35, [False]
    if story == "peer" and offset in (1, 2):
        return 1.0, [True, False]
    if story == "drop" and offset == 6:
        return 1.0, [True, False]
    return 1.0, [False]


def _seed_saccos(session: Session, uploader: str) -> None:
    rng = random.Random(2026)
    now = datetime.utcnow()
    for code, name, region, rows, avg, story in SACCOS:
        if session.exec(select(Participant).where(Participant.code == code)).first():
            continue
        joined = _month_floor(now) - relativedelta(months=HISTORY_MONTHS) + timedelta(days=1)
        p = Participant(name=name, short_name=code, code=code, type="SACCO", region=region,
                        registration_date=joined.date(), primary_contact_name=f"{name} operations",
                        primary_contact_email=f"ops@{code.lower()}-sacco.rw", expected_frequency_days=30,
                        created_at=joined)
        session.add(p)
        session.commit()
        session.refresh(p)
        template = IngestionTemplate(participant_id=p.id, name="Monthly transaction report", version=1, applies_to=name)
        session.add(template)
        session.commit()
        session.refresh(template)
        columns = [
            TemplateColumn(template_id=template.id, name="transaction_id", type="string", required=True, position=0),
            TemplateColumn(template_id=template.id, name="transaction_date", type="date", required=True, position=1),
            TemplateColumn(template_id=template.id, name="amount", type="number", required=True, position=2),
            TemplateColumn(template_id=template.id, name="channel", type="string", required=False, position=3),
        ]
        session.add_all(columns)
        integration = Integration(participant_id=p.id, template_id=template.id, status=IntegrationStatus.healthy,
                                  created_by=uploader)
        session.add(integration)
        session.commit()
        session.refresh(integration)

        last_passed = last_sync = None
        for offset in range(HISTORY_MONTHS - 1, -1, -1):
            month = _month_floor(now) - relativedelta(months=offset)
            factor, uploads = _plan(story, offset)
            for attempt, broken in enumerate(uploads):
                day = min(3 + attempt * 3 + rng.randint(0, 2), max(0, (now - month).days - 1))
                uploaded = month + timedelta(days=day, hours=9 + attempt)
                count = int(rows * factor * rng.uniform(0.9, 1.1))
                data = _csv(rng, month, count, avg, broken)
                table = read_rows("upload.csv", data)
                errors, warnings = validate_rows(table, columns)
                passed = not errors
                key = f"submissions/{p.id}/demo-{code}-{month:%Y%m}-{attempt}.csv"
                put_file(key, data, "text/csv")
                row_count, totals, breakdowns = aggregate(table.rows, *identity_fields(columns)) if passed else (0, {}, {})
                session.add(Submission(
                    participant_id=p.id, integration_id=integration.id, template_id=template.id,
                    period=month.strftime("%B %Y"),
                    filename=f"{code}_{month:%Y%m}.csv", storage_key=key, uploaded_at=uploaded, uploaded_by=uploader,
                    result=SubmissionResult.passed if passed else SubmissionResult.failed,
                    error_count=len(errors), errors=errors[:20], warning_count=len(warnings), warnings=warnings,
                    records_received=len(table.rows), row_count=row_count, numeric_totals=totals,
                    breakdowns=breakdowns, loaded_at=uploaded if passed else None,
                    status="Approved" if passed and offset else ("Validation Failed" if not passed else "Under Review"),
                    review_status="Approved" if passed and offset else "Pending Review",
                ))
                last_sync = uploaded
                if passed:
                    last_passed = uploaded
        integration.last_submission_at, integration.last_sync_at = last_passed, last_sync
        session.add(integration)
        session.commit()


def _user(session: Session, email: str) -> User:
    return session.exec(select(User).where(User.email == email)).first()


def _backdate(alert: AnomalyAlert, when: datetime) -> None:
    """Demo realism: make the last transition look like it happened `when`."""
    alert.status_changed_at = when
    if alert.notes:
        alert.notes = [*alert.notes[:-1], {**alert.notes[-1], "date": when.isoformat()}]


def _walk_lifecycle(session: Session) -> None:
    alerts = session.exec(select(AnomalyAlert).order_by(AnomalyAlert.id)).all()
    if not alerts or any(a.status != anomaly.GENERATED for a in alerts):
        return  # already demonstrated (or real users have started working)
    officer, lead = _user(session, "compliance@rswitch.rw"), _user(session, "compliance.lead@rswitch.rw")
    analyst = _user(session, "business@rswitch.rw")
    if not (officer and lead and analyst):
        return
    codes = {p.id: p.code for p in session.exec(select(Participant)).all()}
    remaining = list(alerts)

    def take(code: str = "") -> AnomalyAlert | None:
        """The first remaining alert for `code` (any participant if none)."""
        pick = next((a for a in remaining if codes.get(a.participant_id) == code), None) or (
            remaining[0] if remaining else None)
        if pick is not None:
            remaining.remove(pick)
        return pick

    # Closed with a resolution summary — read-only from here on.
    a = take("NDS")
    if a:
        anomaly.transition(session, a, anomaly.ACKNOWLEDGED, "Seen — checking the period's extract with the institution.", officer)
        anomaly.transition(session, a, anomaly.INVESTIGATING, "Requested the institution's ledger totals for the period.",
                           officer, assignee_id=officer.id)
        anomaly.transition(session, a, anomaly.RESOLVED, "Ledger totals match the submitted file; the change is genuine.", officer)
        anomaly.transition(session, a, anomaly.CLOSED, "Closing after review.", lead,
                           resolution_summary="The institution confirmed the movement with its ledger totals; the "
                                              "submitted extract was complete and correct. No follow-up needed.")
    # Under investigation, assigned to a Business analyst.
    a = take("MFS")
    if a:
        anomaly.transition(session, a, anomaly.ACKNOWLEDGED, "Acknowledged — reviewing the failed files.", officer)
        anomaly.transition(session, a, anomaly.INVESTIGATING, "Assigning to Business to follow up with the institution's "
                           "IT vendor.", officer, assignee_id=analyst.id)
    # Acknowledged four days ago and never progressed → auto-escalates (006b).
    a = take()
    if a:
        anomaly.transition(session, a, anomaly.ACKNOWLEDGED, "Aware — will raise with the institution's data team.", analyst)
        _backdate(a, datetime.utcnow() - timedelta(days=4))
        session.add(a)
        session.commit()
    anomaly.auto_escalate(session)


def seed(session: Session) -> None:
    uploader = (_user(session, "compliance@rswitch.rw") or _user(session, "admin@rswitch.rw"))
    _seed_saccos(session, uploader.full_name if uploader else "Compliance Officer")
    # One run per baseline method so the demo shows alerts from R1, R2 and
    # R3; the configured method runs again after all module seeds.
    anomaly.detect(session, method="rolling")
    anomaly.detect(session, method="peer")
    anomaly.detect(session, method="threshold")
    _walk_lifecycle(session)
