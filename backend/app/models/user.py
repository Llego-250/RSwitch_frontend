from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.models.enums import UserRole


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str = ""
    hashed_password: str
    role: UserRole = UserRole.compliance
    is_active: bool = True
    # Legacy: participant logins were removed (participants never sign in).
    # Kept only so existing databases still map; always None for new users.
    participant_id: Optional[int] = Field(default=None, foreign_key="participant.id")
    # TOTP two-factor. The secret is set at setup time; mfa_enabled flips only
    # after the user proves they can generate a valid code.
    mfa_secret: Optional[str] = None
    mfa_enabled: bool = False
    recovery_codes: list = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None
