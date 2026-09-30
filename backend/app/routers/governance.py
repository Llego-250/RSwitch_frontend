from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.permissions import require_roles, require_staff
from app.db import get_session
from app.models.enums import UserRole
from app.models.governance import ActionItem, GovDocument, Meeting, WorkingGroup
from app.models.user import User
from app.services import audit
from app.storage import get_file, put_file

router = APIRouter(prefix="/governance", tags=["governance"])

# Compliance manages governance records; admins can too; others view.
require_manager = require_roles(UserRole.compliance)


def _action_out(a: ActionItem) -> dict:
    status = "Completed" if a.completed else ("Overdue" if a.due_date < date.today() else "Open")
    return {**a.model_dump(), "status": status}


@router.get("/documents", response_model=list[GovDocument])
def list_documents(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return session.exec(select(GovDocument).order_by(GovDocument.uploaded_at.desc())).all()


@router.post("/documents", response_model=GovDocument)
async def upload_document(
    request: Request,
    title: str = Form(...),
    category: str = Form("Policy"),
    committee: str = Form("Board"),
    version: str = Form("v1.0"),
    access_level: str = Form("Internal"),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_manager),
):
    data = await file.read()
    key = f"governance/{uuid4()}-{file.filename}"
    put_file(key, data, file.content_type or "application/octet-stream")
    doc = GovDocument(
        title=title.strip(),
        category=category,
        committee=committee,
        version=version,
        access_level=access_level,
        filename=file.filename,
        storage_key=key,
        uploaded_by=user.full_name or user.email,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    audit.record(session, "GOV_DOCUMENT_UPLOAD", f"{doc.title} {doc.version}", user, request)
    return doc


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    doc = session.get(GovDocument, doc_id)
    if not doc or not doc.storage_key:
        raise HTTPException(status_code=404, detail="Document not found")
    return StreamingResponse(
        iter([get_file(doc.storage_key)]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.get("/meetings")
def list_meetings(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    docs = {d.id: d for d in session.exec(select(GovDocument)).all()}
    return [
        {**m.model_dump(), "minutes_filename": docs[m.minutes_document_id].filename if m.minutes_document_id in docs else None}
        for m in session.exec(select(Meeting).order_by(Meeting.scheduled_at.desc())).all()
    ]


@router.post("/meetings")
def create_meeting(
    request: Request,
    title: str = Body(...),
    committee: str = Body(...),
    scheduled_at: datetime = Body(...),
    attendees_count: int = Body(0),
    decisions_count: int = Body(0),
    minutes_document_id: Optional[int] = Body(None),
    session: Session = Depends(get_session),
    user: User = Depends(require_manager),
):
    if not title.strip():
        raise HTTPException(status_code=422, detail="Give the meeting a title")
    meeting = Meeting(
        title=title.strip(),
        committee=committee,
        scheduled_at=scheduled_at,
        attendees_count=attendees_count,
        decisions_count=decisions_count,
        minutes_document_id=minutes_document_id,
        created_by=user.full_name or user.email,
    )
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    audit.record(session, "MEETING_CREATE", meeting.title, user, request)
    return meeting


@router.patch("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: int,
    updates: dict = Body(...),
    session: Session = Depends(get_session),
    _: User = Depends(require_manager),
):
    meeting = session.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    for key in ("attendees_count", "decisions_count", "minutes_document_id", "title"):
        if key in updates:
            setattr(meeting, key, updates[key])
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return meeting


@router.get("/actions")
def list_actions(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return [_action_out(a) for a in session.exec(select(ActionItem).order_by(ActionItem.due_date)).all()]


@router.post("/actions")
def create_action(
    request: Request,
    description: str = Body(...),
    owner: str = Body(...),
    committee: str = Body(...),
    due_date: date = Body(...),
    session: Session = Depends(get_session),
    user: User = Depends(require_manager),
):
    item = ActionItem(description=description.strip(), owner=owner.strip(), committee=committee, due_date=due_date)
    session.add(item)
    session.commit()
    session.refresh(item)
    audit.record(session, "ACTION_ITEM_CREATE", item.description, user, request)
    return _action_out(item)


@router.patch("/actions/{action_id}")
def update_action(
    action_id: int,
    request: Request,
    completed: bool = Body(..., embed=True),
    session: Session = Depends(get_session),
    user: User = Depends(require_manager),
):
    item = session.get(ActionItem, action_id)
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    item.completed = completed
    item.completed_at = datetime.utcnow() if completed else None
    session.add(item)
    session.commit()
    session.refresh(item)
    audit.record(session, "ACTION_ITEM_COMPLETE" if completed else "ACTION_ITEM_REOPEN", item.description, user, request)
    return _action_out(item)


@router.get("/working-groups", response_model=list[WorkingGroup])
def list_groups(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return session.exec(select(WorkingGroup)).all()


@router.post("/working-groups", response_model=WorkingGroup)
def create_group(group: WorkingGroup, session: Session = Depends(get_session), _: User = Depends(require_manager)):
    session.add(group)
    session.commit()
    session.refresh(group)
    return group
