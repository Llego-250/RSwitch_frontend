from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.permissions import require_own_participant, require_participant_upload, require_staff, scope_participant_id
from app.core.security import get_current_user
from app.db import get_session
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.participant import Participant
from app.models.user import User
from app.services.compliance import document_status
from app.storage import get_file, put_file

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/types", response_model=list[RequiredDocumentType])
def list_document_types(session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    return session.exec(select(RequiredDocumentType)).all()


@router.post("/types", response_model=RequiredDocumentType)
def add_document_type(
    doc_type: RequiredDocumentType, session: Session = Depends(get_session), _: User = Depends(require_staff)
):
    session.add(doc_type)
    session.commit()
    session.refresh(doc_type)
    return doc_type


@router.post("/upload")
async def upload_document(
    participant_id: int = Form(...),
    doc_type_id: int = Form(...),
    expiry_date: Optional[str] = Form(None),
    notes: str = Form(""),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_participant_upload(participant_id, current_user)
    data = await file.read()
    storage_key = f"documents/{participant_id}/{uuid4()}-{file.filename}"
    put_file(storage_key, data, file.content_type or "application/octet-stream")

    doc = ComplianceDocument(
        participant_id=participant_id,
        doc_type_id=doc_type_id,
        filename=file.filename,
        storage_key=storage_key,
        expiry_date=expiry_date or None,
        notes=notes,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return {**doc.model_dump(), "status": document_status(doc)}


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    doc = session.get(ComplianceDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    require_own_participant(doc.participant_id, scope)
    data = get_file(doc.storage_key)
    return StreamingResponse(
        iter([data]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.get("/participant/{participant_id}")
def documents_for_participant(
    participant_id: int,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    require_own_participant(participant_id, scope)
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(
        select(ComplianceDocument).where(ComplianceDocument.participant_id == participant_id)
    ).all()
    by_type = {d.doc_type_id: d for d in docs}

    rows = []
    for doc_type in doc_types:
        doc = by_type.get(doc_type.id)
        status = "Missing" if doc is None else document_status(doc)
        rows.append({"doc_type": doc_type, "document": doc, "status": status})
    return rows


@router.get("/roster")
def roster_document_status(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    """Expiring, expired and missing documents across the whole roster."""
    participants = session.exec(select(Participant)).all()
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(select(ComplianceDocument)).all()

    docs_by_participant: dict[int, dict[int, ComplianceDocument]] = {}
    for doc in docs:
        docs_by_participant.setdefault(doc.participant_id, {})[doc.doc_type_id] = doc

    needs_attention = []
    for participant in participants:
        participant_docs = docs_by_participant.get(participant.id, {})
        for doc_type in doc_types:
            doc = participant_docs.get(doc_type.id)
            status = "Missing" if doc is None else document_status(doc)
            if status != "On File":
                needs_attention.append(
                    {
                        "participant_id": participant.id,
                        "participant_name": participant.name,
                        "doc_type": doc_type.name,
                        "status": status,
                        "expiry_date": doc.expiry_date if doc else None,
                    }
                )
    return needs_attention
