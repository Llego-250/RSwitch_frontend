"""Platform administration: audit trail, API keys, system settings,
notifications, report history/schedules and participant notes."""

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
