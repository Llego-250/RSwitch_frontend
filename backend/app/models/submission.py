from datetime import datetime
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from app.models.enums import SubmissionResult


class Submission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    period: str
    filename: str
    storage_key: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: str = ""
    result: SubmissionResult
    error_count: int = 0
    errors: list = Field(default_factory=list, sa_column=Column(JSON))
    # Populated only for passed submissions — row_count and the sum of any
    # numeric columns (e.g. {"amount": 48213.5}), used for board-level
    # volume trends. Never fabricated: derived from the actual parsed file.
    row_count: int = 0
    numeric_totals: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # {"channel": {"POS": {"count": 12, "amount": 3400.0}, ...}} — per-value
    # breakdown of categorical columns, used by inclusion analytics.
    breakdowns: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # Compliance review of a passed submission: Pending Review | Approved | Rejected
    review_status: str = "Pending Review"
    review_note: str = ""
    reviewed_by: str = ""
    reviewed_at: Optional[datetime] = None
