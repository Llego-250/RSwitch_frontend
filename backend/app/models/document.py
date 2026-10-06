from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class RequiredDocumentType(SQLModel, table=True):
    """The list of required document types is data, not code."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    renewal_months: Optional[int] = None


class ComplianceDocument(SQLModel, table=True):
    """status is never stored — it's derived from expiry_date at read time
    (see app.services.compliance.document_status). Only a missing row for a
    required type is itself the 'Missing' signal."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    doc_type_id: int = Field(foreign_key="requireddocumenttype.id", index=True)
    filename: str
    storage_key: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    expiry_date: Optional[date] = None
    notes: str = ""
    # The RSwitch staff member who uploaded it on the participant's behalf.
    uploaded_by: str = ""
