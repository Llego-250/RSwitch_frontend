from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.permissions import require_own_participant, require_participant_upload, require_roles, require_staff, scope_participant_id
from app.core.security import get_current_user
from app.db import get_session
from app.models.enums import SubmissionResult, UserRole
from app.models.integration import Integration
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User
from app.services import anomaly, audit
from app.services.ingestion import UnsupportedFormat, breakdown_rows, read_rows, summarize_rows, validate_rows
from app.storage import get_file, put_file

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.get("", response_model=list[Submission])
def list_submissions(
    participant_id: Optional[int] = None,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    query = select(Submission).order_by(Submission.uploaded_at.desc())
    effective_participant_id = scope if scope is not None else participant_id
    if effective_participant_id is not None:
        query = query.where(Submission.participant_id == effective_participant_id)
    return session.exec(query).all()


@router.get("/roster")
def submissions_roster(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    """One row per participant that has ever reported, with their most
    recent submission — the 'who has reported' view. Full history for one
    participant is GET /submissions?participant_id=."""
    participants = session.exec(select(Participant)).all()
    submissions = session.exec(select(Submission).order_by(Submission.uploaded_at.desc())).all()

    latest_by_participant: dict[int, Submission] = {}
    counts: dict[int, int] = {}
    for submission in submissions:
        counts[submission.participant_id] = counts.get(submission.participant_id, 0) + 1
        if submission.participant_id not in latest_by_participant:
            latest_by_participant[submission.participant_id] = submission

    rows = []
    for participant in participants:
        latest = latest_by_participant.get(participant.id)
        rows.append(
            {
                "participant_id": participant.id,
                "participant_name": participant.name,
                "participant_code": participant.code,
                "submission_count": counts.get(participant.id, 0),
                "last_period": latest.period if latest else None,
                "last_uploaded_at": latest.uploaded_at if latest else None,
                "last_result": latest.result if latest else None,
            }
        )
    rows.sort(key=lambda r: r["last_uploaded_at"] or datetime.min, reverse=True)
    return rows


@router.get("/{submission_id}/download")
def download_submission(
    submission_id: int,
    session: Session = Depends(get_session),
    scope: Optional[int] = Depends(scope_participant_id),
):
    """Streams the exact file that was ingested, straight from MinIO — the
    same object the validation pipeline read at upload time."""
    submission = session.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    require_own_participant(submission.participant_id, scope)
    data = get_file(submission.storage_key)
    return StreamingResponse(
        iter([data]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{submission.filename}"'},
    )


def _latest_template(session: Session, participant_id: int):
    template = session.exec(
        select(IngestionTemplate)
        .where(IngestionTemplate.participant_id == participant_id)
        .order_by(IngestionTemplate.version.desc(), IngestionTemplate.id.desc())
    ).first()
    if not template:
        raise HTTPException(status_code=400, detail="No ingestion template configured for this participant")
    columns = session.exec(
        select(TemplateColumn).where(TemplateColumn.template_id == template.id).order_by(TemplateColumn.position)
    ).all()
    return template, columns


def _ingest(session: Session, participant: Participant, source_name: str, data: bytes, **fields) -> Submission:
    """Validate a file against the participant's current template and record
    the result. Shared by upload and reprocess."""
    template, columns = _latest_template(session, participant.id)
    try:
        rows = read_rows(source_name, data)
    except UnsupportedFormat as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    errors = validate_rows(rows, columns)
    result = SubmissionResult.failed if errors else SubmissionResult.passed
    row_count, numeric_totals = summarize_rows(rows, columns) if not errors else (0, {})
    submission = Submission(
        participant_id=participant.id,
        template_id=template.id,
        result=result,
        error_count=len(errors),
        errors=errors,
        row_count=row_count,
        numeric_totals=numeric_totals,
        breakdowns=breakdown_rows(rows, columns) if not errors else {},
        **fields,
    )
    session.add(submission)
    if result == SubmissionResult.passed:
        integration = session.exec(select(Integration).where(Integration.participant_id == participant.id)).first()
        if integration:
            integration.last_submission_at = datetime.utcnow()
            session.add(integration)
    session.commit()
    session.refresh(submission)
    anomaly.detect(session)
    return submission


@router.post("/upload", response_model=Submission)
async def upload_submission(
    request: Request,
    participant_id: int = Form(...),
    period: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    require_participant_upload(participant_id, current_user)
    try:
        period_start = datetime.strptime(period, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=422, detail="period must be in YYYY-MM form")

    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    data = await file.read()
    # A submission's identity is the period it reports, not whatever the
    # uploader happened to name their local file — construct the canonical
    # name from participant code + period instead of trusting file.filename.
    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "csv"
    canonical_filename = f"{participant.code}_{period_start.strftime('%Y%m')}.{extension}"
    storage_key = f"submissions/{participant_id}/{uuid4()}-{canonical_filename}"
    put_file(storage_key, data, file.content_type or "application/octet-stream")

    submission = _ingest(
        session, participant, file.filename, data,
        period=period_start.strftime("%B %Y"),
        filename=canonical_filename,
        storage_key=storage_key,
        uploaded_by=current_user.full_name or current_user.email,
    )
    audit.record(session, "SUBMISSION_UPLOAD", f"{canonical_filename} ({submission.result.value})", current_user, request)
    return submission


@router.post("/{submission_id}/reprocess", response_model=Submission)
def reprocess_submission(
    submission_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_staff),
):
    """Re-validates the stored file against the participant's *current*
    template (e.g. after a template fix) and records a new submission."""
    original = session.get(Submission, submission_id)
    if not original:
        raise HTTPException(status_code=404, detail="Submission not found")
    participant = session.get(Participant, original.participant_id)
    data = get_file(original.storage_key)
    submission = _ingest(
        session, participant, original.filename, data,
        period=original.period,
        filename=original.filename,
        storage_key=original.storage_key,
        uploaded_by=f"Reprocessed by {user.full_name or user.email} (from SUB-{original.id})",
    )
    audit.record(session, "SUBMISSION_REPROCESS", f"SUB-{original.id} → SUB-{submission.id} ({submission.result.value})", user, request)
    return submission


@router.post("/{submission_id}/review", response_model=Submission)
def review_submission(
    submission_id: int,
    request: Request,
    decision: str = Body(...),
    note: str = Body(""),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(UserRole.compliance)),
):
    submission = session.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.result != SubmissionResult.passed:
        raise HTTPException(status_code=422, detail="Only submissions that passed validation can be reviewed")
    if decision not in ("Approved", "Rejected"):
        raise HTTPException(status_code=422, detail="decision must be Approved or Rejected")
    if decision == "Rejected" and len(note.strip()) < 20:
        raise HTTPException(status_code=422, detail="Rejection requires a reason of at least 20 characters")
    submission.review_status = decision
    submission.review_note = note.strip()
    submission.reviewed_by = user.full_name or user.email
    submission.reviewed_at = datetime.utcnow()
    session.add(submission)
    session.commit()
    session.refresh(submission)
    audit.record(session, "SUBMISSION_REVIEW", f"SUB-{submission.id} ({decision})", user, request,
                 status="WARNING" if decision == "Rejected" else "SUCCESS")
    return submission
