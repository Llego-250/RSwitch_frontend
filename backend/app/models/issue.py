"""Incidents (SRS §5.8 REQ-COMP-006/007/010/011, §6.2, §9.4, §10.4, §14.5).

The table keeps its original name (`issue`) so existing rows and the
/issues API carry on working; `Incident` is the name new code should use.
The workflow itself lives in app.services.incidents."""

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.enums import IssueSeverity, IssueStatus


class Issue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    # When the incident happened (REQ-COMP-006); created_at is when it was
    # raised in RDIP (§10.4 raised_at).
    incident_date: Optional[date] = None
    description: str
    severity: IssueSeverity = IssueSeverity.medium
    status: IssueStatus = IssueStatus.open
    raised_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    # §10.4 assigned_owner: the remediation owner, any staff role.
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    # The owner's display name, kept in step with owner_id for older /issues
    # consumers that read a free-text assignee.
    assignee: str = ""
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    resolution_summary: str = ""
    # Legacy free-text target date from before remediation action items;
    # remediation due dates now live on RemediationAction (REQ-COMP-010).
    due_date: Optional[date] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)  # §10.4 raised_at
    updated_at: Optional[datetime] = None


Incident = Issue


class RemediationAction(SQLModel, table=True):
    """A remediation action item for an unresolved incident (REQ-COMP-010,
    §6.2 steps 3-4). status is Open or Completed; Overdue is derived (due
    date passed without completion) and escalated by the scheduler
    (REQ-COMP-011)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    incident_id: int = Field(foreign_key="issue.id", index=True)
    description: str
    owner_id: int = Field(foreign_key="user.id", index=True)
    due_date: date
    status: str = "Open"
    completed_at: Optional[datetime] = None
    completed_by: str = ""
    completion_note: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
