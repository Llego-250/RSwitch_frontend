"""Builds per-user notifications from live state: new anomaly alerts,
degraded integrations, document expiry reminders (lead times from
settings) and issues nearing their due date. Deduplicated by key, so it's
safe to run on every scheduler tick."""

from datetime import date

from sqlmodel import Session, select

from app.models.admin import Notification
from app.models.alert import AnomalyAlert
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import IntegrationStatus, IssueStatus, UserRole
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.user import User
from app.services.settings_store import get_setting


def generate(session: Session) -> int:
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    notices: list[tuple[str, str, str, str, str, int | None]] = []  # key, title, msg, severity, link, participant

    for a in session.exec(select(AnomalyAlert).where(AnomalyAlert.status != "Closed")).all():
        p = participants.get(a.participant_id)
        notices.append((f"alert:{a.id}:{a.status}", f"Anomaly {a.status.lower()}: {a.severity}",
                        f"{p.name if p else ''} — {a.indicator}", "alert" if a.severity in ("CRITICAL", "HIGH") else "warning", "/ai", a.participant_id))

    for i in session.exec(select(Integration)).all():
        if i.status in (IntegrationStatus.degraded, IntegrationStatus.disconnected):
            p = participants.get(i.participant_id)
            notices.append((f"integration:{i.id}:{i.status.value}:{i.updated_at:%Y%m%d}", f"Integration {i.status.value.lower()}",
                            f"{p.name if p else ''}: {i.note or 'no note'}", "alert" if i.status == IntegrationStatus.disconnected else "warning",
                            "/integrations", i.participant_id))

    lead_days = sorted(get_setting(session, "reminders")["days_before"], reverse=True)
    types = {t.id: t.name for t in session.exec(select(RequiredDocumentType)).all()}
    today = date.today()
    for d in session.exec(select(ComplianceDocument)).all():
        if not d.expiry_date:
            continue
        left = (d.expiry_date - today).days
        p = participants.get(d.participant_id)
        if left < 0:
            notices.append((f"doc:{d.id}:expired", "Compliance document expired",
                            f"{p.name if p else ''}: {types.get(d.doc_type_id)} expired {d.expiry_date}", "alert", "/compliance", d.participant_id))
        else:
            for lead in lead_days:
                if left <= lead:
                    notices.append((f"doc:{d.id}:lead{lead}", f"Document expires in {left} day(s)",
                                    f"{p.name if p else ''}: {types.get(d.doc_type_id)} expires {d.expiry_date}", "warning", "/compliance", d.participant_id))
                    break

    for iss in session.exec(select(Issue).where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))).all():
        if iss.due_date and (iss.due_date - today).days <= 1:
            overdue = iss.due_date < today
            notices.append((f"issue:{iss.id}:{'overdue' if overdue else 'due'}", "Issue overdue" if overdue else "Issue due soon",
                            iss.description, "alert" if overdue else "warning", "/compliance", iss.participant_id))

    users = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
    existing = {(n.user_id, n.dedupe_key) for n in session.exec(select(Notification)).all()}
    created = 0
    for user in users:
        for key, title, msg, sev, link, pid in notices:
            # Participants only hear about their own institution.
            if user.role == UserRole.participant and pid != user.participant_id:
                continue
            if user.role == UserRole.participant and link in ("/ai", "/compliance"):
                link = "/participant-360"
            if (user.id, key) in existing:
                continue
            session.add(Notification(user_id=user.id, dedupe_key=key, title=title, message=msg, severity=sev, link=link))
            created += 1
    session.commit()
    return created
