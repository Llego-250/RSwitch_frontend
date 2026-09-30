from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AnomalyAlert(SQLModel, table=True):
    """Raised by app.services.anomaly from real submission data. Advisory
    only: humans move it through Generated → Acknowledged → Under
    Investigation → Closed, with a note at every step."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    # indicator + period make an alert unique, so re-running detection
    # never duplicates an existing alert.
    dedupe_key: str = Field(unique=True)
    indicator: str
    baseline_value: str
    observed_value: str
    deviation: str
    recommended_area: str
    severity: str  # CRITICAL | HIGH | MEDIUM | LOW
    baseline_method: str
    status: str = "Generated"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status_changed_at: datetime = Field(default_factory=datetime.utcnow)
    notes: list = Field(default_factory=list, sa_column=Column(JSON))
    resolution_summary: str = ""
