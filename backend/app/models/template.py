from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class IngestionTemplate(SQLModel, table=True):
    """A participant's expected file schema. Columns live in the DB, not code —
    adding a new FSP format is an admin edit, not a deploy."""

    id: Optional[int] = Field(default=None, primary_key=True)
    participant_id: int = Field(foreign_key="participant.id", index=True)
    name: str
    version: int = 1
    applies_to: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TemplateColumn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="ingestiontemplate.id", index=True)
    name: str
    type: str = "string"  # string | number | date | enum
    rule: str = ""
    required: bool = True
    position: int = 0
