"""Compliance documents (licences, certifications, sign-offs) uploaded by
RSwitch staff on a participant's behalf (REQ-INTG-007). A document of a type
the participant's Compliance Register tracks is linked to that requirement's
current cycle and reviewed like a data return (§8.4); expiry status is
derived at read time (app.services.compliance.document_status)."""

from datetime import date
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.compliance import ComplianceRequirement
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.participant import Participant
from app.models.user import User
from app.services import audit, compliance
from app.services.compliance import document_status, is_on_file
from app.storage import get_file, put_file

router = APIRouter(prefix="/documents", tags=["documents"])

view = require_cap("compliance.view")
manage = require_cap("compliance.manage")
uploader = require_cap("compliance.upload")
MAX_BYTES = 50 * 1024 * 1024


@router.get("/types", response_model=list[RequiredDocumentType])
def list_document_types(session: Session = Depends(get_session), _: User = Depends(view)):
    return session.exec(select(RequiredDocumentType).order_by(RequiredDocumentType.name)).all()


@router.post("/types", response_model=RequiredDocumentType, status_code=201)
def add_document_type(doc_type: RequiredDocumentType, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(manage)):
    if not (doc_type.name or "").strip():
        raise validation_error([problem("name", "required", "Name the document type.")])
    if session.exec(select(RequiredDocumentType).where(RequiredDocumentType.name == doc_type.name.strip())).first():
        raise validation_error([problem("name", "unique", "This document type already exists.")], 409)
    doc_type.name = doc_type.name.strip()
    session.add(doc_type)
    session.commit()
    session.refresh(doc_type)
    audit.record(session, "DOCUMENT_TYPE_CREATE", doc_type.name, user, request)
    return doc_type


@router.post("/upload", status_code=201)
async def upload_document(
    request: Request,
    participant_id: int = Form(...),
    doc_type_id: int = Form(...),
    expiry_date: Optional[str] = Form(None),
    notes: str = Form(""),
    requirement_id: Optional[int] = Form(None),
    replaces_document_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(uploader),
):
    """Uploaded by RSwitch staff on the participant's behalf. Linked to the
    participant's Document requirement for this type (the one named, or the
    active one) so its cycle moves to Submitted and awaits review."""
    problems = []
    if not session.get(Participant, participant_id):
        problems.append(problem("participant_id", "exists", "Choose a participant."))
    if not session.get(RequiredDocumentType, doc_type_id):
        problems.append(problem("doc_type_id", "exists", "Choose the document type."))
    expiry = None
    if expiry_date:
        try:
            expiry = date.fromisoformat(expiry_date[:10])
        except ValueError:
            problems.append(problem("expiry_date", "format", "Use a date like 2027-03-31."))
    requirement = None
    if requirement_id:
        requirement = session.get(ComplianceRequirement, requirement_id)
        if (requirement is None or requirement.participant_id != participant_id or requirement.kind != compliance.DOCUMENT
                or requirement.doc_type_id != doc_type_id or not requirement.active):
            problems.append(problem("requirement_id", "exists", "Choose one of this participant's active requirements for this document type."))
    if replaces_document_id:
        previous = session.get(ComplianceDocument, replaces_document_id)
        if previous is None or previous.participant_id != participant_id or previous.review_status != compliance.REJECTED:
            problems.append(problem("replaces_document_id", "status", "Only a rejected document from this participant can be corrected."))
    if problems:
        raise validation_error(problems)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds the 50 MB maximum size.")
    if not data:
        raise validation_error([problem("file", "required", "The file is empty.")])
    requirement = requirement or compliance.document_requirement(session, participant_id, doc_type_id)

    storage_key = f"documents/{participant_id}/{uuid4()}-{file.filename}"
    put_file(storage_key, data, file.content_type or "application/octet-stream")
    doc = ComplianceDocument(
        participant_id=participant_id,
        doc_type_id=doc_type_id,
        filename=file.filename,
        storage_key=storage_key,
        expiry_date=expiry,
        notes=notes,
        uploaded_by=current_user.full_name or current_user.email,
        requirement_id=requirement.id if requirement else None,
        review_status=compliance.SUBMITTED if requirement else "",
        replaces_document_id=replaces_document_id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    if requirement:
        compliance.link_document(session, doc)
        session.refresh(doc)
    audit.record(session, "DOCUMENT_UPLOAD", f"DOC-{doc.id} {file.filename} for participant #{participant_id}"
                 + (f" (REQ-{requirement.id})" if requirement else ""), current_user, request)
    return compliance.document_out(doc, compliance.today_for(session))


@router.get("/{document_id}/download")
def download_document(document_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    doc = session.get(ComplianceDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    data = get_file(doc.storage_key)
    return StreamingResponse(
        iter([data]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


def _on_file_by_type(docs: list[ComplianceDocument]) -> dict[int, ComplianceDocument]:
    """The latest document on file per type (rejected or unreviewed uploads
    don't count)."""
    out: dict[int, ComplianceDocument] = {}
    for doc in sorted(docs, key=lambda d: (d.uploaded_at, d.id)):
        if is_on_file(doc):
            out[doc.doc_type_id] = doc
    return out


@router.get("/participant/{participant_id}")
def documents_for_participant(participant_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(select(ComplianceDocument).where(ComplianceDocument.participant_id == participant_id)).all()
    by_type = _on_file_by_type(list(docs))

    rows = []
    for doc_type in doc_types:
        doc = by_type.get(doc_type.id)
        status = "Missing" if doc is None else document_status(doc)
        rows.append({"doc_type": doc_type, "document": doc.model_dump(exclude={"storage_key"}) if doc else None, "status": status})
    return rows


@router.get("/roster")
def roster_document_status(session: Session = Depends(get_session), _: User = Depends(view)):
    """Expiring, expired and missing documents across the whole roster."""
    participants = session.exec(select(Participant)).all()
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(select(ComplianceDocument)).all()

    docs_by_participant: dict[int, list[ComplianceDocument]] = {}
    for doc in docs:
        docs_by_participant.setdefault(doc.participant_id, []).append(doc)

    needs_attention = []
    for participant in participants:
        participant_docs = _on_file_by_type(docs_by_participant.get(participant.id, []))
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
