from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.models.enums import UserRole

# SRS §10.5 user status. Derived (see User.status) rather than stored, so it
# can never drift from is_active / pending_invite.
STATUS_ACTIVE = "Active"
STATUS_INACTIVE = "Inactive"
STATUS_INVITED = "Invited"

# The three roles a user can be given (SRS §4.1). Board and Participant are
# legacy enum members kept only so old rows still load.
ASSIGNABLE_ROLES = (UserRole.compliance, UserRole.business, UserRole.technical)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Stored lower-case; uniqueness is therefore case-insensitive (§11.2).
    email: str = Field(unique=True, index=True)
    full_name: str = ""
    hashed_password: str
    role: UserRole = UserRole.compliance
    # False for deactivated accounts and for invitations not yet accepted:
    # such users can't sign in and receive no notifications.
    is_active: bool = True
    # Senior Compliance / Business users receive escalations (SRS §13:
    # incident remediation overdue, AI alert auto-escalation).
    is_senior: bool = False
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
    # REQ-AUTH-003: consecutive failures (password or MFA code) and the lock
    # they trigger. Reset by a completed sign-in.
    failed_attempts: int = 0
    locked_until: Optional[datetime] = None
    # §11.1 "cannot match last 5 passwords": bcrypt hashes of previous
    # passwords, newest first (the current one is hashed_password).
    password_history: list = Field(default_factory=list, sa_column=Column(JSON))
    password_changed_at: Optional[datetime] = None
    # REQ-USR-001/002: invited but hasn't set a password yet.
    pending_invite: bool = False
    invited_at: Optional[datetime] = None
    invited_by: str = ""

    @property
    def status(self) -> str:
        if self.pending_invite:
            return STATUS_INVITED
        return STATUS_ACTIVE if self.is_active else STATUS_INACTIVE

    @property
    def is_locked(self) -> bool:
        return self.locked_until is not None and self.locked_until > datetime.utcnow()
