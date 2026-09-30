from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Participant(SQLModel, table=True):
    """A financial service provider connected to the switch.

    is_active is trading eligibility, set independently of anything in the
    Integration model — it must never be read as a proxy for data-flow status.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    code: str = Field(unique=True, index=True)
    type: str = ""
    is_active: bool = True
    expected_frequency_days: int = 30
    created_at: datetime = Field(default_factory=datetime.utcnow)
