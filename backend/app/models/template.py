"""Standards & Mapping data (SRS §5.5, §18).

IngestionTemplate is a source schema: the columns a participant's file must
have, used to validate it (REQ-INTG-008). FieldMapping translates those
source fields to a canonical target standard (REQ-MAP-001), versioned as
FieldMapping ├ MappingVersion[] └ FieldRule[]: each version owns its rules,
published versions are immutable and edits happen on the single draft."""

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


class FieldMapping(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)  # "MAP-001" (REQ-MAP-002 unique mapping ID)
    name: str
    source_system: str = ""  # e.g. "MobiPesa mobile money platform"
    participant_id: Optional[int] = Field(default=None, foreign_key="participant.id", index=True)
    # The source schema whose columns are this mapping's source fields.
    source_template_id: Optional[int] = Field(default=None, foreign_key="ingestiontemplate.id")
    target_standard: str = "JSON Canonical"  # a key of services.mapping.STANDARDS
    # Last published version, applied by the pipeline (REQ-MAP-007). No FK:
    # MappingVersion already points here and a cycle would complicate DDL.
    active_version_id: Optional[int] = None
    cloned_from_id: Optional[int] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MappingVersion(SQLModel, table=True):
    """A published release (v1.0, v2.0 …, REQ-MAP-004/005) or the one draft."""

    id: Optional[int] = Field(default=None, primary_key=True)
    mapping_id: int = Field(foreign_key="fieldmapping.id", index=True)
    is_draft: bool = True
    number: int = 0  # major version once published; 0 while a draft
    notes: str = ""
    # Snapshot at publish time (REQ-MAP-002 mapped vs total fields).
    mapped_count: int = 0
    total_count: int = 0
    published_by: str = ""
    published_at: Optional[datetime] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def label(self) -> str:
        return f"v{self.number}.0" if not self.is_draft else "Draft"


class FieldRule(SQLModel, table=True):
    """One source field and where it lands in the target standard. An empty
    target_field means the source field is unmapped (REQ-MAP-003, MAP-008)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    mapping_id: int = Field(foreign_key="fieldmapping.id", index=True)
    version_id: int = Field(foreign_key="mappingversion.id", index=True)
    source_field: str
    target_field: str = ""
    transform: str = ""  # "" | trim | uppercase | lowercase | number | date
    position: int = 0
