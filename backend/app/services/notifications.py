"""Scheduled notification checks over live state, run every scheduler tick.
Each notice goes only to the people SRS §13 names, through notify.dispatch
(which applies the channel rules and the admin on/off switches). Stable
dedupe keys make every tick idempotent.

AI alerts are not raised here: the AI module dispatches ai_alert_generated
when it creates an alert."""

from datetime import date

from sqlmodel import Session, select

from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import IssueStatus, UserRole
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.services import notify
from app.services.settings_store import get_setting

# Integration statuses that mean "the integration fails" (§13). Both the
# original names and the §9 names are recognised.
_FAILED = {"Disconnected", "Failed"}
_DEGRADED = {"Degraded", "Warning"}


def _status_value(status) -> str:
    return getattr(status, "value", status) or ""


def _dispatch_each(session: Session, event: str, recipients: list, title: str, message: str, **kwargs) -> int:
    """One dispatch per recipient. Same result as a single multi-recipient
    call, but each delivery commits on its own, so SQLite (dev/tests) never
    sees two writers at once."""
    return sum(notify.dispatch(session, event, [r], title, message, **kwargs) for r in recipients)


def _integrations(session: Session, participants: dict) -> int:
    technical = notify.users_with_roles(session, UserRole.technical)
    sent = 0
    for i in session.exec(select(Integration)).all():
        status = _status_value(i.status)
        if status not in _FAILED | _DEGRADED:
            continue
        p = participants.get(i.participant_id)
        name = p.name if p else f"Participant #{i.participant_id}"
        updated = getattr(i, "updated_at", None)
        sent += _dispatch_each(
            session, "integration_failed", technical,
            f"Integration {status.lower()}: {name}",
            f"{name}'s integration is {status}. {getattr(i, 'note', '') or 'No note recorded.'}",
            link="/integrations",
            severity="alert" if status in _FAILED else "warning",
            dedupe_key=f"integration_failed:{i.id}:{status}:{updated:%Y%m%d}" if updated else f"integration_failed:{i.id}:{status}",
        )
    return sent


def _document_expiry(session: Session, participants: dict) -> int:
    """Compliance documents nearing expiry, at each configured lead time
    (REQ-SET-004), and once more when expired."""
    compliance = notify.users_with_roles(session, UserRole.compliance)
    leads = sorted(int(d) for d in get_setting(session, "reminders")["days_before"])
    types = {t.id: t.name for t in session.exec(select(RequiredDocumentType)).all()}
    today = date.today()
    sent = 0
    for d in session.exec(select(ComplianceDocument).where(ComplianceDocument.expiry_date != None)).all():  # noqa: E711
        left = (d.expiry_date - today).days
        p = participants.get(d.participant_id)
        what = f"{p.name if p else 'A participant'}: {types.get(d.doc_type_id, 'document')}"
        if left < 0:
            sent += _dispatch_each(session, "document_expiry_reminder", compliance, "Compliance document expired",
                                    f"{what} expired on {d.expiry_date}.", link="/compliance", severity="alert",
                                    dedupe_key=f"document_expiry:{d.id}:{d.expiry_date}:expired")
            continue
        # The tightest lead time already reached, so 14 → 7 → 1 each fire once.
        lead = next((n for n in leads if left <= n), None)
        if lead is not None:
            sent += _dispatch_each(session, "document_expiry_reminder", compliance,
                                    f"Document expires in {left} day{'s' if left != 1 else ''}",
                                    f"{what} expires on {d.expiry_date}.", link="/compliance", severity="warning",
                                    dedupe_key=f"document_expiry:{d.id}:{d.expiry_date}:lead{lead}")
    return sent


def _issues(session: Session) -> int:
    """Interim: issue due / overdue to its assignee, else to Compliance users.
    The compliance module replaces this with incident remediation rules."""
    today = date.today()
    sent = 0
    open_states = [IssueStatus.open, IssueStatus.in_progress]
    for iss in session.exec(select(Issue).where(Issue.status.in_(open_states), Issue.due_date != None)).all():  # noqa: E711
        days = (iss.due_date - today).days
        if days > 1:
            continue
        assignee = notify.user_by_name_or_email(session, iss.assignee)
        recipients = [assignee] if assignee and assignee.is_active else notify.users_with_roles(session, UserRole.compliance)
        overdue = days < 0
        sent += _dispatch_each(
            session, "incident_remediation_overdue" if overdue else "compliance_deadline_reminder", recipients,
            "Issue overdue" if overdue else "Issue due soon",
            f"{iss.description} (due {iss.due_date}).",
            link="/compliance", severity="alert" if overdue else "warning",
            dedupe_key=f"issue:{iss.id}:{iss.due_date}:{'overdue' if overdue else 'due'}",
        )
    return sent


def generate(session: Session) -> int:
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    return _integrations(session, participants) + _document_expiry(session, participants) + _issues(session)
