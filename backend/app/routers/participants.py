from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.permissions import require_own_participant, require_staff, scope_participant_id
from app.core.security import get_current_user
from app.db import get_session
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.user import User

router = APIRouter(prefix="/participants", tags=["participants"])


@router.get("", response_model=list[Participant])
def list_participants(
    is_active: Optional[bool] = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    query = select(Participant)
    if is_active is not None:
        query = query.where(Participant.is_active == is_active)
    return session.exec(query).all()


@router.post("", response_model=Participant)
def create_participant(
    participant: Participant, session: Session = Depends(get_session), _: User = Depends(require_staff)
):
    session.add(participant)
    session.commit()
    session.refresh(participant)
    # Every participant gets exactly one Integration row to monitor — never
    # derived from or confused with is_active.
    session.add(Integration(participant_id=participant.id))
    session.commit()
    return participant


@router.get("/me", response_model=Participant)
def my_participant(
    session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):
    if current_user.participant_id is None:
        raise HTTPException(status_code=404, detail="This account isn't linked to a participant")
    return session.get(Participant, current_user.participant_id)


@router.get("/{participant_id}", response_model=Participant)
def get_participant(
    participant_id: int,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    require_own_participant(participant_id, scope)
    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    return participant


@router.patch("/{participant_id}", response_model=Participant)
def update_participant(
    participant_id: int,
    updates: dict,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    for key, value in updates.items():
        if hasattr(participant, key):
            setattr(participant, key, value)
    session.add(participant)
    session.commit()
    session.refresh(participant)
    return participant
