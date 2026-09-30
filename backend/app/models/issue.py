from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.enums import IssueSeverity, IssueStatus


class Issue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    description: str
    severity: IssueSeverity = IssueSeverity.medium
    assignee: str = ""
    status: IssueStatus = IssueStatus.open
    due_date: Optional[date] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
