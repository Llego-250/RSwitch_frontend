from datetime import datetime
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from app.models.enums import SubmissionResult


class Submission(SQLModel, table=True):
    """One transfer from a participant: a file uploaded on its behalf or a
    payload pulled from its API. Every attempt is kept, failed ones included
    (SRS §6.4 audit trail, REQ-INTG-011)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    integration_id: Optional[int] = Field(default=None, foreign_key="integration.id", index=True)
    template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    period: str
    filename: str
    storage_key: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: str = ""
    # Schema validation outcome. Failed means nothing was loaded (§6.4).
    result: SubmissionResult
    error_count: int = 0
    # Structured report, one entry per violation: {row, column, rule,
    # description} (§20.2). Never contains cell values.
    errors: list = Field(default_factory=list, sa_column=Column(JSON))
    warning_count: int = 0
    warnings: list = Field(default_factory=list, sa_column=Column(JSON))
    records_received: int = 0  # rows in the file, whatever the outcome (REQ-INTG-009)
    # Aggregates written by the pipeline's Load step once the active mapping
    # has been applied (loaded_at set) — row_count is the transactions the
    # file represents and the sum of each numeric field (e.g. {"amount":
    # 48213.5}), used for volume trends. Never fabricated: derived from the
    # actual parsed file. Empty when validation failed.
    row_count: int = 0
    numeric_totals: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # {"channel": {"POS": {"count": 12, "amount": 3400.0}, ...}} — per-value
    # breakdown of categorical fields, used by inclusion analytics.
    breakdowns: dict = Field(default_factory=dict, sa_column=Column(JSON))
    loaded_at: Optional[datetime] = None
    # Compliance review of a passed submission: Pending Review | Approved | Rejected
    review_status: str = "Pending Review"
    review_note: str = ""
    reviewed_by: str = ""
    reviewed_at: Optional[datetime] = None
    # Compliance lifecycle (SRS §6.1, §6.4, §9.2). requirement_id links the
    # file to the Compliance Register entry it satisfies; status is this
    # file's own state: Submitted | Validation Failed | Under Review |
    # Approved | Rejected. A corrected file points at the attempt it replaces;
    # earlier attempts are never deleted (audit trail).
    requirement_id: Optional[int] = Field(default=None, foreign_key="compliancerequirement.id", index=True)
    status: str = "Submitted"
    rejection_reason: str = ""
    replaces_submission_id: Optional[int] = None
