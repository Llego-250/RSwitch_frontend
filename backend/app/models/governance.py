from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class GovDocument(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    category: str = "Policy"  # Policy | Minutes | Decision | Working Paper | Other
    committee: str = "Board"
    version: str = "v1.0"
    access_level: str = "Internal"
    filename: str = ""
    storage_key: str = ""
    uploaded_by: str = ""
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class Meeting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    committee: str
    scheduled_at: datetime
    attendees_count: int = 0
    decisions_count: int = 0
    minutes_document_id: Optional[int] = Field(default=None, foreign_key="govdocument.id")
    created_by: str = ""


class ActionItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    description: str
    owner: str
    committee: str
    due_date: date
    completed: bool = False
    completed_at: Optional[datetime] = None


class WorkingGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    chair: str = ""
    members: str = ""
