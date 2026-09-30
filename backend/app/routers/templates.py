from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.permissions import require_own_participant, require_staff, scope_participant_id
from app.db import get_session
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[IngestionTemplate])
def list_templates(
    session: Session = Depends(get_session), scope: Optional[int] = Depends(scope_participant_id)
):
    query = select(IngestionTemplate)
    if scope is not None:
        query = query.where(IngestionTemplate.participant_id == scope)
    return session.exec(query).all()


@router.post("", response_model=IngestionTemplate)
def create_template(
    template: IngestionTemplate, session: Session = Depends(get_session), _: User = Depends(require_staff)
):
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.get("/{template_id}/columns", response_model=list[TemplateColumn])
def list_columns(
    template_id: int,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    template = session.get(IngestionTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    require_own_participant(template.participant_id, scope)
    return session.exec(
        select(TemplateColumn).where(TemplateColumn.template_id == template_id).order_by(TemplateColumn.position)
    ).all()


@router.post("/{template_id}/columns", response_model=TemplateColumn)
def add_column(
    template_id: int,
    column: TemplateColumn,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    if not session.get(IngestionTemplate, template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    column.template_id = template_id
    session.add(column)
    session.commit()
    session.refresh(column)
    return column


@router.post("/{template_id}/publish", response_model=IngestionTemplate)
def publish_version(
    template_id: int, session: Session = Depends(get_session), _: User = Depends(require_staff)
):
    template = session.get(IngestionTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.version += 1
    session.add(template)
    session.commit()
    session.refresh(template)
    return template
