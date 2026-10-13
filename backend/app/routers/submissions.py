"""Submissions: every transfer from a participant (SRS §5.3, §6.1, §6.4).
Staff upload the files participants send offline (REQ-INTG-007); a file
that fails validation is recorded with its error report and nothing is
loaded; one that passes is queued for the pipeline."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.compliance import ComplianceRequirement
from app.models.enums import SubmissionResult
from app.models.integration import Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import PipelineJob
from app.models.submission import Submission
from app.models.template import IngestionTemplate
from app.models.user import User
from app.services import audit, ingestion
from app.storage import get_file

router = APIRouter(prefix="/submissions", tags=["submissions"])

view = require_cap("integrations.view")
uploader = require_cap("integrations.upload")

CORRECTABLE = ("Validation Failed", "Rejected")


def _errors_out(entries: list) -> list[dict]:
    """§20.2 shape; older rows stored {row, field, error}."""
    out = []
    for e in entries or []:
        out.append({
            "row": e.get("row", 0),
            "column": e.get("column", e.get("field", "")),
            "rule": e.get("rule", ""),
            "description": e.get("description", e.get("error", "")),
        })
    return out


def submission_out(session: Session, s: Submission, *, with_issues: bool = False) -> dict:
    participant = session.get(Participant, s.participant_id)
    integration = session.get(Integration, s.integration_id) if s.integration_id else None
    requirement = session.get(ComplianceRequirement, s.requirement_id) if s.requirement_id else None
    job = session.exec(
        select(PipelineJob).where(PipelineJob.submission_id == s.id).order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
    ).first()
    replaced_by = session.exec(select(Submission.id).where(Submission.replaces_submission_id == s.id)).first()
    out = s.model_dump(exclude={"errors", "warnings", "storage_key", "numeric_totals", "breakdowns"})
    out.update({
        "participant_name": participant.name if participant else "",
        "participant_code": participant.code if participant else "",
        "source_name": integration.source_name if integration else None,
        "integration_mode": integration.integration_mode if integration else None,
        "requirement_name": requirement.requirement_name if requirement else None,
        "replaced_by_id": replaced_by,
        "job": {"id": job.id, "status": job.status, "progress": job.progress} if job else None,
        # Analytics consumers read these; aggregates only.
        "numeric_totals": s.numeric_totals,
        "breakdowns": s.breakdowns,
    })
    if with_issues:
        out["errors"] = _errors_out(s.errors)
        out["warnings"] = _errors_out(s.warnings)
    return out


@router.get("")
def list_submissions(
    participant_id: Optional[int] = None,
    integration_id: Optional[int] = None,
    requirement_id: Optional[int] = None,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """Submission history log (REQ-INTG-011): every attempt, failed ones too."""
    query = select(Submission).order_by(Submission.uploaded_at.desc(), Submission.id.desc())
    if participant_id is not None:
        query = query.where(Submission.participant_id == participant_id)
    if integration_id is not None:
        query = query.where(Submission.integration_id == integration_id)
    if requirement_id is not None:
        query = query.where(Submission.requirement_id == requirement_id)
    if status is not None:
        query = query.where(Submission.status == status)
    return [submission_out(session, s) for s in session.exec(query).all()]


@router.get("/roster")
def submissions_roster(session: Session = Depends(get_session), _: User = Depends(view)):
    """One row per participant with their most recent submission — the 'who
    has reported' view. Full history for one participant is
    GET /submissions?participant_id=."""
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
                "last_status": latest.status if latest else None,
            }
        )
    rows.sort(key=lambda r: r["last_uploaded_at"] or datetime.min, reverse=True)
    return rows


@router.get("/requirements")
def upload_requirements(participant_id: int, session: Session = Depends(get_session), _: User = Depends(uploader)):
    """The upload form's requirement-type dropdown (§8.2): the participant's
    active Data Return obligations from the Compliance Register."""
    rows = session.exec(
        select(ComplianceRequirement).where(
            ComplianceRequirement.participant_id == participant_id,
            ComplianceRequirement.kind == "Data Return",
            ComplianceRequirement.active == True,  # noqa: E712
        ).order_by(ComplianceRequirement.due_date)
    ).all()
    out = []
    for r in rows:
        template = session.get(IngestionTemplate, r.template_id) if r.template_id else None
        out.append({
            "id": r.id,
            "requirement_name": r.requirement_name,
            "regulatory_reference": r.regulatory_reference,
            "frequency": r.frequency,
            "due_date": r.due_date,
            "submission_status": r.submission_status,
            "template_id": r.template_id,
            "template_name": f"{template.name} v{template.version}" if template else None,
        })
    return out


def _get(session: Session, submission_id: int) -> Submission:
    submission = session.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return submission


@router.get("/{submission_id}")
def get_submission(submission_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """One transfer with its full row/column error and warning report."""
    return submission_out(session, _get(session, submission_id), with_issues=True)


@router.get("/{submission_id}/download")
def download_submission(submission_id: int, session: Session = Depends(get_session), _: User = Depends(uploader)):
    """The exact file that was received — for the staff who handle
    participant files (it holds record-level data, so not for everyone)."""
    submission = _get(session, submission_id)
    data = get_file(submission.storage_key)
    ext = ingestion.file_extension(submission.filename)
    return StreamingResponse(
        iter([data]),
        media_type=ingestion.CONTENT_TYPES.get(ext, "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{submission.filename}"'},
    )


def _parse_period(period: str) -> Optional[tuple[str, str]]:
    """(label, filename slug) for YYYY-MM, YYYY-Qn, YYYY or YYYY-MM-DD."""
    period = (period or "").strip()
    for fmt, label, slug in (("%Y-%m-%d", "%d %B %Y", "%Y%m%d"), ("%Y-%m", "%B %Y", "%Y%m"), ("%Y", "%Y", "%Y")):
        try:
            parsed = datetime.strptime(period, fmt)
            return parsed.strftime(label), parsed.strftime(slug)
        except ValueError:
            continue
    if len(period) == 7 and period[4:6].upper() == "-Q" and period[:4].isdigit() and period[6] in "1234":
        return f"Q{period[6]} {period[:4]}", f"{period[:4]}Q{period[6]}"
    return None


@router.post("/upload", status_code=201)
async def upload_submission(
    request: Request,
    participant_id: int = Form(...),
    period: str = Form(...),
    file: UploadFile = File(...),
    requirement_id: Optional[int] = Form(None),
    integration_id: Optional[int] = Form(None),
    replaces_submission_id: Optional[int] = Form(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(uploader),
):
    """§8.2 Manual Data Upload, on behalf of a participant (REQ-INTG-007).
    201 {submission, job} when the file passes; 422 with the error report
    (the failed attempt is still recorded) when it doesn't; 413 over 50 MB."""
    if (file.size or 0) > ingestion.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=ingestion.TOO_LARGE_MESSAGE)
    problems: list[dict] = []
    ext = ingestion.file_extension(file.filename or "")
    if ext not in ingestion.ALLOWED_TYPES:
        problems.append(problem("file", "type", "File type must be CSV, XLSX or XML."))
    parsed_period = _parse_period(period)
    if parsed_period is None:
        problems.append(problem("period", "format", "Reporting period must look like 2026-09, 2026-Q3, 2026 or 2026-09-30."))
    participant = session.get(Participant, participant_id)
    if not participant:
        problems.append(problem("participant_id", "exists", "Choose a participant."))
    if problems:
        raise validation_error(problems)

    data = await file.read()
    if len(data) > ingestion.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=ingestion.TOO_LARGE_MESSAGE)
    if not data:
        raise validation_error([problem("file", "required", "The file is empty.")])

    requirement = None
    if requirement_id:
        requirement = session.get(ComplianceRequirement, requirement_id)
        if (not requirement or requirement.participant_id != participant.id or requirement.kind != "Data Return"
                or not requirement.active):
            raise validation_error([problem("requirement_id", "exists", "Choose one of this participant's active data return requirements.")])

    integration = _upload_target(session, participant, integration_id)
    template = ingestion.resolve_template(session, participant.id, requirement=requirement, integration=integration)
    if template is None:
        raise validation_error([problem("requirement_id", "schema",
                                        "No expected schema is configured for this requirement or data source. "
                                        "A Technical/Admin user can set one in Standards & Mapping.")])
    label, slug = parsed_period
    replaces = _replaced_attempt(session, participant, integration, requirement, label, replaces_submission_id)

    outcome = ingestion.ingest_upload(
        session,
        participant=participant,
        integration=integration,
        template=template,
        period_label=label,
        period_slug=slug,
        original_filename=file.filename,
        data=data,
        uploaded_by=current_user.full_name or current_user.email,
        requirement_id=requirement.id if requirement else None,
        replaces_submission_id=replaces.id if replaces else None,
    )
    submission = outcome.submission
    note = f" (corrects SUB-{replaces.id})" if replaces else ""
    audit.record(session, "SUBMISSION_UPLOAD", f"SUB-{submission.id} {submission.filename}: {submission.status}{note}",
                 current_user, request, status="SUCCESS" if outcome.job else "WARNING")
    body = submission_out(session, submission, with_issues=True)
    if outcome.job is None:
        return JSONResponse(status_code=422, content={"detail": {
            "message": ingestion.VALIDATION_FAILED_MESSAGE,
            "submission": _jsonable(body),
            "errors": body["errors"],
        }})
    from app.routers.pipelines import job_out

    return {"submission": body, "job": job_out(session, outcome.job)}


def _jsonable(value):
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(value)


def _upload_target(session: Session, participant: Participant, integration_id: Optional[int]) -> Integration:
    """Uploads go to a Manual Upload data source (REQ-INTG-007)."""
    if integration_id:
        integration = session.get(Integration, integration_id)
        if not integration or integration.participant_id != participant.id:
            raise validation_error([problem("integration_id", "exists", "Choose one of this participant's data sources.")])
    else:
        integration = session.exec(
            select(Integration).where(Integration.participant_id == participant.id,
                                      Integration.integration_mode == IntegrationMode.manual.value,
                                      Integration.paused == False).order_by(Integration.id)  # noqa: E712
        ).first()
        if integration is None:
            raise validation_error([problem("integration_id", "required",
                                            "This participant has no Manual Upload data source. A Technical/Admin user can add one under Integrations.")])
    if integration.integration_mode != IntegrationMode.manual.value:
        raise validation_error([problem("integration_id", "mode",
                                        "Files can only be uploaded to Manual Upload data sources; Automated API sources are pulled.")])
    if integration.paused:
        raise validation_error([problem("integration_id", "paused", "This data source is paused by an administrator.")])
    return integration


def _replaced_attempt(session: Session, participant: Participant, integration: Integration, requirement,
                      period_label: str, explicit_id: Optional[int]) -> Optional[Submission]:
    """§6.4 step 5: a corrected re-upload points at the attempt it corrects —
    the one named, or else the latest uncorrected failed/rejected attempt
    for the same obligation and period."""
    if explicit_id:
        previous = session.get(Submission, explicit_id)
        if not previous or previous.participant_id != participant.id:
            raise validation_error([problem("replaces_submission_id", "exists", "Choose an earlier submission from this participant.")])
        if previous.status not in CORRECTABLE:
            raise validation_error([problem("replaces_submission_id", "status",
                                            "Only a submission that failed validation or was rejected can be corrected.")])
        return previous
    query = select(Submission).where(
        Submission.participant_id == participant.id, Submission.period == period_label, Submission.status.in_(CORRECTABLE)
    )
    query = query.where(Submission.requirement_id == requirement.id) if requirement else query.where(Submission.integration_id == integration.id)
    for candidate in session.exec(query.order_by(Submission.uploaded_at.desc(), Submission.id.desc())).all():
        if session.exec(select(Submission.id).where(Submission.replaces_submission_id == candidate.id)).first() is None:
            return candidate
    return None


@router.post("/{submission_id}/review")
def review_submission(
    submission_id: int,
    request: Request,
    decision: str = Body(...),
    note: str = Body(""),
    session: Session = Depends(get_session),
    user: User = Depends(require_cap("compliance.manage")),
):
    submission = _get(session, submission_id)
    if submission.result != SubmissionResult.passed:
        raise HTTPException(status_code=422, detail="Only submissions that passed validation can be reviewed")
    if decision not in ("Approved", "Rejected"):
        raise HTTPException(status_code=422, detail="decision must be Approved or Rejected")
    if decision == "Rejected" and len(note.strip()) < 20:
        raise HTTPException(status_code=422, detail="Rejection requires a reason of at least 20 characters")
    submission.review_status = decision
    submission.status = decision
    submission.review_note = note.strip()
    submission.rejection_reason = note.strip() if decision == "Rejected" else ""
    submission.reviewed_by = user.full_name or user.email
    submission.reviewed_at = datetime.utcnow()
    session.add(submission)
    session.commit()
    session.refresh(submission)
    audit.record(session, "SUBMISSION_REVIEW", f"SUB-{submission.id} ({decision})", user, request,
                 status="WARNING" if decision == "Rejected" else "SUCCESS")
    return submission_out(session, submission)
