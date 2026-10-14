from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Participant(SQLModel, table=True):
    """A financial institution connected to the switch (SRS §10.1).

    is_active is trading eligibility, set independently of anything in the
    Integration model — it must never be read as a proxy for data-flow status.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    short_name: str = ""
    code: str = Field(unique=True, index=True)
    # One of InstitutionType's values: Commercial Bank | E-money Issuer | MFI | SACCO.
    type: str = ""
    country: str = "Rwanda"
    # One of enums.REGIONS; empty when unknown.
    region: str = ""
    registration_date: Optional[date] = None
    primary_contact_name: str = ""
    primary_contact_email: str = ""
    # Active | Inactive | Suspended (ParticipantStatus).
    status: str = "Active"
    is_active: bool = True
    expected_frequency_days: int = 30
    # §10.1: the latest composite risk score 0–100, written by every
    # recalculation (services.risk); None while the participant has less than
    # 3 months of submission history (REQ-P360-012).
    risk_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
