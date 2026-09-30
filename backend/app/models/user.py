from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.enums import UserRole


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str = ""
    hashed_password: str
    role: UserRole = UserRole.compliance
    is_active: bool = True
    # Set only for role == participant — the one participant this login is
    # scoped to. Every participant-role request is filtered to this id,
    # server-side, regardless of what the client asks for.
    participant_id: Optional[int] = Field(default=None, foreign_key="participant.id")
