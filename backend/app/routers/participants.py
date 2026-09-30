from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.permissions import require_own_participant, require_roles, require_staff, scope_participant_id
from app.core.security import get_current_user
from app.db import get_session
from app.models.admin import ParticipantNote
from app.models.enums import UserRole
from app.models.integration import Integration
from app.services import audit
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
    participant: Participant, request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)
):
    if session.exec(select(Participant).where(Participant.code == participant.code)).first():
        raise HTTPException(status_code=409, detail=f"Participant code {participant.code} is already in use")
    session.add(participant)
    session.commit()
    session.refresh(participant)
    # Every participant gets exactly one Integration row to monitor — never
    # derived from or confused with is_active.
    session.add(Integration(participant_id=participant.id))
    session.commit()
    session.refresh(participant)
    audit.record(session, "PARTICIPANT_CREATE", f"{participant.name} ({participant.code})", user, request)
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
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_staff),
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
    audit.record(session, "PARTICIPANT_UPDATE", f"{participant.code}: {', '.join(updates)}", user, request)
    return participant


@router.get("/{participant_id}/notes", response_model=list[ParticipantNote])
def list_notes(participant_id: int, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return session.exec(
        select(ParticipantNote).where(ParticipantNote.participant_id == participant_id).order_by(ParticipantNote.created_at.desc())
    ).all()


@router.post("/{participant_id}/notes", response_model=ParticipantNote)
def add_note(
    participant_id: int,
    request: Request,
    note: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(UserRole.compliance)),
):
    if not session.get(Participant, participant_id):
        raise HTTPException(status_code=404, detail="Participant not found")
    if not note.strip():
        raise HTTPException(status_code=422, detail="Note can't be empty")
    row = ParticipantNote(participant_id=participant_id, author=user.full_name or user.email, note=note.strip())
    session.add(row)
    session.commit()
    session.refresh(row)
    audit.record(session, "PARTICIPANT_NOTE", f"participant #{participant_id}", user, request)
    return row
