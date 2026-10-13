"""Participant data sources (SRS §5.3, §10.2). A participant may have several
— e.g. "Core Banking" uploaded manually each month and "Mobile Money" pulled
from its API every night."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.models.enums import IntegrationSource, IntegrationStatus


class IntegrationMode(str, Enum):
    """REQ-INTG-002."""

    manual = "Manual"  # the institution sends files; staff upload them on its behalf
    automated = "Automated API"  # RDIP pulls from the institution's endpoint on a schedule


class AuthType(str, Enum):
    """SRS §16: participant systems authenticate with an API key or OAuth 2.0
    (client-credentials grant)."""

    none = "None"
    api_key = "API Key"
    oauth2 = "OAuth 2.0"


class Integration(SQLModel, table=True):
    """status is completely separate from Participant.is_active — never read
    one as the other."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    source_name: str = "Manual data return"
    integration_mode: str = IntegrationMode.manual.value
    # API mode only. Both are Fernet-encrypted at rest (core.crypto) and are
    # never returned by the API in plain text — only masked.
    endpoint_url_encrypted: str = ""
    auth_type: str = AuthType.none.value
    credentials_encrypted: str = ""  # JSON: {"api_key"} or {"client_id","client_secret","token_url"}
    # Expected submission schedule (cron). In API mode it is also the pull
    # schedule: saving it keeps the integration's default PipelineConfig in step.
    schedule_cron: str = ""
    # Expected schema files are validated against, and the target mapping the
    # pipeline applies (its active published version, REQ-MAP-007).
    template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    mapping_id: Optional[int] = Field(default=None, foreign_key="fieldmapping.id")

    status: IntegrationStatus = IntegrationStatus.pending
    # Paused by a Technical/Admin user (§9.1): no scheduled pulls, syncs or
    # uploads until resumed.
    paused: bool = False
    note: str = ""  # why the integration has its current status
    source: IntegrationSource = IntegrationSource.manual
    warnings: list = Field(default_factory=list, sa_column=Column(JSON))

    # Last transfer of any outcome (§10.2 last_sync_*, REQ-INTG-009) ...
    last_sync_at: Optional[datetime] = None
    last_sync_records: int = 0
    last_sync_errors: int = 0
    # ... and the last SUCCESSFUL one (REQ-INTG-004).
    last_submission_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = ""
