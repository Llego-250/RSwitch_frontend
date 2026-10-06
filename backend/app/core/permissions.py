"""Every login is RSwitch staff (Compliance/Business/Board/Technical) and sees
the whole network. Participant institutions never log in — they send files
to RSwitch offline, and staff upload them on their behalf (SRS REQ-INTG-007)."""

from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.models.enums import UserRole
from app.models.user import User


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_uploader(current_user: User = Depends(get_current_user)) -> User:
    """Data files and compliance documents arrive from participants by email
    or secure transfer; only Compliance or Technical/Admin staff upload them
    into RDIP on the participant's behalf."""
    if current_user.role not in (UserRole.compliance, UserRole.technical):
        raise HTTPException(status_code=403, detail="Only Compliance or Technical / Admin can upload files")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.technical:
        raise HTTPException(status_code=403, detail="Technical / Admin role required")
    return current_user


def require_roles(*roles: UserRole):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles and current_user.role != UserRole.technical:
            raise HTTPException(status_code=403, detail="Your role can't perform this action")
        return current_user

    return dependency
