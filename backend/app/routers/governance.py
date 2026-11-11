"""Governance module API (SRS §5.7, §6.3, §10.6, §19.5).

Reads need governance.view (every role); every create/update/upload needs
governance.manage, which REQ-GOV-011 gives to Compliance only. The one
exception is §6.3 step 6: an action item's owner may update its status.
Restricted documents are visible only to members (and the chair) of their
committee and to governance managers; to anyone else they don't exist."""

import os
import re
from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.permissions import FORBIDDEN, has_cap, require_cap
from app.db import get_session
from app.models.governance import (
    ACCESS_LEVELS,
    ACTION_STATUSES,
    COMMITTEE_TYPES,
    DOCUMENT_CATEGORIES,
    MEMBER_ROLES,
    ActionItem,
    CommitteeMember,
    GovDocument,
    GovernanceCommittee,
    Meeting,
    MeetingAttendee,
)
from app.models.participant import Participant
from app.models.user import User
from app.services import audit, notify
from app.services.governance_jobs import dispatch_each, effective_status, org_time, org_today
from app.storage import get_file, put_file

router = APIRouter(prefix="/governance", tags=["Governance"])

can_view = require_cap("governance.view")
can_manage = require_cap("governance.manage")

NOT_FOUND = "The requested record could not be found."  # §20.1
TOO_LARGE = "The uploaded file exceeds the 50 MB maximum size."  # §20.1
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc / .xls container
_ZIP = b"PK\x03\x04"  # .docx / .xlsx container
# REQ-GOV-002: PDF, Word and Excel only. The signature check stops a renamed
# file of another type getting in under an allowed extension.
ALLOWED_FILES = {
    ".pdf": ("PDF", b"%PDF", "application/pdf"),
    ".doc": ("Word", _OLE, "application/msword"),
    ".docx": ("Word", _ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".xls": ("Excel", _OLE, "application/vnd.ms-excel"),
    ".xlsx": ("Excel", _ZIP, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
}
FILE_TYPES_MESSAGE = "Only PDF, Word (.doc, .docx) and Excel (.xls, .xlsx) files can be uploaded."

_EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_VERSION = re.compile(r"^v?\d{1,3}(\.\d{1,3}){0,2}$", re.IGNORECASE)


def _invalid(field: str, rule: str, message: str) -> HTTPException:
    """§20.2: a validation error names the failing field and the rule."""
    return HTTPException(status_code=422, detail=[{"field": field, "rule": rule, "message": message}])


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail=NOT_FOUND)


def _conflict(message: str) -> HTTPException:
    return HTTPException(status_code=409, detail=message)


def _utc_naive(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def _name(user: Optional[User]) -> str:
    return (user.full_name or user.email) if user else ""


class _Lookups:
    """The handful of reference tables every response joins against. The
    governance data set is small (tens of committees, hundreds of items)."""

    def __init__(self, session: Session):
        self.users = {u.id: u for u in session.exec(select(User)).all()}
        self.committees = {c.id: c for c in session.exec(select(GovernanceCommittee)).all()}
        self.participants = {p.id: p for p in session.exec(select(Participant)).all()}

    def user(self, user_id: Optional[int]) -> Optional[dict]:
        u = self.users.get(user_id) if user_id else None
        return {"id": u.id, "name": _name(u), "email": u.email, "role": u.role.value} if u else None

    def committee_name(self, committee_id: Optional[int], fallback: str = "") -> str:
        c = self.committees.get(committee_id) if committee_id else None
        return c.name if c else fallback


def _committee_ids_of(session: Session, user: User) -> set[int]:
    """Committees the user chairs or sits on."""
    chaired = session.exec(select(GovernanceCommittee.id).where(GovernanceCommittee.chair_id == user.id)).all()
    seated = session.exec(select(CommitteeMember.committee_id).where(CommitteeMember.user_id == user.id)).all()
    return set(chaired) | set(seated)


def _can_see(doc: GovDocument, user: User, member_of: set[int]) -> bool:
    return (
        doc.access_level != "Restricted"
        or has_cap(user, "governance.manage")
        or (doc.committee_id is not None and doc.committee_id in member_of)
    )


# ---- reference data -----------------------------------------------------------

@router.get("/directory")
def directory(session: Session = Depends(get_session), _: User = Depends(can_view)):
    """People and institutions governance records can point at: active
    RSwitch staff (chairs, members, owners, attendees) and participant
    institutions (representatives, institution owners)."""
    users = session.exec(select(User).where(User.is_active == True).order_by(User.full_name)).all()  # noqa: E712
    institutions = session.exec(select(Participant).order_by(Participant.name)).all()
    return {
        "users": [{"id": u.id, "name": _name(u), "email": u.email, "role": u.role.value} for u in users],
        "institutions": [
            {
                "id": p.id,
                "name": p.name,
                "code": p.code,
                "type": p.type,
                "primary_contact_name": p.primary_contact_name,
                "primary_contact_email": p.primary_contact_email,
            }
            for p in institutions
        ],
        "committee_types": list(COMMITTEE_TYPES),
        "member_roles": list(MEMBER_ROLES),
        "document_categories": list(DOCUMENT_CATEGORIES),
        "access_levels": list(ACCESS_LEVELS),
        "action_statuses": list(ACTION_STATUSES),
    }


# ---- committees & membership (REQ-GOV-001, REQ-GOV-008) ----------------------

def _member_out(m: CommitteeMember, look: _Lookups) -> dict:
    staff = look.users.get(m.user_id) if m.user_id else None
    institution = look.participants.get(m.participant_id) if m.participant_id else None
    return {
        "id": m.id,
        "committee_id": m.committee_id,
        "kind": "staff" if m.user_id else "representative",
        "user_id": m.user_id,
        "participant_id": m.participant_id,
        "institution": institution.name if institution else None,
        "name": _name(staff) if staff else m.name,
        "email": staff.email if staff else m.email,
        "staff_role": staff.role.value if staff else None,
        "role": m.role,
        "joined_on": m.joined_on,
    }


@router.get("/committees")
def list_committees(session: Session = Depends(get_session), user: User = Depends(can_view)):
    look = _Lookups(session)
    today = org_today(session)
    now = datetime.utcnow()
    member_of = _committee_ids_of(session, user)
    members = session.exec(select(CommitteeMember).order_by(CommitteeMember.id)).all()
    items = session.exec(select(ActionItem)).all()
    meetings = session.exec(select(Meeting)).all()
    docs = [d for d in session.exec(select(GovDocument).where(GovDocument.is_latest == True)).all()  # noqa: E712
            if _can_see(d, user, member_of)]
    out = []
    for c in sorted(look.committees.values(), key=lambda c: (COMMITTEE_TYPES.index(c.type) if c.type in COMMITTEE_TYPES else 9, c.name)):
        own_items = [effective_status(i, today) for i in items if i.committee_id == c.id]
        roster = [_member_out(m, look) for m in members if m.committee_id == c.id]
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "type": c.type,
                "description": c.description,
                "is_active": c.is_active,
                "created_at": c.created_at,
                "chair": look.user(c.chair_id),
                "is_member": c.id in member_of,
                "members": roster,
                "staff_count": sum(1 for m in roster if m["kind"] == "staff"),
                "representative_count": sum(1 for m in roster if m["kind"] == "representative"),
                "open_action_items": sum(1 for s in own_items if s != "Completed"),
                "overdue_action_items": sum(1 for s in own_items if s == "Overdue"),
                "upcoming_meetings": sum(1 for m in meetings if m.committee_id == c.id and m.scheduled_at >= now),
                "document_count": sum(1 for d in docs if d.committee_id == c.id),
            }
        )
    return out


class CommitteeIn(BaseModel):
    name: str
    type: str
    description: str = ""
    chair_id: Optional[int] = None


class CommitteeUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    chair_id: Optional[int] = None
    is_active: Optional[bool] = None


def _check_chair(session: Session, chair_id: Optional[int]) -> None:
    if chair_id is None:
        return
    chair = session.get(User, chair_id)
    if not chair or not chair.is_active:
        raise _invalid("chair_id", "active_user", "Choose an active RSwitch user as chair.")


def _check_committee_name(session: Session, name: str, exclude_id: Optional[int] = None) -> str:
    name = name.strip()
    if not name:
        raise _invalid("name", "required", "Give the committee a name.")
    clash = session.exec(select(GovernanceCommittee).where(func.lower(GovernanceCommittee.name) == name.lower())).first()
    if clash and clash.id != exclude_id:
        raise _conflict(f"A committee called “{clash.name}” already exists.")
    return name


@router.post("/committees", status_code=201)
def create_committee(
    body: CommitteeIn, request: Request, session: Session = Depends(get_session), user: User = Depends(can_manage)
):
    name = _check_committee_name(session, body.name)
    if body.type not in COMMITTEE_TYPES:
        raise _invalid("type", "one_of", f"Type must be one of: {', '.join(COMMITTEE_TYPES)}.")
    _check_chair(session, body.chair_id)
    committee = GovernanceCommittee(name=name, type=body.type, description=body.description.strip(), chair_id=body.chair_id)
    session.add(committee)
    session.commit()
    session.refresh(committee)
    audit.record(session, "GOV_COMMITTEE_CREATE", f"{committee.name} ({committee.type})", user, request)
    return _committee_detail(session, committee.id, user)


@router.put("/committees/{committee_id}")
def update_committee(
    committee_id: int,
    body: CommitteeUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    committee = session.get(GovernanceCommittee, committee_id)
    if not committee:
        raise _not_found()
    changes = []
    fields = body.model_fields_set
    if "name" in fields and body.name is not None and body.name.strip() != committee.name:
        new_name = _check_committee_name(session, body.name, committee.id)
        changes.append(f"name {committee.name} → {new_name}")
        committee.name = new_name
        # Keep the denormalised names on linked rows in step.
        for model in (GovDocument, Meeting, ActionItem):
            for row in session.exec(select(model).where(model.committee_id == committee.id)).all():
                row.committee = new_name
                session.add(row)
    if "type" in fields and body.type is not None and body.type != committee.type:
        if body.type not in COMMITTEE_TYPES:
            raise _invalid("type", "one_of", f"Type must be one of: {', '.join(COMMITTEE_TYPES)}.")
        changes.append(f"type {committee.type} → {body.type}")
        committee.type = body.type
    if "description" in fields and body.description is not None:
        committee.description = body.description.strip()
        changes.append("description")
    if "chair_id" in fields and body.chair_id != committee.chair_id:
        _check_chair(session, body.chair_id)
        old, new = session.get(User, committee.chair_id) if committee.chair_id else None, session.get(User, body.chair_id) if body.chair_id else None
        changes.append(f"chair {_name(old) or 'none'} → {_name(new) or 'none'}")
        committee.chair_id = body.chair_id
    if "is_active" in fields and body.is_active is not None and body.is_active != committee.is_active:
        committee.is_active = body.is_active
        changes.append("reactivated" if body.is_active else "deactivated")
    session.add(committee)
    session.commit()
    if changes:
        audit.record(session, "GOV_COMMITTEE_UPDATE", f"{committee.name}: {'; '.join(changes)}", user, request)
    return _committee_detail(session, committee.id, user)


@router.delete("/committees/{committee_id}")
def delete_committee(
    committee_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(can_manage)
):
    """Only an empty committee can be deleted; one with history is
    deactivated instead so its records stay intact."""
    committee = session.get(GovernanceCommittee, committee_id)
    if not committee:
        raise _not_found()
    for model in (Meeting, GovDocument, ActionItem):
        if session.exec(select(model.id).where(model.committee_id == committee_id)).first() is not None:
            raise _conflict("This committee has meetings, documents or action items. Deactivate it instead.")
    for member in session.exec(select(CommitteeMember).where(CommitteeMember.committee_id == committee_id)).all():
        session.delete(member)
    session.delete(committee)
    session.commit()
    audit.record(session, "GOV_COMMITTEE_DELETE", committee.name, user, request)
    return {"deleted": committee_id}


def _committee_detail(session: Session, committee_id: int, user: User) -> dict:
    return next(c for c in list_committees(session, user) if c["id"] == committee_id)


class MemberIn(BaseModel):
    user_id: Optional[int] = None
    participant_id: Optional[int] = None
    name: str = ""
    email: str = ""
    role: str = "Member"


class MemberUpdate(BaseModel):
    role: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    participant_id: Optional[int] = None


def _check_representative(session: Session, participant_id: Optional[int], name: str, email: str) -> None:
    if not participant_id or not session.get(Participant, participant_id):
        raise _invalid("participant_id", "required", "Choose the institution this representative belongs to.")
    if not name.strip():
        raise _invalid("name", "required", "Enter the representative's name.")
    if not _EMAIL.match(email.strip()):
        raise _invalid("email", "email", "Enter a valid email address (e.g. name@institution.rw).")


@router.post("/committees/{committee_id}/members", status_code=201)
def add_member(
    committee_id: int,
    body: MemberIn,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    committee = session.get(GovernanceCommittee, committee_id)
    if not committee:
        raise _not_found()
    if body.role not in MEMBER_ROLES:
        raise _invalid("role", "one_of", f"Role must be one of: {', '.join(MEMBER_ROLES)}.")
    existing = session.exec(select(CommitteeMember).where(CommitteeMember.committee_id == committee_id)).all()
    if body.user_id is not None:
        staff = session.get(User, body.user_id)
        if not staff or not staff.is_active:
            raise _invalid("user_id", "active_user", "Choose an active RSwitch user.")
        if committee.chair_id == staff.id:
            raise _conflict(f"{_name(staff)} already chairs {committee.name}.")
        if any(m.user_id == staff.id for m in existing):
            raise _conflict(f"{_name(staff)} is already a member of {committee.name}.")
        member = CommitteeMember(committee_id=committee_id, user_id=staff.id, role=body.role)
        label = f"{_name(staff)} (RSwitch)"
    else:
        _check_representative(session, body.participant_id, body.name, body.email)
        email = body.email.strip().lower()
        if any(m.email.lower() == email for m in existing if not m.user_id):
            raise _conflict(f"{email} is already a member of {committee.name}.")
        member = CommitteeMember(
            committee_id=committee_id, participant_id=body.participant_id, name=body.name.strip(), email=email, role=body.role
        )
        label = f"{member.name} ({session.get(Participant, body.participant_id).name})"
    session.add(member)
    session.commit()
    session.refresh(member)
    audit.record(session, "GOV_MEMBER_ADD", f"{committee.name}: {label} as {member.role}", user, request)
    return _member_out(member, _Lookups(session))


@router.put("/committees/{committee_id}/members/{member_id}")
def update_member(
    committee_id: int,
    member_id: int,
    body: MemberUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    member = session.get(CommitteeMember, member_id)
    if not member or member.committee_id != committee_id:
        raise _not_found()
    fields = body.model_fields_set
    if "role" in fields and body.role is not None:
        if body.role not in MEMBER_ROLES:
            raise _invalid("role", "one_of", f"Role must be one of: {', '.join(MEMBER_ROLES)}.")
        member.role = body.role
    if not member.user_id and fields & {"name", "email", "participant_id"}:
        name = body.name if body.name is not None else member.name
        email = body.email if body.email is not None else member.email
        participant_id = body.participant_id if body.participant_id is not None else member.participant_id
        _check_representative(session, participant_id, name, email)
        member.name, member.email, member.participant_id = name.strip(), email.strip().lower(), participant_id
    session.add(member)
    session.commit()
    session.refresh(member)
    look = _Lookups(session)
    out = _member_out(member, look)
    audit.record(session, "GOV_MEMBER_UPDATE", f"{look.committee_name(committee_id)}: {out['name']} ({member.role})", user, request)
    return out


@router.delete("/committees/{committee_id}/members/{member_id}")
def remove_member(
    committee_id: int,
    member_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    member = session.get(CommitteeMember, member_id)
    if not member or member.committee_id != committee_id:
        raise _not_found()
    look = _Lookups(session)
    label = _member_out(member, look)["name"]
    session.delete(member)
    session.commit()
    audit.record(session, "GOV_MEMBER_REMOVE", f"{look.committee_name(committee_id)}: {label}", user, request)
    return {"deleted": member_id}


# ---- documents (REQ-GOV-002, REQ-GOV-003, §10.6) -------------------------------

def _doc_out(d: GovDocument, look: _Lookups, meetings: dict[int, Meeting]) -> dict:
    meeting = meetings.get(d.meeting_id) if d.meeting_id else None
    return {
        "id": d.id,
        "series_id": d.series_id or d.id,
        "title": d.title,
        "category": d.category,
        "committee_id": d.committee_id,
        "committee": look.committee_name(d.committee_id, d.committee),
        "version": d.version,
        "is_latest": d.is_latest,
        "access_level": d.access_level,
        "filename": d.filename,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "uploaded_by": _name(look.users.get(d.uploaded_by_id)) or d.uploaded_by,
        "uploaded_by_id": d.uploaded_by_id,
        "uploaded_at": d.uploaded_at,
        "meeting_id": d.meeting_id,
        "meeting_title": meeting.title if meeting else None,
    }


def _visible_documents(session: Session, user: User) -> list[GovDocument]:
    member_of = _committee_ids_of(session, user)
    return [d for d in session.exec(select(GovDocument)).all() if _can_see(d, user, member_of)]


@router.get("/documents")
def list_documents(
    committee_id: Optional[int] = None,
    category: Optional[str] = None,
    meeting_id: Optional[int] = None,
    access_level: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(can_view),
):
    """Latest version of each document the user may see, newest first, with
    its earlier versions under `versions`."""
    look = _Lookups(session)
    meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
    series: dict[int, list[GovDocument]] = {}
    for d in _visible_documents(session, user):
        series.setdefault(d.series_id or d.id, []).append(d)
    out = []
    for versions in series.values():
        versions.sort(key=lambda d: (d.uploaded_at, d.id), reverse=True)
        latest = next((d for d in versions if d.is_latest), versions[0])
        if committee_id is not None and latest.committee_id != committee_id:
            continue
        if category and latest.category != category:
            continue
        if meeting_id is not None and latest.meeting_id != meeting_id:
            continue
        if access_level and latest.access_level != access_level:
            continue
        out.append(
            {**_doc_out(latest, look, meetings), "versions": [_doc_out(v, look, meetings) for v in versions if v.id != latest.id]}
        )
    out.sort(key=lambda d: d["uploaded_at"], reverse=True)
    return out


async def _read_upload(file: UploadFile) -> tuple[bytes, str, str]:
    """REQ-GOV-002 file rules. Returns (content, safe filename, mime type)."""
    filename = os.path.basename((file.filename or "").replace("\\", "/")).strip()
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_FILES:
        raise _invalid("file", "allowed_types", FILE_TYPES_MESSAGE)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=TOO_LARGE)
    if not data:
        raise _invalid("file", "not_empty", "The file is empty.")
    label, signature, mime = ALLOWED_FILES[ext]
    if not data.startswith(signature):
        raise _invalid(
            "file", "content_matches_type",
            f"This file isn't a valid {label} document (its contents don't match the {ext} extension). " + FILE_TYPES_MESSAGE,
        )
    safe = re.sub(r"[^A-Za-z0-9._ ()-]", "_", filename)[:180]
    return data, safe, mime


def _normalise_version(value: str) -> str:
    value = (value or "").strip()
    if not _VERSION.match(value):
        raise _invalid("version", "format", "Enter a version like v1.0 or v2.1.")
    return "v" + value.lstrip("vV")


def _check_meeting_link(session: Session, meeting_id: Optional[int], committee_id: Optional[int]) -> Optional[Meeting]:
    if meeting_id is None:
        return None
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise _invalid("meeting_id", "exists", "That meeting doesn't exist.")
    if committee_id is not None and meeting.committee_id != committee_id:
        raise _invalid("meeting_id", "same_committee", "The meeting belongs to a different committee.")
    return meeting


@router.post("/documents", status_code=201)
async def upload_document(
    request: Request,
    title: str = Form(...),
    category: str = Form(...),
    committee_id: int = Form(...),
    version: str = Form("v1.0"),
    access_level: str = Form("Internal"),
    meeting_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    if not title.strip():
        raise _invalid("title", "required", "Give the document a title.")
    if category not in DOCUMENT_CATEGORIES:
        raise _invalid("category", "one_of", f"Category must be one of: {', '.join(DOCUMENT_CATEGORIES)}.")
    if access_level not in ACCESS_LEVELS:
        raise _invalid("access_level", "one_of", "Access level must be Internal or Restricted.")
    committee = session.get(GovernanceCommittee, committee_id)
    if not committee:
        raise _invalid("committee_id", "exists", "Choose the committee or working group this document belongs to.")
    version = _normalise_version(version)
    meeting = _check_meeting_link(session, meeting_id, committee.id)
    data, filename, mime = await _read_upload(file)

    key = f"governance/{uuid4()}-{filename}"
    put_file(key, data, mime)
    doc = GovDocument(
        title=title.strip(),
        category=category,
        committee=committee.name,
        committee_id=committee.id,
        version=version,
        access_level=access_level,
        filename=filename,
        storage_key=key,
        content_type=mime,
        size_bytes=len(data),
        uploaded_by=_name(user),
        uploaded_by_id=user.id,
        meeting_id=meeting.id if meeting else None,
    )
    session.add(doc)
    session.flush()
    doc.series_id = doc.id
    # §6.3 step 2: minutes uploaded after a meeting are linked to its record.
    if meeting and category == "Minutes":
        meeting.minutes_document_id = doc.id
        meeting.updated_at = datetime.utcnow()
        session.add(meeting)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    audit.record(
        session, "GOV_DOCUMENT_UPLOAD",
        f"{doc.title} {doc.version} ({doc.category}, {committee.name}, {doc.access_level})"
        + (f" for meeting #{meeting.id}" if meeting else ""),
        user, request,
    )
    return _doc_out(doc, _Lookups(session), {meeting.id: meeting} if meeting else {})


@router.post("/documents/{doc_id}/versions", status_code=201)
async def upload_version(
    doc_id: int,
    request: Request,
    version: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    """A new version of an existing document. Earlier versions stay
    downloadable; the new one inherits the series' metadata."""
    base = session.get(GovDocument, doc_id)
    if not base:
        raise _not_found()
    series_id = base.series_id or base.id
    versions = session.exec(select(GovDocument).where(GovDocument.series_id == series_id)).all() or [base]
    version = _normalise_version(version)
    if any(v.version.lower() == version.lower() for v in versions):
        raise _conflict(f"{base.title} already has a version {version}.")
    data, filename, mime = await _read_upload(file)
    latest = next((v for v in versions if v.is_latest), base)

    key = f"governance/{uuid4()}-{filename}"
    put_file(key, data, mime)
    doc = GovDocument(
        title=latest.title,
        category=latest.category,
        committee=latest.committee,
        committee_id=latest.committee_id,
        version=version,
        access_level=latest.access_level,
        filename=filename,
        storage_key=key,
        content_type=mime,
        size_bytes=len(data),
        uploaded_by=_name(user),
        uploaded_by_id=user.id,
        meeting_id=latest.meeting_id,
        series_id=series_id,
    )
    for v in versions:
        v.series_id = series_id
        v.is_latest = False
        session.add(v)
    session.add(doc)
    session.flush()
    # Keep a meeting's minutes pointer on the newest version.
    for meeting in session.exec(
        select(Meeting).where(Meeting.minutes_document_id.in_([v.id for v in versions]))
    ).all():
        meeting.minutes_document_id = doc.id
        session.add(meeting)
    session.commit()
    session.refresh(doc)
    audit.record(session, "GOV_DOCUMENT_VERSION_UPLOAD", f"{doc.title} {latest.version} → {doc.version}", user, request)
    meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
    return _doc_out(doc, _Lookups(session), meetings)


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    access_level: Optional[str] = None
    committee_id: Optional[int] = None


@router.patch("/documents/{doc_id}")
def update_document(
    doc_id: int,
    body: DocumentUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    """Metadata applies to the whole document, so every version changes
    together — an older version can't stay Internal once the document is
    Restricted."""
    base = session.get(GovDocument, doc_id)
    if not base:
        raise _not_found()
    versions = session.exec(select(GovDocument).where(GovDocument.series_id == (base.series_id or base.id))).all() or [base]
    changes = []
    if body.title is not None and body.title.strip() and body.title.strip() != base.title:
        changes.append(f"title → {body.title.strip()}")
    if body.category is not None and body.category != base.category:
        if body.category not in DOCUMENT_CATEGORIES:
            raise _invalid("category", "one_of", f"Category must be one of: {', '.join(DOCUMENT_CATEGORIES)}.")
        changes.append(f"category {base.category} → {body.category}")
    if body.access_level is not None and body.access_level != base.access_level:
        if body.access_level not in ACCESS_LEVELS:
            raise _invalid("access_level", "one_of", "Access level must be Internal or Restricted.")
        changes.append(f"access {base.access_level} → {body.access_level}")
    committee = None
    if body.committee_id is not None and body.committee_id != base.committee_id:
        committee = session.get(GovernanceCommittee, body.committee_id)
        if not committee:
            raise _invalid("committee_id", "exists", "Choose an existing committee or working group.")
        if base.meeting_id:
            raise _invalid("committee_id", "linked_to_meeting", "This document belongs to a meeting; it stays with that meeting's committee.")
        changes.append(f"committee → {committee.name}")
    for v in versions:
        if body.title is not None and body.title.strip():
            v.title = body.title.strip()
        if body.category is not None:
            v.category = body.category
        if body.access_level is not None:
            v.access_level = body.access_level
        if committee:
            v.committee_id, v.committee = committee.id, committee.name
        session.add(v)
    session.commit()
    if changes:
        audit.record(session, "GOV_DOCUMENT_UPDATE", f"{base.title}: {'; '.join(changes)}", user, request)
    session.refresh(base)
    meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
    return _doc_out(base, _Lookups(session), meetings)


@router.get("/documents/{doc_id}/download")
def download_document(
    doc_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(can_view)
):
    doc = session.get(GovDocument, doc_id)
    # A Restricted document the user may not see answers exactly like a
    # missing one.
    if not doc or not doc.storage_key or not _can_see(doc, user, _committee_ids_of(session, user)):
        raise _not_found()
    if doc.access_level == "Restricted":
        audit.record(session, "GOV_DOCUMENT_DOWNLOAD", f"{doc.title} {doc.version} (Restricted)", user, request)
    ascii_name = doc.filename.encode("ascii", "replace").decode().replace('"', "_") or "document"
    return Response(
        content=get_file(doc.storage_key),
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(doc.filename)}"},
    )


# ---- meetings (REQ-GOV-004, REQ-GOV-005, §6.3) --------------------------------

def _meeting_out(
    m: Meeting,
    look: _Lookups,
    attendees: list[MeetingAttendee],
    visible_docs: list[GovDocument],
    items: list[ActionItem],
    today: date,
    now: datetime,
) -> dict:
    minutes = next((d for d in visible_docs if d.id == m.minutes_document_id), None)
    statuses = [effective_status(i, today) for i in items]
    return {
        "id": m.id,
        "title": m.title,
        "committee_id": m.committee_id,
        "committee": look.committee_name(m.committee_id, m.committee),
        "scheduled_at": m.scheduled_at,
        "duration_minutes": m.duration_minutes,
        "location": m.location,
        "agenda": m.agenda,
        "decisions": list(m.decisions or []),
        "attendees": [
            {
                "id": a.id,
                "user_id": a.user_id,
                "member_id": a.member_id,
                "kind": "staff" if a.user_id else "representative",
                "name": _name(look.users.get(a.user_id)) or a.name,
                "email": look.users[a.user_id].email if a.user_id in look.users else a.email,
            }
            for a in attendees
        ],
        "status": "Upcoming" if m.scheduled_at >= now else "Past",
        # A Restricted minutes document the user can't see is left out.
        "minutes": {"id": minutes.id, "title": minutes.title, "version": minutes.version, "filename": minutes.filename,
                    "access_level": minutes.access_level} if minutes else None,
        "document_count": sum(1 for d in visible_docs if d.meeting_id == m.id and d.is_latest),
        "action_items": {
            "total": len(statuses),
            "open": sum(1 for s in statuses if s in ("Open", "In Progress")),
            "overdue": sum(1 for s in statuses if s == "Overdue"),
            "completed": sum(1 for s in statuses if s == "Completed"),
        },
        "created_by": _name(look.users.get(m.created_by_id)) or m.created_by,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
    }


def _meetings_out(session: Session, user: User, meetings: list[Meeting]) -> list[dict]:
    look = _Lookups(session)
    ids = [m.id for m in meetings]
    attendees = session.exec(select(MeetingAttendee).where(MeetingAttendee.meeting_id.in_(ids))).all() if ids else []
    items = session.exec(select(ActionItem).where(ActionItem.meeting_id.in_(ids))).all() if ids else []
    docs = _visible_documents(session, user)
    today, now = org_today(session), datetime.utcnow()
    return [
        _meeting_out(
            m, look, [a for a in attendees if a.meeting_id == m.id], docs, [i for i in items if i.meeting_id == m.id], today, now
        )
        for m in meetings
    ]


@router.get("/meetings")
def list_meetings(
    committee_id: Optional[int] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    session: Session = Depends(get_session),
    user: User = Depends(can_view),
):
    """The Meeting Calendar (REQ-GOV-004): every committee's meetings, oldest
    first; start/end (inclusive dates, UTC) narrow it to a calendar range."""
    query = select(Meeting).order_by(Meeting.scheduled_at)
    if committee_id is not None:
        query = query.where(Meeting.committee_id == committee_id)
    if start:
        query = query.where(Meeting.scheduled_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.where(Meeting.scheduled_at <= datetime.combine(end, datetime.max.time()))
    return _meetings_out(session, user, list(session.exec(query).all()))


@router.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: int, session: Session = Depends(get_session), user: User = Depends(can_view)):
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise _not_found()
    out = _meetings_out(session, user, [meeting])[0]
    look = _Lookups(session)
    meetings = {meeting.id: meeting}
    out["documents"] = [
        _doc_out(d, look, meetings)
        for d in sorted(_visible_documents(session, user), key=lambda d: d.uploaded_at, reverse=True)
        if d.meeting_id == meeting.id and d.is_latest
    ]
    today = org_today(session)
    out["action_item_list"] = [
        _action_out(i, look, today, user, meetings)
        for i in session.exec(select(ActionItem).where(ActionItem.meeting_id == meeting.id).order_by(ActionItem.due_date)).all()
    ]
    return out


class MeetingIn(BaseModel):
    title: str = ""
    committee_id: int
    scheduled_at: datetime
    duration_minutes: int = 60
    location: str = ""
    agenda: str
    attendee_user_ids: list[int] = []
    attendee_member_ids: list[int] = []


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    agenda: Optional[str] = None
    decisions: Optional[list[str]] = None
    attendee_user_ids: Optional[list[int]] = None
    attendee_member_ids: Optional[list[int]] = None
    minutes_document_id: Optional[int] = None


def _resolve_attendees(
    session: Session,
    committee_id: int,
    user_ids: list[int],
    member_ids: list[int],
    current: Optional[list[MeetingAttendee]] = None,
) -> list[MeetingAttendee]:
    """Attendees are picked from RSwitch users and the committee's members. A
    staff member picked either way is one attendee. People already on the
    record stay valid even if they have since left the committee or been
    deactivated, so editing an old meeting doesn't fail."""
    people: dict[str, MeetingAttendee] = {}
    kept_members = {a.member_id: a for a in current or [] if a.member_id and not a.user_id}
    kept_users = {a.user_id for a in current or [] if a.user_id}
    members = {m.id: m for m in session.exec(select(CommitteeMember).where(CommitteeMember.committee_id == committee_id)).all()}
    for member_id in member_ids:
        member = members.get(member_id)
        if member and member.user_id:
            user_ids = [*user_ids, member.user_id]
        elif member:
            people[f"m{member.id}"] = MeetingAttendee(member_id=member.id, name=member.name, email=member.email)
        elif member_id in kept_members:
            old = kept_members[member_id]
            people[f"m{member_id}"] = MeetingAttendee(member_id=member_id, name=old.name, email=old.email)
        else:
            raise _invalid("attendee_member_ids", "committee_member", "Attendees must be members of this committee.")
    for user_id in user_ids:
        staff = session.get(User, user_id)
        if not staff or not (staff.is_active or user_id in kept_users):
            raise _invalid("attendee_user_ids", "active_user", "Attendees must be active RSwitch users.")
        people[f"u{staff.id}"] = MeetingAttendee(user_id=staff.id, name=_name(staff), email=staff.email)
    return list(people.values())


def _attendee_keys(rows: list[MeetingAttendee]) -> set[tuple]:
    return {(a.user_id, None if a.user_id else a.member_id) for a in rows}


def _invite(session: Session, meeting: Meeting, committee_name: str) -> int:
    """§6.3 step 1 "invites notified" (meeting_scheduled). Keyed on the
    meeting and its time, so each invitee hears once per schedule and a
    reschedule notifies everyone again. Past meetings being recorded after
    the fact send nothing."""
    if meeting.scheduled_at < datetime.utcnow():
        return 0
    attendees = session.exec(select(MeetingAttendee).where(MeetingAttendee.meeting_id == meeting.id)).all()
    recipients: list[notify.Recipient] = []
    for a in attendees:
        staff = session.get(User, a.user_id) if a.user_id else None
        recipients.append(staff if staff else a.email)
    when = org_time(session, meeting.scheduled_at)
    where = f" — {meeting.location}" if meeting.location else ""
    agenda = meeting.agenda.strip()
    return dispatch_each(
        session,
        "meeting_scheduled",
        recipients,
        title=f"Meeting scheduled: {meeting.title}",
        message=f"{committee_name}: {meeting.title} on {when}{where}.",
        link="/governance",
        dedupe_key=f"gov-meeting:{meeting.id}:invite:{meeting.scheduled_at.isoformat()}",
        email_body=(
            f"You are invited to the {committee_name} meeting “{meeting.title}”.\n\n"
            f"When: {when} ({meeting.duration_minutes} minutes)\n"
            + (f"Where: {meeting.location}\n" if meeting.location else "")
            + (f"\nAgenda:\n{agenda}\n" if agenda else "")
            + "\n— RSwitch Data Intelligence Platform"
        ),
    )


def _check_duration(minutes: int) -> None:
    if not 15 <= minutes <= 600:
        raise _invalid("duration_minutes", "range", "Duration must be between 15 minutes and 10 hours.")


@router.post("/meetings", status_code=201)
def create_meeting(
    body: MeetingIn, request: Request, session: Session = Depends(get_session), user: User = Depends(can_manage)
):
    committee = session.get(GovernanceCommittee, body.committee_id)
    if not committee or not committee.is_active:
        raise _invalid("committee_id", "active_committee", "Choose an active committee or working group.")
    if not body.agenda.strip():
        raise _invalid("agenda", "required", "Set out the agenda for the meeting.")
    _check_duration(body.duration_minutes)
    attendees = _resolve_attendees(session, committee.id, body.attendee_user_ids, body.attendee_member_ids)
    if not attendees:
        raise _invalid("attendees", "required", "Choose at least one attendee.")
    meeting = Meeting(
        title=body.title.strip() or f"{committee.name} meeting",
        committee=committee.name,
        committee_id=committee.id,
        scheduled_at=_utc_naive(body.scheduled_at),
        duration_minutes=body.duration_minutes,
        location=body.location.strip(),
        agenda=body.agenda.strip(),
        attendees_count=len(attendees),
        created_by=_name(user),
        created_by_id=user.id,
    )
    session.add(meeting)
    session.flush()
    for a in attendees:
        a.meeting_id = meeting.id
        session.add(a)
    session.commit()
    session.refresh(meeting)
    audit.record(
        session, "GOV_MEETING_CREATE",
        f"{committee.name}: {meeting.title} at {meeting.scheduled_at.isoformat()} UTC, {len(attendees)} attendees",
        user, request,
    )
    _invite(session, meeting, committee.name)
    return _meetings_out(session, user, [meeting])[0]


@router.put("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: int,
    body: MeetingUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_manage),
):
    """§19.5: add minutes, decisions, attendees or agenda, or reschedule."""
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise _not_found()
    fields = body.model_fields_set
    changes: list[str] = []
    if "title" in fields and body.title is not None and body.title.strip() and body.title.strip() != meeting.title:
        meeting.title = body.title.strip()
        changes.append("title")
    if "scheduled_at" in fields and body.scheduled_at is not None and _utc_naive(body.scheduled_at) != meeting.scheduled_at:
        meeting.scheduled_at = _utc_naive(body.scheduled_at)
        changes.append(f"rescheduled to {meeting.scheduled_at.isoformat()} UTC")
    if "duration_minutes" in fields and body.duration_minutes is not None:
        _check_duration(body.duration_minutes)
        meeting.duration_minutes = body.duration_minutes
    if "location" in fields and body.location is not None:
        meeting.location = body.location.strip()
    if "agenda" in fields and body.agenda is not None:
        if not body.agenda.strip():
            raise _invalid("agenda", "required", "The agenda can't be empty.")
        if body.agenda.strip() != meeting.agenda:
            meeting.agenda = body.agenda.strip()
            changes.append("agenda")
    if "decisions" in fields and body.decisions is not None:
        decisions = [d.strip() for d in body.decisions if d and d.strip()]
        if any(len(d) > 2000 for d in decisions):
            raise _invalid("decisions", "max_length", "Each decision must be 2,000 characters or fewer.")
        if decisions != list(meeting.decisions or []):
            meeting.decisions = decisions
            meeting.decisions_count = len(decisions)
            changes.append(f"{len(decisions)} decision(s) recorded")
    if fields & {"attendee_user_ids", "attendee_member_ids"}:
        current = session.exec(select(MeetingAttendee).where(MeetingAttendee.meeting_id == meeting.id)).all()
        user_ids = body.attendee_user_ids if body.attendee_user_ids is not None else [a.user_id for a in current if a.user_id]
        member_ids = body.attendee_member_ids if body.attendee_member_ids is not None else [a.member_id for a in current if a.member_id and not a.user_id]
        attendees = _resolve_attendees(session, meeting.committee_id, user_ids, member_ids, current)
        if not attendees:
            raise _invalid("attendees", "required", "A meeting needs at least one attendee.")
        if _attendee_keys(attendees) != _attendee_keys(current):
            for a in current:
                session.delete(a)
            for a in attendees:
                a.meeting_id = meeting.id
                session.add(a)
            meeting.attendees_count = len(attendees)
            changes.append(f"attendees ({len(attendees)})")
    if "minutes_document_id" in fields:
        if body.minutes_document_id is None:
            if meeting.minutes_document_id:
                changes.append("minutes unlinked")
            meeting.minutes_document_id = None
        elif body.minutes_document_id != meeting.minutes_document_id:
            doc = session.get(GovDocument, body.minutes_document_id)
            if not doc or doc.category != "Minutes":
                raise _invalid("minutes_document_id", "minutes_document", "Choose a document in the Minutes category.")
            if doc.committee_id != meeting.committee_id:
                raise _invalid("minutes_document_id", "same_committee", "The minutes belong to a different committee.")
            if doc.meeting_id not in (None, meeting.id):
                raise _invalid("minutes_document_id", "unlinked", "Those minutes are already linked to another meeting.")
            for v in session.exec(select(GovDocument).where(GovDocument.series_id == (doc.series_id or doc.id))).all():
                v.meeting_id = meeting.id
                session.add(v)
            meeting.minutes_document_id = doc.id
            changes.append(f"minutes linked ({doc.title} {doc.version})")
    meeting.updated_at = datetime.utcnow()
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    if changes:
        audit.record(session, "GOV_MEETING_UPDATE", f"{meeting.title}: {'; '.join(changes)}", user, request)
    if fields & {"attendee_user_ids", "attendee_member_ids", "scheduled_at"}:
        _invite(session, meeting, _Lookups(session).committee_name(meeting.committee_id, meeting.committee))
    return _meetings_out(session, user, [meeting])[0]


# ---- action items (REQ-GOV-006/007, §9.4) ---------------------------------------

def _action_out(item: ActionItem, look: _Lookups, today: date, user: User, meetings: dict[int, Meeting]) -> dict:
    status = effective_status(item, today)
    if item.owner_user_id:
        u = look.users.get(item.owner_user_id)
        owner = {"type": "user", "id": item.owner_user_id, "name": _name(u) or item.owner, "email": u.email if u else ""}
    elif item.owner_participant_id:
        p = look.participants.get(item.owner_participant_id)
        owner = {"type": "institution", "id": item.owner_participant_id, "name": p.name if p else item.owner,
                 "email": p.primary_contact_email if p else ""}
    else:
        owner = {"type": "unlinked", "id": None, "name": item.owner, "email": ""}
    meeting = meetings.get(item.meeting_id) if item.meeting_id else None
    committee = look.committees.get(item.committee_id) if item.committee_id else None
    return {
        "id": item.id,
        "description": item.description,
        "owner": owner,
        "committee_id": item.committee_id,
        "committee": committee.name if committee else item.committee,
        "committee_type": committee.type if committee else None,
        "chair": look.user(committee.chair_id) if committee else None,
        "meeting_id": item.meeting_id,
        "meeting_title": meeting.title if meeting else None,
        "due_date": item.due_date,
        "days_until_due": (item.due_date - today).days,
        "status": status,
        "started_at": item.started_at,
        "completed_at": item.completed_at,
        "completed_by": item.completed_by,
        "created_by": item.created_by,
        "created_at": item.created_at,
        # §6.3 step 6: the owner marks it complete; managers can always.
        "can_update_status": has_cap(user, "governance.manage") or (item.owner_user_id is not None and item.owner_user_id == user.id),
    }


@router.get("/action-items")
def list_action_items(
    committee_id: Optional[int] = None,
    meeting_id: Optional[int] = None,
    status: Optional[str] = None,
    mine: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(can_view),
):
    look = _Lookups(session)
    today = org_today(session)
    meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
    query = select(ActionItem).order_by(ActionItem.due_date, ActionItem.id)
    if committee_id is not None:
        query = query.where(ActionItem.committee_id == committee_id)
    if meeting_id is not None:
        query = query.where(ActionItem.meeting_id == meeting_id)
    if mine:
        query = query.where(ActionItem.owner_user_id == user.id)
    out = [_action_out(i, look, today, user, meetings) for i in session.exec(query).all()]
    return [a for a in out if not status or a["status"] == status]


@router.get("/action-items/overdue")
def overdue_action_items(session: Session = Depends(get_session), user: User = Depends(can_view)):
    """REQ-GOV-007: overdue action items grouped by committee or working
    group, the most overdue groups first."""
    groups: dict[Optional[int], dict] = {}
    for item in list_action_items(status="Overdue", session=session, user=user):
        group = groups.setdefault(
            item["committee_id"],
            {"committee_id": item["committee_id"], "committee": item["committee"], "committee_type": item["committee_type"],
             "chair": item["chair"], "count": 0, "max_days_overdue": 0, "items": []},
        )
        group["items"].append(item)
        group["count"] += 1
        group["max_days_overdue"] = max(group["max_days_overdue"], -item["days_until_due"])
    for group in groups.values():
        group["items"].sort(key=lambda i: i["days_until_due"])
    return sorted(groups.values(), key=lambda g: (-g["count"], -g["max_days_overdue"], g["committee"]))


class ActionItemIn(BaseModel):
    description: str
    committee_id: int
    meeting_id: Optional[int] = None
    owner_user_id: Optional[int] = None
    owner_participant_id: Optional[int] = None
    due_date: date


class ActionItemUpdate(BaseModel):
    status: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    owner_user_id: Optional[int] = None
    owner_participant_id: Optional[int] = None
    meeting_id: Optional[int] = None


def _resolve_owner(session: Session, user_id: Optional[int], participant_id: Optional[int]) -> tuple[Optional[int], Optional[int], str]:
    """REQ-GOV-006: the owner is an RSwitch user or an institution — exactly one."""
    if (user_id is None) == (participant_id is None):
        raise _invalid("owner", "exactly_one", "Assign the action item to one RSwitch user or one institution.")
    if user_id is not None:
        owner = session.get(User, user_id)
        if not owner or not owner.is_active:
            raise _invalid("owner_user_id", "active_user", "Choose an active RSwitch user.")
        return owner.id, None, _name(owner)
    institution = session.get(Participant, participant_id)
    if not institution:
        raise _invalid("owner_participant_id", "exists", "Choose an existing institution.")
    return None, institution.id, institution.name


def _check_due(due: date, today: date) -> None:
    if due < today:
        raise _invalid("due_date", "not_past", "Choose a due date that is today or later.")


@router.post("/action-items", status_code=201)
def create_action_item(
    body: ActionItemIn, request: Request, session: Session = Depends(get_session), user: User = Depends(can_manage)
):
    """§6.3 step 3: action items recorded with owners and due dates."""
    if not body.description.strip():
        raise _invalid("description", "required", "Describe the action to be taken.")
    committee = session.get(GovernanceCommittee, body.committee_id)
    if not committee:
        raise _invalid("committee_id", "exists", "Choose the committee or working group this action belongs to.")
    today = org_today(session)
    _check_due(body.due_date, today)
    meeting = _check_meeting_link(session, body.meeting_id, committee.id)
    owner_user_id, owner_participant_id, owner_name = _resolve_owner(session, body.owner_user_id, body.owner_participant_id)
    item = ActionItem(
        description=body.description.strip(),
        owner=owner_name,
        owner_user_id=owner_user_id,
        owner_participant_id=owner_participant_id,
        committee=committee.name,
        committee_id=committee.id,
        meeting_id=meeting.id if meeting else None,
        due_date=body.due_date,
        status="Open",
        created_by=_name(user),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    audit.record(
        session, "GOV_ACTION_ITEM_CREATE",
        f"#{item.id} {item.description} — owner {owner_name}, due {item.due_date} ({committee.name})", user, request,
    )
    meetings = {meeting.id: meeting} if meeting else {}
    return _action_out(item, _Lookups(session), today, user, meetings)


@router.put("/action-items/{item_id}")
def update_action_item(
    item_id: int,
    body: ActionItemUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(can_view),
):
    """§19.5 "update action item status". Governance managers may change
    anything; the assigned owner (an RSwitch user) may change only the
    status (§6.3 step 6); everyone else is read-only."""
    item = session.get(ActionItem, item_id)
    if not item:
        raise _not_found()
    fields = body.model_fields_set
    manager = has_cap(user, "governance.manage")
    is_owner = item.owner_user_id is not None and item.owner_user_id == user.id
    if not manager and not (is_owner and fields <= {"status"}):
        raise HTTPException(status_code=403, detail=FORBIDDEN)

    today = org_today(session)
    before = effective_status(item, today)
    changes: list[str] = []
    if "description" in fields and body.description is not None:
        if not body.description.strip():
            raise _invalid("description", "required", "Describe the action to be taken.")
        if body.description.strip() != item.description:
            item.description = body.description.strip()
            changes.append("description")
    if "due_date" in fields and body.due_date is not None and body.due_date != item.due_date:
        _check_due(body.due_date, today)
        changes.append(f"due {item.due_date} → {body.due_date}")
        item.due_date = body.due_date
    if fields & {"owner_user_id", "owner_participant_id"}:
        owner_user_id, owner_participant_id, owner_name = _resolve_owner(session, body.owner_user_id, body.owner_participant_id)
        if (owner_user_id, owner_participant_id) != (item.owner_user_id, item.owner_participant_id):
            changes.append(f"owner {item.owner} → {owner_name}")
            item.owner_user_id, item.owner_participant_id, item.owner = owner_user_id, owner_participant_id, owner_name
    if "meeting_id" in fields and body.meeting_id != item.meeting_id:
        meeting = _check_meeting_link(session, body.meeting_id, item.committee_id)
        item.meeting_id = meeting.id if meeting else None
        changes.append("meeting link")
    if "status" in fields and body.status is not None:
        if body.status == "Overdue":
            raise _invalid("status", "system_managed", "Overdue is set automatically once the due date passes.")
        if body.status not in ACTION_STATUSES:
            raise _invalid("status", "one_of", "Status must be Open, In Progress or Completed.")
        now = datetime.utcnow()
        if body.status == "Completed":
            if item.status != "Completed":
                item.completed_at, item.completed_by = now, _name(user)
            item.completed = True
        else:
            item.completed, item.completed_at, item.completed_by = False, None, ""
            item.started_at = (item.started_at or now) if body.status == "In Progress" else None
        item.status = body.status
    # A past-due item that isn't completed is Overdue whatever was asked for.
    item.status = effective_status(item, today)
    if item.status != before:
        changes.append(f"status {before} → {item.status}")
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    if changes:
        action = "GOV_ACTION_ITEM_STATUS" if fields <= {"status"} else "GOV_ACTION_ITEM_UPDATE"
        audit.record(session, action, f"#{item.id} {item.description}: {'; '.join(changes)}", user, request)
    meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
    return _action_out(item, _Lookups(session), today, user, meetings)
