from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.enums import IntegrationSource, IntegrationStatus


class Integration(SQLModel, table=True):
    """One row per participant. status is completely separate from
    Participant.is_active — never read one as the other."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", unique=True, index=True)
    status: IntegrationStatus = IntegrationStatus.connected
    note: str = ""
    source: IntegrationSource = IntegrationSource.manual
    last_submission_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = ""
