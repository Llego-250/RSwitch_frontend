from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.permissions import require_staff, scope_participant_id
from app.db import get_session
from app.models.enums import IntegrationSource, IntegrationStatus
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.user import User
from app.services import audit

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
def list_integrations(
    status: Optional[IntegrationStatus] = None,
    participant_code: Optional[str] = None,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    query = select(Integration, Participant).where(Integration.participant_id == Participant.id)
    if scope is not None:
        query = query.where(Integration.participant_id == scope)
    else:
        if status is not None:
            query = query.where(Integration.status == status)
        if participant_code is not None:
            query = query.where(Participant.code == participant_code)
    rows = session.exec(query).all()
    return [
        {
            "id": integration.id,
            "participant_id": participant.id,
            "participant_name": participant.name,
            "participant_code": participant.code,
            "status": integration.status,
            "note": integration.note,
            "source": integration.source,
            "updated_at": integration.updated_at,
            "updated_by": integration.updated_by,
        }
        for integration, participant in rows
    ]


@router.patch("/{integration_id}/status")
def set_status(
    integration_id: int,
    request: Request,
    status: IntegrationStatus = Body(...),
    note: str = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_staff),
):
    if not note.strip():
        raise HTTPException(status_code=422, detail="A note is required when changing integration status")
    integration = session.get(Integration, integration_id)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    integration.status = status
    integration.note = note
    integration.source = IntegrationSource.manual
    integration.updated_at = datetime.utcnow()
    integration.updated_by = current_user.full_name or current_user.email
    session.add(integration)
    session.commit()
    session.refresh(integration)
    audit.record(session, "INTEGRATION_STATUS", f"integration #{integration.id} → {status.value}: {note}", current_user, request,
                 status="WARNING" if status != IntegrationStatus.connected else "SUCCESS")
    return integration
