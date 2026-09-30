"""Two-tier access model: staff (Compliance/Business/Board/Technical) see the
whole network; a participant-role login is hard-scoped to the one
Participant it belongs to and never sees another one — enforced here, not
just hidden in the UI."""

from typing import Optional

from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.models.enums import UserRole
from app.models.user import User


def scope_participant_id(current_user: User = Depends(get_current_user)) -> Optional[int]:
    """None for staff (no restriction). A participant id for a participant
    login — every list/get endpoint must filter to exactly this id."""
    return current_user.participant_id if current_user.role == UserRole.participant else None


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role == UserRole.participant:
        raise HTTPException(status_code=403, detail="Not available on a participant account")
    return current_user


def require_own_participant(participant_id: int, scope: Optional[int]) -> None:
    if scope is not None and participant_id != scope:
        raise HTTPException(status_code=403, detail="Not your participant record")


def require_participant_upload(participant_id: int, current_user: User) -> None:
    """Submissions and compliance documents are uploaded by the participant
    themselves — never by RSwitch staff on their behalf. Staff still see
    everything; they just don't perform this action."""
    if current_user.role != UserRole.participant:
        raise HTTPException(status_code=403, detail="Only the participant can upload their own data")
    if current_user.participant_id != participant_id:
        raise HTTPException(status_code=403, detail="Not your participant record")
