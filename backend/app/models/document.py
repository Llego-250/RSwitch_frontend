from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class RequiredDocumentType(SQLModel, table=True):
    """The list of required document types is data, not code."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    renewal_months: Optional[int] = None


class ComplianceDocument(SQLModel, table=True):
    """Expiry status is never stored — it's derived from expiry_date at read
    time (see app.services.compliance.document_status). Only a missing row
    for a required type is itself the 'Missing' signal.

    A document sent for a Compliance Register entry (requirement_id) is
    reviewed like a data return: review_status Submitted → Under Review →
    Approved | Rejected (§8.4). Empty review_status means it was filed
    outside the register and counts as on file."""

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
    requirement_id: Optional[int] = Field(default=None, foreign_key="compliancerequirement.id", index=True)
    review_status: str = ""
    review_note: str = ""
    rejection_reason: str = ""
    reviewed_by: str = ""
    reviewed_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    reviewed_at: Optional[datetime] = None
    # A corrected document points at the rejected one it replaces (§6.4).
    replaces_document_id: Optional[int] = None
