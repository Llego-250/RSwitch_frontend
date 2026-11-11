"""Standards & Mapping API (SRS §5.5). Technical/Admin only (REQ-MAP-009);
served under /integrations/mappings because the module is a configuration
tool within the Integrations area, not a primary module."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.template import FieldMapping, IngestionTemplate, MappingVersion
from app.models.user import User
from app.services import audit, mapping as svc

router = APIRouter(prefix="/mappings", tags=["Standards & Mapping"])

view = require_cap("mapping.view")
manage = require_cap("mapping.manage")


def _who(user: User) -> str:
    return user.full_name or user.email


def _version_out(session: Session, version: Optional[MappingVersion], with_rules: bool = False) -> Optional[dict]:
    if version is None:
        return None
    rules = svc.rules_of(session, version.id)
    mapped, total = svc.counts(rules)
    out = {
        "id": version.id,
        "label": version.label,
        "number": version.number,
        "is_draft": version.is_draft,
        "notes": version.notes,
        "mapped_count": mapped,
        "total_count": total,
        "published_by": version.published_by,
        "published_at": version.published_at,
        "created_by": version.created_by,
        "created_at": version.created_at,
    }
    if with_rules:
        out["rules"] = [
            {"id": r.id, "source_field": r.source_field, "target_field": r.target_field, "transform": r.transform, "position": r.position}
            for r in rules
        ]
    return out


def mapping_out(session: Session, m: FieldMapping, *, detail: bool = False) -> dict:
    active = session.get(MappingVersion, m.active_version_id) if m.active_version_id else None
    draft = svc.draft_of(session, m)
    shown = active or draft  # counts describe what the pipeline applies, or the draft before first publish
    mapped, total = svc.counts(svc.rules_of(session, shown.id)) if shown else (0, 0)
    participant = session.get(Participant, m.participant_id) if m.participant_id else None
    template = session.get(IngestionTemplate, m.source_template_id) if m.source_template_id else None
    out = {
        "id": m.id,
        "code": m.code,
        "name": m.name,
        "source_system": m.source_system,
        "target_standard": m.target_standard,
        "participant_id": m.participant_id,
        "participant_name": participant.name if participant else None,
        "source_template_id": m.source_template_id,
        "source_template_name": f"{template.name} (TPL-{template.id})" if template else None,
        "version": active.label if active else None,
        "status": svc.status_of(session, m),
        "mapped_count": mapped,
        "total_count": total,
        "has_draft": draft is not None,
        "cloned_from_id": m.cloned_from_id,
        "used_by": len(session.exec(select(Integration.id).where(Integration.mapping_id == m.id)).all()),
        "created_by": m.created_by,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
    }
    if detail:
        out["active_version"] = _version_out(session, active, with_rules=True)
        out["draft"] = _version_out(session, draft, with_rules=True)
    return out


def _get(session: Session, mapping_id: int) -> FieldMapping:
    m = session.get(FieldMapping, mapping_id)
    if not m:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return m


def _raise(exc: svc.MappingError):
    entry = problem(exc.field, "mapping", exc.message)
    entry.update(exc.extra)
    raise validation_error([entry])


@router.get("/standards")
def standards(_: User = Depends(view)):
    """Target standards and the canonical fields each defines (REQ-MAP-001)."""
    return {
        "standards": {
            name: [{"name": f.name, "type": f.type, "description": f.description, "role": f.role} for f in fields]
            for name, fields in svc.STANDARDS.items()
        },
        "transforms": [{"key": k, "label": v} for k, v in svc.TRANSFORMS.items()],
    }


@router.get("")
def list_mappings(session: Session = Depends(get_session), _: User = Depends(view)):
    return [mapping_out(session, m) for m in session.exec(select(FieldMapping).order_by(FieldMapping.code)).all()]


class MappingIn(BaseModel):
    name: str
    source_system: str = ""
    target_standard: str = "JSON Canonical"
    source_template_id: Optional[int] = None
    participant_id: Optional[int] = None


@router.post("", status_code=201)
def create_mapping(body: MappingIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    try:
        m = svc.create_mapping(session, name=body.name, source_system=body.source_system, target_standard=body.target_standard,
                               source_template_id=body.source_template_id, participant_id=body.participant_id, user=_who(user))
    except svc.MappingError as exc:
        session.rollback()
        _raise(exc)
    session.commit()
    session.refresh(m)
    audit.record(session, "MAPPING_CREATE", f"{m.code} {m.name}", user, request)
    return mapping_out(session, m, detail=True)


@router.get("/{mapping_id}")
def get_mapping(mapping_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    return mapping_out(session, _get(session, mapping_id), detail=True)


class MappingUpdate(BaseModel):
    name: Optional[str] = None
    source_system: Optional[str] = None


@router.put("/{mapping_id}")
def update_mapping(mapping_id: int, body: MappingUpdate, request: Request, session: Session = Depends(get_session),
                   user: User = Depends(manage)):
    """Descriptive fields only; rules change through the draft."""
    m = _get(session, mapping_id)
    if body.name is not None:
        if not body.name.strip():
            raise validation_error([problem("name", "required", "Name the mapping")])
        m.name = body.name.strip()
    if body.source_system is not None:
        m.source_system = body.source_system.strip()
    m.updated_at = datetime.utcnow()
    session.add(m)
    session.commit()
    audit.record(session, "MAPPING_UPDATE", m.code, user, request)
    return mapping_out(session, m, detail=True)


@router.post("/{mapping_id}/draft")
def start_draft(mapping_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    m = _get(session, mapping_id)
    svc.ensure_draft(session, m, _who(user))
    session.commit()
    audit.record(session, "MAPPING_DRAFT", m.code, user, request)
    return mapping_out(session, m, detail=True)


@router.put("/{mapping_id}/draft")
def save_draft(mapping_id: int, request: Request, rules: list[dict] = Body(..., embed=True),
               session: Session = Depends(get_session), user: User = Depends(manage)):
    m = _get(session, mapping_id)
    try:
        svc.save_draft_rules(session, m, rules, _who(user))
    except svc.MappingError as exc:
        session.rollback()
        _raise(exc)
    session.commit()
    audit.record(session, "MAPPING_DRAFT_SAVE", f"{m.code} ({len(rules)} rules)", user, request)
    return mapping_out(session, m, detail=True)


@router.delete("/{mapping_id}/draft")
def discard_draft(mapping_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    m = _get(session, mapping_id)
    draft = svc.draft_of(session, m)
    if not draft:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    if not m.active_version_id:
        raise HTTPException(status_code=409, detail="This mapping has never been published; its draft is all there is.")
    for rule in svc.rules_of(session, draft.id):
        session.delete(rule)
    session.delete(draft)
    session.commit()
    audit.record(session, "MAPPING_DRAFT_DISCARD", m.code, user, request, status="WARNING")
    return mapping_out(session, m, detail=True)


class PublishIn(BaseModel):
    notes: str = ""
    confirm_unmapped: bool = False


@router.post("/{mapping_id}/publish")
def publish(mapping_id: int, body: PublishIn, request: Request, session: Session = Depends(get_session),
            user: User = Depends(manage)):
    m = _get(session, mapping_id)
    try:
        version = svc.publish(session, m, user=_who(user), notes=body.notes, confirm_unmapped=body.confirm_unmapped)
    except svc.MappingError as exc:
        session.rollback()
        _raise(exc)
    session.commit()
    unmapped = version.total_count - version.mapped_count
    audit.record(session, "MAPPING_PUBLISH", f"{m.code} {version.label}" + (f" ({unmapped} unmapped, confirmed)" if unmapped else ""),
                 user, request, status="WARNING" if unmapped else "SUCCESS")
    return mapping_out(session, m, detail=True)


@router.get("/{mapping_id}/versions")
def versions(mapping_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """REQ-MAP-005: every published release, who published it and when."""
    _get(session, mapping_id)
    return [_version_out(session, v) for v in svc.published_versions(session, mapping_id)]


@router.get("/{mapping_id}/versions/{version_id}")
def version_detail(mapping_id: int, version_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    version = session.get(MappingVersion, version_id)
    if not version or version.mapping_id != mapping_id:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return _version_out(session, version, with_rules=True)


class CloneIn(BaseModel):
    name: str = ""


@router.post("/{mapping_id}/clone", status_code=201)
def clone(mapping_id: int, body: CloneIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    source = _get(session, mapping_id)
    try:
        copy = svc.clone(session, source, name=body.name, user=_who(user))
        session.commit()
    except Exception:
        session.rollback()  # all-or-nothing
        raise
    session.refresh(copy)
    audit.record(session, "MAPPING_CLONE", f"{source.code} → {copy.code}", user, request)
    return mapping_out(session, copy, detail=True)
