"""Governance (SRS §5.7, §10.6, §18):

    GovernanceCommittee
      ├── Member[]          CommitteeMember (RSwitch staff or participant representative)
      ├── Meeting[]         Meeting (+ MeetingAttendee[])
      │     ├── Document[]  GovDocument.meeting_id
      │     └── ActionItem[]
      └── Document[]

The older free-text columns (GovDocument.committee, Meeting.committee,
ActionItem.owner/committee, WorkingGroup) are kept so existing databases still
map; governance_jobs.backfill_legacy() links old rows to committees and the
display names are kept in sync on every write.
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

# REQ-GOV-001: the Board, Steering Committees and Technical/Operational Working Groups.
COMMITTEE_TYPES = ("Board", "Steering Committee", "Technical Working Group", "Operational Working Group")
# The chair is GovernanceCommittee.chair_id; these are the other seats.
MEMBER_ROLES = ("Member", "Vice-Chair", "Secretary", "Observer")
# §10.6
DOCUMENT_CATEGORIES = ("Policy", "Minutes", "Decision", "Working Paper", "Other")
ACCESS_LEVELS = ("Internal", "Restricted")
# §9.4
ACTION_STATUSES = ("Open", "In Progress", "Completed", "Overdue")


class GovernanceCommittee(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    type: str = "Steering Committee"  # one of COMMITTEE_TYPES
    description: str = ""
    # The chair receives overdue escalations (REQ-GOV-010) and can always
    # see the committee's Restricted documents.
    chair_id: Optional[int] = Field(default=None, foreign_key="user.id")
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CommitteeMember(SQLModel, table=True):
    """One seat in the membership register (REQ-GOV-008): either an RSwitch
    staff user, or a participant institution's representative, who has no
    RDIP login and is reached by email only."""

    id: Optional[int] = Field(default=None, primary_key=True)
    committee_id: int = Field(foreign_key="governancecommittee.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    participant_id: Optional[int] = Field(default=None, foreign_key="participant.id")
    # Representatives only (staff names come from the User row).
    name: str = ""
    email: str = ""
    role: str = "Member"  # one of MEMBER_ROLES
    joined_on: date = Field(default_factory=date.today)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GovDocument(SQLModel, table=True):
    """§10.6. Each uploaded version is its own row; versions of one document
    share series_id (the first version's id) and only the newest has
    is_latest, so older versions stay downloadable."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    category: str = "Policy"  # one of DOCUMENT_CATEGORIES
    committee: str = "Board"  # committee name, kept for display/legacy rows
    committee_id: Optional[int] = Field(default=None, foreign_key="governancecommittee.id", index=True)
    version: str = "v1.0"
    access_level: str = "Internal"  # Internal | Restricted
    filename: str = ""
    storage_key: str = ""
    content_type: str = ""
    size_bytes: int = 0
    uploaded_by: str = ""  # uploader's name, kept for display/legacy rows
    uploaded_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    # Meeting this document belongs to (minutes, papers tabled). No FK
    # constraint: Meeting.minutes_document_id already points the other way and
    # a two-way FK cycle breaks create_all ordering on Postgres.
    meeting_id: Optional[int] = Field(default=None, index=True)
    series_id: Optional[int] = Field(default=None, index=True)
    is_latest: bool = True


class Meeting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    committee: str  # committee name, kept for display/legacy rows
    committee_id: Optional[int] = Field(default=None, foreign_key="governancecommittee.id", index=True)
    scheduled_at: datetime  # UTC
    duration_minutes: int = 60
    location: str = ""
    agenda: str = ""
    # REQ-GOV-005: the list of decisions taken.
    decisions: list = Field(default_factory=list, sa_column=Column(JSON))
    # Legacy counters; kept equal to len(attendees) / len(decisions).
    attendees_count: int = 0
    decisions_count: int = 0
    minutes_document_id: Optional[int] = Field(default=None, foreign_key="govdocument.id")
    created_by: str = ""
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MeetingAttendee(SQLModel, table=True):
    """An invitee: a staff user, or a committee member (representative).
    name/email are copied so the record survives a member leaving."""

    id: Optional[int] = Field(default=None, primary_key=True)
    meeting_id: int = Field(foreign_key="meeting.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    member_id: Optional[int] = Field(default=None, index=True)
    name: str = ""
    email: str = ""


class ActionItem(SQLModel, table=True):
    """REQ-GOV-006. The owner is an RSwitch user (owner_user_id) or an
    institution (owner_participant_id, reached at its primary contact email);
    `owner` holds the display name. Overdue is set by the system
    (governance_jobs) when the due date passes without completion."""

    id: Optional[int] = Field(default=None, primary_key=True)
    description: str
    owner: str
    owner_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    owner_participant_id: Optional[int] = Field(default=None, foreign_key="participant.id")
    committee: str  # committee name, kept for display/legacy rows
    committee_id: Optional[int] = Field(default=None, foreign_key="governancecommittee.id", index=True)
    meeting_id: Optional[int] = Field(default=None, foreign_key="meeting.id", index=True)
    due_date: date
    status: str = "Open"  # one of ACTION_STATUSES
    # Legacy flag; kept equal to status == "Completed".
    completed: bool = False
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completed_by: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkingGroup(SQLModel, table=True):
    """Legacy free-text register, superseded by GovernanceCommittee and
    CommitteeMember. Rows are migrated by governance_jobs.backfill_legacy()
    and the table is left in place, read-only."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    chair: str = ""
    members: str = ""
