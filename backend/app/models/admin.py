"""Platform administration: audit trail, API keys, system settings,
notifications, report history/schedules, participant notes, and the
authentication state behind sign-in (sessions, trusted devices, emailed
single-use tokens)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    actor_email: str = ""
    actor_name: str = ""
    actor_role: str = ""
    action: str
    resource: str = ""
    ip_address: str = ""
    user_agent: str = ""
    status: str = "SUCCESS"  # SUCCESS | WARNING | FAILED


class ApiKey(SQLModel, table=True):
    """Only a SHA-256 hash is stored; the plaintext key is shown once."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    prefix: str
    key_hash: str = Field(index=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None
    is_active: bool = True


class SystemSetting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: dict = Field(default_factory=dict, sa_column=Column(JSON))


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # Stable key so the generator never raises the same notice twice.
    dedupe_key: str = Field(index=True)
    # SRS §13 trigger this notice came from (notify.EVENTS key).
    event: str = ""
    title: str
    message: str
    severity: str = "info"  # alert | warning | info
    link: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    read: bool = False
    # Cleared notices are kept (hidden) so their dedupe key blocks re-creation.
    dismissed: bool = False


class ReportRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report: str
    format: str
    participant_id: Optional[int] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    storage_key: str
    filename: str
    size_bytes: int = 0
    generated_by: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    schedule_id: Optional[int] = None


class ReportSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    report: str
    format: str = "pdf"
    frequency: str = "Monthly"  # Daily | Weekly | Monthly
    recipient: str = ""
    active: bool = True
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_run_at: Optional[datetime] = None


class ParticipantNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    author: str
    note: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmailOutbox(SQLModel, table=True):
    """Every outbound email RDIP sends (SRS §16: outbound only). Doubles as the
    delivery log; without an SMTP server messages stop here as "Logged"."""

    id: Optional[int] = Field(default=None, primary_key=True)
    to_address: str = Field(index=True)
    subject: str
    body: str
    event: str = ""
    dedupe_key: str = Field(default="", index=True)
    attachments: list = Field(default_factory=list, sa_column=Column(JSON))
    status: str = "Logged"  # Sent | Logged | Failed
    error: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class UserSession(SQLModel, table=True):
    """Server side of a session token (REQ-AUTH-005, §19.1 logout). The JWT
    carries only the jti; whether the session is still alive — not revoked,
    not idle past the timeout — is decided here on every request."""

    id: Optional[int] = Field(default=None, primary_key=True)
    jti: str = Field(unique=True, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # "access" = full session; "mfa_setup" = password accepted but MFA is
    # enforced and not yet enrolled, so only the enrolment endpoints work.
    scope: str = "access"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Last real user interaction reported by the client (background polling
    # doesn't move it), the basis of the inactivity timeout.
    last_activity_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    revoked_reason: str = ""  # logout | idle | password_reset | deactivated | ...
    ip_address: str = ""
    user_agent: str = ""


class TrustedDevice(SQLModel, table=True):
    """REQ-AUTH-006 "Trust this device for 30 days". The browser keeps the
    plaintext token; only its SHA-256 hash is stored."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(index=True)
    user_agent: str = ""
    ip_address: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class UserToken(SQLModel, table=True):
    """Single-use emailed links: invitations (REQ-USR-002, 48 h) and password
    resets (REQ-AUTH-004, 60 min). Only a hash of the token is stored."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    purpose: str = Field(index=True)  # invite | reset
    token_hash: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    expires_at: datetime
    used_at: Optional[datetime] = None
    # Superseded by a newer link, or the account was deactivated.
    revoked_at: Optional[datetime] = None
