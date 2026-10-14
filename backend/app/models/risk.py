"""Participant risk assessment storage (SRS §18 ParticipantRiskScore, §11.5
nightly recalculation, REQ-P360-009..012) and the data-source status history
integration uptime is measured from (REQ-P360-007/010)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class ParticipantRiskScore(SQLModel, table=True):
    """One participant's score from one recalculation run. Rows are never
    updated, so every nightly run stays queryable as history; the latest row
    per participant is the current score (mirrored on Participant.risk_score)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    run_id: str = Field(index=True)  # every participant scored by one run shares it
    trigger: str = "Nightly"  # Nightly | Settings change | On demand | Initial
    computed_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    status: str = "insufficient_data"  # scored | insufficient_data (REQ-P360-012)
    composite: Optional[float] = None  # 0 (lowest) – 100 (highest risk), §11.5
    band: Optional[str] = None  # Low | Medium | High
    compliance_score: Optional[float] = None
    operational_score: Optional[float] = None
    technical_score: Optional[float] = None
    months_of_history: float = 0.0
    first_submission_at: Optional[datetime] = None
    # The methodology the run used (weights, thresholds, indicators), hashed so
    # a settings change is detected and triggers a recalculation.
    config_hash: str = ""
    # The full score as services.risk returns it: categories, indicators with
    # their measured inputs, §11.5 components. Aggregates only, never
    # customer-level data (REQ-P360-013, §2.7).
    breakdown: dict = Field(default_factory=dict, sa_column=Column(JSON))


class IntegrationStatusChange(SQLModel, table=True):
    """Every §9.1 status a data source moved into, and when. Recorded by
    pipeline_runner.set_integration_status, through which every status change
    goes; integration uptime over the last 30 days is read from it."""

    id: Optional[int] = Field(default=None, primary_key=True)
    integration_id: int = Field(foreign_key="integration.id", index=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    status: str  # IntegrationStatus value, e.g. "Failed"
    at: datetime = Field(default_factory=datetime.utcnow, index=True)
    source: str = ""  # Manual | Schedule check | Pipeline | Reconstructed
    note: str = ""
