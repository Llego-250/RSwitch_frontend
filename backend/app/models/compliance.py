"""Compliance Register (SRS §5.8, §10.3): one row per obligation a
participant must meet — a periodic data return validated against an
ingestion template, or a document such as a BNR licence.

Each obligation runs in cycles (one per due date). The requirement row
mirrors its current cycle (§10.3 fields); ComplianceCycle keeps every past
cycle so the outcome of each one stays queryable (REQ-COMP-009), and
ComplianceCycleItem records which submissions/documents were sent for it."""

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ComplianceRequirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)  # the responsible participant
    requirement_name: str
    regulatory_reference: str = ""  # e.g. "BNR Directive 07/2024"
    # Data Return (file validated against template_id) | Document (doc_type_id).
    kind: str = "Data Return"
    template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    doc_type_id: Optional[int] = Field(default=None, foreign_key="requireddocumenttype.id")
    frequency: str = "Monthly"  # ComplianceFrequency value
    # Day of the month recurring due dates fall on (31 → last day of shorter
    # months), so Jan 31 → Feb 28 → Mar 31 rather than drifting.
    anchor_day: Optional[int] = None
    description: str = ""
    # ---- the current cycle, mirrored (§10.3) ----
    due_date: date
    submission_status: str = "Pending"  # ComplianceStatus value
    submitted_at: Optional[datetime] = None
    reviewed_by: str = ""
    reviewed_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    approved_at: Optional[datetime] = None
    rejection_reason: str = ""
    active: bool = True
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = ""
    updated_at: Optional[datetime] = None


class ComplianceCycle(SQLModel, table=True):
    """One due date of a requirement and how it went. stage is where the
    workflow stands regardless of the deadline; status is the §9.2 status
    shown everywhere (stage, or Overdue once the deadline has passed without
    an acceptable submission)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_id: int = Field(foreign_key="compliancerequirement.id", index=True)
    period: str = ""  # e.g. "October 2026", "Q4 2026", "2026"
    due_date: date
    stage: str = "Pending"
    status: str = "Pending"
    submitted_at: Optional[datetime] = None  # latest valid file received
    reviewed_by: str = ""
    reviewed_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    reviewed_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    approved_submission_id: Optional[int] = None
    approved_document_id: Optional[int] = None
    # Set at approval: the approved file reached RSwitch by the due date.
    on_time: Optional[bool] = None
    rejection_reason: str = ""
    # §6.4 step 3: Compliance asked the institution (offline) for a
    # corrected file → Pending Correction until one arrives.
    correction_requested_at: Optional[datetime] = None
    correction_requested_by: str = ""
    correction_note: str = ""
    overdue_at: Optional[datetime] = None  # first seen Overdue
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None  # approval closes a cycle


class ComplianceCycleItem(SQLModel, table=True):
    """A submission (data return) or document sent for a cycle. Every
    attempt is linked, failed and rejected ones included (§6.4 audit trail)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    cycle_id: int = Field(foreign_key="compliancecycle.id", index=True)
    submission_id: Optional[int] = Field(default=None, foreign_key="submission.id", unique=True)
    document_id: Optional[int] = Field(default=None, foreign_key="compliancedocument.id", unique=True)
    linked_at: datetime = Field(default_factory=datetime.utcnow)
