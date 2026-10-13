"""Compliance Register (SRS §5.8, §10.3): one row per obligation a
participant must meet — a periodic data return validated against an
ingestion template, or a document such as a BNR licence."""

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ComplianceRequirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    requirement_name: str
    regulatory_reference: str = ""  # e.g. "BNR Directive 07/2024"
    # Data Return (file validated against template_id) | Document (doc_type_id).
    kind: str = "Data Return"
    template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    doc_type_id: Optional[int] = Field(default=None, foreign_key="requireddocumenttype.id")
    frequency: str = "Monthly"  # ComplianceFrequency value
    due_date: date
    submission_status: str = "Pending"  # ComplianceStatus value
    submitted_at: Optional[datetime] = None
    reviewed_by: str = ""
    approved_at: Optional[datetime] = None
    rejection_reason: str = ""
    active: bool = True
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
