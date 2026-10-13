from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AnomalyAlert(SQLModel, table=True):
    """Raised by app.services.anomaly from real submission data (SRS §8.3).
    Advisory only (REQ-AI-002): people move it through the §9.3 lifecycle
    Generated → Acknowledged → Under Investigation → Resolved / Escalated →
    Closed, with a note at every step; nothing here ever changes a
    participant or an integration."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    # Unique per piece of evidence (signal + the period/data it rests on), so
    # re-running detection over the same data never raises it twice.
    dedupe_key: str = Field(unique=True)
    # participant + indicator family. At most one non-Closed alert per signal;
    # once it is Closed, new evidence for the same signal raises a NEW alert
    # (REQ-AI-006c) — see recurrence_of.
    signal_key: str = Field(default="", index=True)
    # Every evidence key this alert has absorbed, so closing it doesn't make
    # already-seen data look like a recurrence.
    evidence_keys: list = Field(default_factory=list, sa_column=Column(JSON))
    indicator_code: str = ""
    # REQ-AI-004 / §8.3 alert card
    indicator: str
    baseline_value: str
    observed_value: str
    deviation: str
    deviation_pct: Optional[float] = None
    recommended_area: str
    severity: str  # CRITICAL | HIGH | MEDIUM | LOW
    # REQ-AI-009 / REQ-AI-011: which baseline produced it and how.
    baseline_method: str
    baseline_method_key: str = ""  # threshold | rolling | peer | <plugin method>
    methodology: str = ""
    data_sources: list = Field(default_factory=list, sa_column=Column(JSON))
    detector: str = ""  # dotted path of the detector that raised it (REQ-AI-010)
    # REQ-AI-008: the submissions that drove the alert (drill-down).
    source_submission_ids: list = Field(default_factory=list, sa_column=Column(JSON))
    status: str = "Generated"
    # Under Investigation means assigned to a specific user (§9.3).
    assignee_id: Optional[int] = Field(default=None, foreign_key="user.id")
    assignee_name: str = ""
    recurrence_of: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status_changed_at: datetime = Field(default_factory=datetime.utcnow)
    last_detected_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    # History: one entry per transition / system event
    # {date, user, user_id, role, text, from, to}.
    notes: list = Field(default_factory=list, sa_column=Column(JSON))
    resolution_summary: str = ""
