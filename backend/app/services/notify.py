"""Single entry point for every notification RDIP raises (SRS §5.12, §13).

Each event in EVENTS is one row of the SRS §13 table: who it's for is decided
by the caller (the recipients list), how it's delivered is decided here. A
Technical/Admin user can switch events off in Settings (REQ-NOTIF-003);
transactional emails (invitation, password reset) can't be switched off."""

from dataclasses import dataclass
from typing import Iterable, Optional, Union
from uuid import uuid4

from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models.admin import Notification
from app.models.enums import UserRole
from app.models.user import User
from app.services import email


@dataclass(frozen=True)
class Event:
    label: str
    recipient: str
    in_app: bool
    email: bool
    always_on: bool = False


EVENTS: dict[str, Event] = {
    # SRS §13
    "integration_failed": Event("Integration fails", "Technical/Admin team", True, True),
    "submission_overdue": Event("Participant submission overdue", "Compliance user", True, True),
    "submission_rejected": Event("Compliance submission rejected", "Compliance user", True, False),
    "submission_approved": Event("Compliance submission approved", "Compliance user", True, False),
    "incident_created": Event("Incident created", "Assigned owner", True, True),
    "incident_remediation_overdue": Event("Incident remediation overdue", "Senior Compliance user", True, True),
    "action_item_due_7d": Event("Governance action item due in 7 days", "Action item owner", True, True),
    "action_item_due_1d": Event("Governance action item due in 1 day", "Action item owner", True, True),
    "action_item_overdue": Event("Governance action item overdue", "Committee chair + action item owner", True, True),
    "user_invited": Event("New user invited", "Invited user", False, True, always_on=True),
    "user_role_changed": Event("User role changed", "Affected user", True, True),
    "ai_alert_generated": Event("AI alert generated", "Business + Compliance users", True, False),
    "scheduled_report_generated": Event("Scheduled report generated", "Requesting user", False, True),
    "password_reset_requested": Event("Password reset requested", "Requesting user", False, True, always_on=True),
    # Required elsewhere in the SRS
    "compliance_deadline_reminder": Event("Compliance deadline reminder (§6.5)", "Compliance user", True, True),
    "participant_deadline_reminder": Event("Reminder to responsible participant (REQ-COMP-005)", "Participant contact", False, True),
    "submission_validation_failed": Event("Submission failed validation (§6.1 step 4a)", "Compliance user", True, False),
    "pipeline_failed": Event("Pipeline job failed (§17.6.4)", "Technical/Admin team", True, True),
    "ai_alert_escalated": Event("AI alert auto-escalated (REQ-AI-006b)", "Senior Compliance + Business user", True, True),
    "meeting_scheduled": Event("Governance meeting scheduled (§6.3)", "Meeting invitees", True, True),
    "document_expiry_reminder": Event("Compliance document expiring", "Compliance user", True, False),
}

Recipient = Union[User, str]


def is_enabled(session: Session, event: str) -> bool:
    from app.services.settings_store import get_setting

    spec = EVENTS[event]
    if spec.always_on:
        return True
    return bool(get_setting(session, "notifications")["events"].get(event, True))


def dispatch(
    session: Session,
    event: str,
    recipients: Iterable[Recipient],
    title: str,
    message: str,
    *,
    link: str = "",
    severity: str = "info",
    dedupe_key: str = "",
    email_subject: str = "",
    email_body: str = "",
    attachments: Optional[list[tuple[str, bytes, str]]] = None,
) -> int:
    """Deliver one event to each recipient over the channels the SRS defines
    for it. A User gets in-app and/or email; a bare address (e.g. a
    participant's contact) gets email only. With a dedupe_key the same event
    is never delivered twice to the same person. Returns deliveries made.

    Writes through its own sessions, so call it after the caller's own
    changes are committed (SQLite allows one writer at a time)."""
    spec = EVENTS[event]
    if not is_enabled(session, event):
        return 0
    key = dedupe_key or f"{event}:{uuid4().hex}"
    subject = email_subject or f"[RDIP] {title}"
    body = email_body or _default_body(message, link)
    in_app: list[User] = []
    addresses: list[str] = []
    for recipient in recipients:
        user = recipient if isinstance(recipient, User) else None
        address = user.email if user else str(recipient).strip()
        if not address or address in addresses or (user and not user.is_active):
            continue
        addresses.append(address)
        if user is not None:
            in_app.append(user)

    delivered = 0
    if spec.in_app and in_app:
        # In-app rows are committed before any email is written: email.send
        # opens its own session, and an uncommitted write here would block it.
        with Session(engine) as own:
            already = set(
                own.exec(
                    select(Notification.user_id).where(
                        Notification.dedupe_key == key, Notification.user_id.in_([u.id for u in in_app])
                    )
                ).all()
            )
            for user in in_app:
                if user.id not in already:
                    own.add(Notification(user_id=user.id, dedupe_key=key, event=event, title=title,
                                         message=message, severity=severity, link=link))
                    delivered += 1
            own.commit()
    if spec.email:
        for address in addresses:
            if email.send(address, subject, body, event=event, dedupe_key=key, attachments=attachments):
                delivered += 1
    return delivered


def _default_body(message: str, link: str) -> str:
    url = f"{settings.app_base_url.rstrip('/')}{link}" if link.startswith("/") else link
    return f"{message}\n\n{('Open in RDIP: ' + url) if url else ''}\n\n— RSwitch Data Intelligence Platform"


# ---- recipient helpers -------------------------------------------------------

def users_with_roles(session: Session, *roles: UserRole, senior_only: bool = False) -> list[User]:
    query = select(User).where(User.is_active == True, User.role.in_(roles))  # noqa: E712
    if senior_only:
        query = query.where(User.is_senior == True)  # noqa: E712
    return list(session.exec(query).all())


def senior_users(session: Session, *roles: UserRole) -> list[User]:
    """Senior users of the given roles; when none is flagged senior, every
    user of those roles, so an escalation is never silently dropped."""
    return users_with_roles(session, *roles, senior_only=True) or users_with_roles(session, *roles)


def user_by_name_or_email(session: Session, value: str) -> Optional[User]:
    value = (value or "").strip()
    if not value:
        return None
    return session.exec(select(User).where((User.email == value) | (User.full_name == value))).first()
