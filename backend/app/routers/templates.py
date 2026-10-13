"""Ingestion templates: the source schemas uploaded files and API pulls are
validated against (REQ-INTG-008). Anyone may read them (uploaders need to
know what's expected); changing them is a Standards & Mapping action for
Technical/Admin users (REQ-MAP-009)."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.participant import Participant
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User
from app.services import audit

router = APIRouter(prefix="/templates", tags=["templates"])

view = require_cap("integrations.view")
manage = require_cap("mapping.manage")
COLUMN_TYPES = ("string", "number", "date", "enum")


@router.get("", response_model=list[IngestionTemplate])
def list_templates(participant_id: int | None = None, session: Session = Depends(get_session), _: User = Depends(view)):
    query = select(IngestionTemplate)
    if participant_id is not None:
        query = query.where(IngestionTemplate.participant_id == participant_id)
    return session.exec(query.order_by(IngestionTemplate.participant_id, IngestionTemplate.name)).all()


@router.post("", response_model=IngestionTemplate, status_code=201)
def create_template(template: IngestionTemplate, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    problems = []
    if not (template.name or "").strip():
        problems.append(problem("name", "required", "Name the template"))
    if not session.get(Participant, template.participant_id):
        problems.append(problem("participant_id", "exists", "Choose a participant"))
    if problems:
        raise validation_error(problems)
    template.id = None
    template.version = 1
    session.add(template)
    session.commit()
    session.refresh(template)
    audit.record(session, "TEMPLATE_CREATE", f"TPL-{template.id} {template.name}", user, request)
    return template


def _get(session: Session, template_id: int) -> IngestionTemplate:
    template = session.get(IngestionTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return template


@router.get("/{template_id}/columns", response_model=list[TemplateColumn])
def list_columns(template_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    _get(session, template_id)
    return session.exec(
        select(TemplateColumn).where(TemplateColumn.template_id == template_id).order_by(TemplateColumn.position)
    ).all()


@router.post("/{template_id}/columns", response_model=TemplateColumn, status_code=201)
def add_column(template_id: int, column: TemplateColumn, request: Request, session: Session = Depends(get_session),
               user: User = Depends(manage)):
    template = _get(session, template_id)
    name = (column.name or "").strip()
    problems = []
    if not name:
        problems.append(problem("name", "required", "Name the column"))
    elif session.exec(select(TemplateColumn.id).where(TemplateColumn.template_id == template_id, TemplateColumn.name == name)).first():
        problems.append(problem("name", "unique", "The template already has this column"))
    if column.type not in COLUMN_TYPES:
        problems.append(problem("type", "enum", f"Type must be one of: {', '.join(COLUMN_TYPES)}"))
    if problems:
        raise validation_error(problems)
    column.id = None
    column.name = name
    column.template_id = template_id
    session.add(column)
    session.commit()
    session.refresh(column)
    audit.record(session, "TEMPLATE_COLUMN_ADD", f"TPL-{template.id}: {name}", user, request)
    return column


@router.delete("/{template_id}/columns/{column_id}")
def delete_column(template_id: int, column_id: int, request: Request, session: Session = Depends(get_session),
                  user: User = Depends(manage)):
    template = _get(session, template_id)
    column = session.get(TemplateColumn, column_id)
    if not column or column.template_id != template_id:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    session.delete(column)
    session.commit()
    audit.record(session, "TEMPLATE_COLUMN_DELETE", f"TPL-{template.id}: {column.name}", user, request, status="WARNING")
    return {"deleted": column_id}


@router.post("/{template_id}/publish", response_model=IngestionTemplate)
def publish_version(template_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """Bump the schema version after column changes, so validation logs say
    which version a file was checked against."""
    template = _get(session, template_id)
    template.version += 1
    session.add(template)
    session.commit()
    session.refresh(template)
    audit.record(session, "TEMPLATE_PUBLISH", f"TPL-{template.id} v{template.version}", user, request)
    return template
