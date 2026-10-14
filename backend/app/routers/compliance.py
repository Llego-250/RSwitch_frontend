"""Compliance Monitoring API (SRS §5.8, §19.3): the Compliance Register and
its cycles, submission review, the deadline calendar, incidents with
remediation actions, and the read models other modules build on.

Compliance manages (compliance.manage); Business and Technical/Admin view
(§12.1). Compliance and Technical/Admin upload on a participant's behalf
(compliance.upload). The lifecycle rules live in app.services.compliance and
app.services.incidents."""

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.compliance import ComplianceCycle, ComplianceRequirement
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import IssueSeverity, IssueStatus, SubmissionResult, UNRESOLVED_INCIDENT_STATUSES
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate
from app.models.user import User
from app.services import audit, compliance as svc, incidents as inc_svc

router = APIRouter(prefix="/compliance", tags=["compliance"])

view = require_cap("compliance.view")
manage = require_cap("compliance.manage")
upload = require_cap("compliance.upload")

# §9.2 meanings, for the legend and tooltips.
STATUS_HELP = {
    svc.PENDING: "Deadline not yet reached; nothing has been submitted for this cycle.",
    svc.SUBMITTED: "A valid file was uploaded and awaits review.",
    svc.UNDER_REVIEW: "A Compliance user is reviewing the valid submission.",
    svc.APPROVED: "Submission accepted. A recurring requirement opens its next cycle.",
    svc.VALIDATION_FAILED: "The latest file failed schema or data-quality checks; an error report was generated.",
    svc.REJECTED: "The submission was rejected after review; a corrected resubmission is required.",
    svc.PENDING_CORRECTION: "The institution has been asked for a corrected file, which hasn't arrived yet.",
    svc.OVERDUE: "The deadline passed without an acceptable submission. Stays Overdue until one is approved.",
}
INCIDENT_STATUS_HELP = {
    "Open": "Raised; the assigned owner has not acknowledged it yet.",
    "Under Investigation": "The assigned owner acknowledged it.",
    "Remediation In Progress": "Remediation action items are active.",
    "Resolved": "Remediation complete; pending closure.",
    "Closed": "Formally closed by a Compliance user; read-only.",
}


def _name(user: User) -> str:
    return user.full_name or user.email


def _date(value: Optional[str], field: str) -> Optional[date]:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise validation_error([problem(field, "format", "Use a date like 2026-10-31.")])


def _get_requirement(session: Session, requirement_id: int) -> ComplianceRequirement:
    requirement = session.get(ComplianceRequirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return requirement


# ---- reference data ---------------------------------------------------------

@router.get("/meta")
def meta(session: Session = Depends(get_session), _: User = Depends(view)):
    """Enumerations and settings the Compliance page needs."""
    from app.services.compliance_jobs import lead_times

    return {
        "statuses": svc.STATUSES,
        "status_help": STATUS_HELP,
        "kinds": svc.KINDS,
        "frequencies": svc.FREQUENCIES,
        "severities": [s.value for s in inc_svc.SEVERITIES],
        "incident_statuses": [s.value for s in inc_svc.STATUSES],
        "incident_status_help": INCIDENT_STATUS_HELP,
        "reminder_days_before": lead_times(session),
        "min_rejection_reason": svc.MIN_REJECTION_REASON,
        "calendar_days": svc.CALENDAR_DAYS,
        "today": svc.today_for(session),
    }


@router.get("/options")
def options(participant_id: Optional[int] = None, session: Session = Depends(get_session), _: User = Depends(view)):
    """What a register entry can point at: expected-schema templates (the
    participant's own first) and required document types."""
    templates = session.exec(select(IngestionTemplate).order_by(IngestionTemplate.name, IngestionTemplate.version)).all()
    if participant_id is not None:
        templates = [t for t in templates if t.participant_id == participant_id] or list(templates)
    return {
        "templates": [{"id": t.id, "participant_id": t.participant_id, "name": t.name, "version": t.version,
                       "label": f"{t.name} v{t.version}"} for t in templates],
        "doc_types": [{"id": d.id, "name": d.name, "renewal_months": d.renewal_months}
                      for d in session.exec(select(RequiredDocumentType).order_by(RequiredDocumentType.name)).all()],
    }


@router.get("/staff")
def staff(session: Session = Depends(get_session), _: User = Depends(view)):
    """Active RSwitch staff who can own an incident or a remediation action."""
    users = session.exec(select(User).where(User.is_active == True, User.pending_invite == False).order_by(User.full_name)).all()  # noqa: E712
    return [{"id": u.id, "name": _name(u), "email": u.email, "role": u.role.value, "is_senior": u.is_senior} for u in users]


# ---- Compliance Register (REQ-COMP-001/002, §10.3, §11.4) --------------------

@router.get("/requirements")
def list_requirements(
    participant_id: Optional[int] = None,
    status: Optional[str] = None,
    kind: Optional[str] = None,
    frequency: Optional[str] = None,
    active: Optional[bool] = None,
    include_inactive: bool = False,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    """§19.3: the register, one row per obligation with its current cycle."""
    query = select(ComplianceRequirement)
    if participant_id is not None:
        query = query.where(ComplianceRequirement.participant_id == participant_id)
    if kind:
        query = query.where(ComplianceRequirement.kind == kind)
    if frequency:
        query = query.where(ComplianceRequirement.frequency == frequency)
    if active is not None:
        query = query.where(ComplianceRequirement.active == active)
    elif not include_inactive:
        query = query.where(ComplianceRequirement.active == True)  # noqa: E712
    lk = svc.Lookups(session)
    rows = [svc.requirement_out(session, r, lk) for r in session.exec(query).all()]
    if status:
        rows = [r for r in rows if r["submission_status"] == status]
    if q:
        needle = q.strip().lower()
        rows = [r for r in rows if needle in f"{r['requirement_name']} {r['regulatory_reference']} {r['participant_name']} {r['participant_code']}".lower()]
    return sorted(rows, key=lambda r: (r["submission_status"] != svc.OVERDUE, r["due_date"], r["participant_name"]))


class RequirementIn(BaseModel):
    participant_id: Optional[int] = None
    requirement_name: Optional[str] = None
    regulatory_reference: Optional[str] = None
    kind: Optional[str] = None
    template_id: Optional[int] = None
    doc_type_id: Optional[int] = None
    frequency: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None


def _check_target(session: Session, kind: str, template_id: Optional[int], doc_type_id: Optional[int]) -> list[dict]:
    if kind == svc.DATA_RETURN:
        if not template_id or session.get(IngestionTemplate, template_id) is None:
            return [problem("template_id", "required", "Choose the expected schema files are validated against.")]
    elif kind == svc.DOCUMENT:
        if not doc_type_id or session.get(RequiredDocumentType, doc_type_id) is None:
            return [problem("doc_type_id", "required", "Choose the required document type.")]
    return []


@router.post("/requirements", status_code=201)
def create_requirement(body: RequirementIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """§19.3 / REQ-COMP-002. The first cycle opens at the given due date,
    which must be in the future (§11.4)."""
    today = svc.today_for(session)
    problems = []
    participant = session.get(Participant, body.participant_id) if body.participant_id else None
    if participant is None:
        problems.append(problem("participant_id", "required", "Choose the responsible participant."))
    name = (body.requirement_name or "").strip()
    if not name:
        problems.append(problem("requirement_name", "required", "Name the requirement."))
    reference = (body.regulatory_reference or "").strip()
    if not reference:
        problems.append(problem("regulatory_reference", "required", "Give the regulatory reference, e.g. BNR Directive 07/2024."))
    if body.kind not in svc.KINDS:
        problems.append(problem("kind", "allowed_values", "Choose Data Return or Document."))
    else:
        problems += _check_target(session, body.kind, body.template_id, body.doc_type_id)
    if body.frequency not in svc.FREQUENCIES:
        problems.append(problem("frequency", "allowed_values", "Choose Monthly, Quarterly, Annual or Ad hoc."))
    due = _date(body.due_date, "due_date")
    problems += svc.check_due_date(due, today)
    if problems:
        raise validation_error(problems)
    duplicate = session.exec(select(ComplianceRequirement.id).where(
        ComplianceRequirement.participant_id == participant.id, ComplianceRequirement.requirement_name == name,
        ComplianceRequirement.active == True)).first()  # noqa: E712
    if duplicate:
        raise validation_error([problem("requirement_name", "unique", "This participant already has an active requirement with this name.")], 409)
    requirement = ComplianceRequirement(
        participant_id=participant.id, requirement_name=name, regulatory_reference=reference, kind=body.kind,
        template_id=body.template_id if body.kind == svc.DATA_RETURN else None,
        doc_type_id=body.doc_type_id if body.kind == svc.DOCUMENT else None,
        frequency=body.frequency, anchor_day=due.day, due_date=due, description=(body.description or "").strip(),
        created_by=_name(user),
    )
    session.add(requirement)
    session.flush()
    svc.ensure_cycle(session, requirement)
    session.commit()
    audit.record(session, "COMPLIANCE_REQUIREMENT_CREATE",
                 f"REQ-{requirement.id} {name} for {participant.name} ({body.frequency}, due {due})", user, request)
    return svc.requirement_detail(session, requirement)


@router.get("/requirements/{requirement_id}")
def get_requirement(requirement_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """A register entry with every cycle and what was sent for it."""
    return svc.requirement_detail(session, _get_requirement(session, requirement_id))


@router.put("/requirements/{requirement_id}")
def update_requirement(requirement_id: int, body: RequirementIn, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(manage)):
    """Edit a register entry. A new due date moves the current cycle's
    deadline (or, once that cycle is approved, schedules the next delivery)
    and must be in the future (§11.4)."""
    requirement = _get_requirement(session, requirement_id)
    data = body.model_dump(exclude_unset=True)
    problems, changes = [], []
    if "participant_id" in data and data["participant_id"] != requirement.participant_id:
        problems.append(problem("participant_id", "immutable", "The responsible participant can't change; create a new requirement."))
    if "kind" in data and data["kind"] != requirement.kind:
        problems.append(problem("kind", "immutable", "The kind can't change; create a new requirement."))
    if "requirement_name" in data:
        if not (data["requirement_name"] or "").strip():
            problems.append(problem("requirement_name", "required", "Name the requirement."))
    if "regulatory_reference" in data and not (data["regulatory_reference"] or "").strip():
        problems.append(problem("regulatory_reference", "required", "Give the regulatory reference, e.g. BNR Directive 07/2024."))
    if "frequency" in data and data["frequency"] not in svc.FREQUENCIES:
        problems.append(problem("frequency", "allowed_values", "Choose Monthly, Quarterly, Annual or Ad hoc."))
    if "template_id" in data or "doc_type_id" in data:
        problems += _check_target(session, requirement.kind, data.get("template_id", requirement.template_id),
                                  data.get("doc_type_id", requirement.doc_type_id))
    due = None
    if "due_date" in data:
        due = _date(data["due_date"], "due_date")
        problems += svc.check_due_date(due, svc.today_for(session))
    if problems:
        raise validation_error(problems)
    for field in ("requirement_name", "regulatory_reference", "description", "frequency", "template_id", "doc_type_id"):
        if field in data:
            value = data[field].strip() if isinstance(data[field], str) else data[field]
            if value != getattr(requirement, field):
                changes.append(field)
                setattr(requirement, field, value)
    if due is not None:
        changes.append(f"due_date={due}")
        svc.set_due_date(session, requirement, due)
    requirement.updated_by = _name(user)
    requirement.updated_at = datetime.utcnow()
    session.add(requirement)
    session.commit()
    audit.record(session, "COMPLIANCE_REQUIREMENT_UPDATE", f"REQ-{requirement.id}: {', '.join(changes) or 'no change'}", user, request)
    return svc.requirement_detail(session, requirement)


@router.post("/requirements/{requirement_id}/deactivate")
def deactivate_requirement(requirement_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """Stop tracking an obligation. Its cycles and history are kept."""
    requirement = _get_requirement(session, requirement_id)
    requirement.active = False
    requirement.updated_by, requirement.updated_at = _name(user), datetime.utcnow()
    session.add(requirement)
    session.commit()
    audit.record(session, "COMPLIANCE_REQUIREMENT_DEACTIVATE", f"REQ-{requirement.id} {requirement.requirement_name}", user, request)
    return svc.requirement_detail(session, requirement)


@router.post("/requirements/{requirement_id}/activate")
def activate_requirement(requirement_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    requirement = _get_requirement(session, requirement_id)
    requirement.active = True
    requirement.updated_by, requirement.updated_at = _name(user), datetime.utcnow()
    session.add(requirement)
    cycle = svc.ensure_cycle(session, requirement)
    svc.roll_next(session, requirement, cycle)
    session.commit()
    audit.record(session, "COMPLIANCE_REQUIREMENT_ACTIVATE", f"REQ-{requirement.id} {requirement.requirement_name}", user, request)
    return svc.requirement_detail(session, requirement)


class CorrectionIn(BaseModel):
    note: str = ""


@router.post("/cycles/{cycle_id}/request-correction")
def request_correction(cycle_id: int, body: CorrectionIn, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(manage)):
    """§6.4 step 3: the institution was contacted offline for a corrected
    file → Pending Correction."""
    cycle = session.get(ComplianceCycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    svc.request_correction(session, cycle, user, body.note)
    requirement = session.get(ComplianceRequirement, cycle.requirement_id)
    audit.record(session, "COMPLIANCE_CORRECTION_REQUEST", f"REQ-{requirement.id} {requirement.requirement_name} ({cycle.period})", user, request)
    return svc.requirement_detail(session, requirement)


# ---- submissions: upload and review (§6.1, §6.4, §8.4, §19.3) ----------------

@router.post("/submissions", status_code=201)
async def upload_submission(
    request: Request,
    participant_id: int = Form(...),
    period: str = Form(...),
    file: UploadFile = File(...),
    requirement_id: Optional[int] = Form(None),
    integration_id: Optional[int] = Form(None),
    replaces_submission_id: Optional[int] = Form(None),
    session: Session = Depends(get_session),
    user: User = Depends(upload),
):
    """§19.3 Upload new submission — the Compliance → Upload Submission entry
    point (§6.1 steps 2-4a). Same intake as POST /submissions/upload, but the
    requirement the file satisfies is mandatory."""
    from app.routers import submissions

    if not requirement_id:
        raise validation_error([problem("requirement_id", "required", "Choose the requirement this file satisfies.")])
    return await submissions.upload_submission(
        request=request, participant_id=participant_id, period=period, file=file, requirement_id=requirement_id,
        integration_id=integration_id, replaces_submission_id=replaces_submission_id, session=session, current_user=user,
    )


class ReviewIn(BaseModel):
    decision: str
    notes: str = ""
    rejection_reason: str = ""


def _review_response(session: Session, obj, cycle: Optional[ComplianceCycle]) -> dict:
    out = {"item": svc.item_out(obj, with_report=True, session=session), "requirement": None}
    if cycle is not None:
        out["requirement"] = svc.requirement_detail(session, session.get(ComplianceRequirement, cycle.requirement_id))
    return out


@router.put("/submissions/{submission_id}/review")
def review_submission(submission_id: int, body: ReviewIn, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(manage)):
    """§19.3 / §8.4: decision "Under Review" starts the review; "Approved" or
    "Rejected" ends it (reason ≥ 20 characters, §11.4). Reviewer notes are
    optional."""
    submission = session.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    cycle = svc.review(session, submission, body.decision, user, notes=body.notes, rejection_reason=body.rejection_reason)
    audit.record(session, "SUBMISSION_REVIEW", f"SUB-{submission.id} → {body.decision}", user, request,
                 status="WARNING" if body.decision == svc.REJECTED else "SUCCESS")
    return _review_response(session, submission, cycle)


@router.put("/documents/{document_id}/review")
def review_document(document_id: int, body: ReviewIn, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(manage)):
    """The same review for a document sent for a Document requirement."""
    document = session.get(ComplianceDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    if not document.review_status:
        raise validation_error([problem("decision", "status", "This document was filed outside the Compliance Register and has no review.")])
    cycle = svc.review(session, document, body.decision, user, notes=body.notes, rejection_reason=body.rejection_reason)
    audit.record(session, "DOCUMENT_REVIEW", f"DOC-{document.id} → {body.decision}", user, request,
                 status="WARNING" if body.decision == svc.REJECTED else "SUCCESS")
    return _review_response(session, document, cycle)


def _queue_entry(session: Session, obj, lk: svc.Lookups) -> dict:
    cycle = svc.cycle_of(session, obj)
    requirement = session.get(ComplianceRequirement, cycle.requirement_id) if cycle else None
    in_time = None
    if cycle is not None:
        in_time = obj.uploaded_at < svc.deadline_utc(cycle.due_date, lk.zone)
    return {
        **svc._participant_ref(lk.participant(obj.participant_id), obj.participant_id),
        "item": svc.item_out(obj, with_report=True, session=session),
        "chain": svc.correction_chain(session, obj),
        "requirement": {"id": requirement.id, "requirement_name": requirement.requirement_name,
                        "regulatory_reference": requirement.regulatory_reference, "kind": requirement.kind,
                        "frequency": requirement.frequency} if requirement else None,
        "cycle": svc.cycle_out(session, cycle, lk) if cycle else None,
        "cycle_closed": bool(cycle and cycle.stage == svc.APPROVED),
        "received_in_time": in_time,
    }


@router.get("/review-queue")
def review_queue(participant_id: Optional[int] = None, session: Session = Depends(get_session), _: User = Depends(view)):
    """§8.4 work list. awaiting_review: valid files Submitted or Under Review
    (register submissions and documents, plus manual uploads not linked to a
    requirement), each with its error/warning report and correction chain.
    needs_follow_up: cycles whose latest file failed validation or was
    rejected — contact the institution, then record it. awaiting_correction:
    cycles in Pending Correction."""
    lk = svc.Lookups(session)
    subs = session.exec(select(Submission).where(Submission.status.in_(svc.IN_REVIEW),
                                                 Submission.result == SubmissionResult.passed)
                        .order_by(Submission.uploaded_at)).all()
    docs = session.exec(select(ComplianceDocument).where(ComplianceDocument.review_status.in_(svc.IN_REVIEW))
                        .order_by(ComplianceDocument.uploaded_at)).all()
    awaiting = []
    for obj in [*subs, *docs]:
        if participant_id is not None and obj.participant_id != participant_id:
            continue
        if isinstance(obj, Submission) and not obj.requirement_id and svc.automated_integration(session, obj):
            continue  # operational API feeds not tied to an obligation aren't compliance submissions
        awaiting.append(_queue_entry(session, obj, lk))
    awaiting.sort(key=lambda e: (e["item"]["status"] != svc.UNDER_REVIEW, e["item"]["uploaded_at"]))

    follow_up, correction = [], []
    query = select(ComplianceCycle, ComplianceRequirement).where(
        ComplianceCycle.requirement_id == ComplianceRequirement.id, ComplianceRequirement.active == True,  # noqa: E712
        ComplianceCycle.stage.in_(svc.NEEDS_CORRECTION))
    if participant_id is not None:
        query = query.where(ComplianceRequirement.participant_id == participant_id)
    for cycle, requirement in session.exec(query.order_by(ComplianceCycle.due_date)).all():
        items = svc.cycle_items(session, cycle)
        latest = max(items, key=lambda i: (i.event_at, i.obj.id)) if items else None
        entry = {
            **svc._participant_ref(lk.participant(requirement.participant_id), requirement.participant_id),
            "requirement": {"id": requirement.id, "requirement_name": requirement.requirement_name,
                            "regulatory_reference": requirement.regulatory_reference, "kind": requirement.kind,
                            "frequency": requirement.frequency},
            "cycle": svc.cycle_out(session, cycle, lk),
            "item": svc.item_out(latest.obj, with_report=True, session=session) if latest else None,
            "chain": svc.correction_chain(session, latest.obj) if latest else [],
        }
        (correction if cycle.stage == svc.PENDING_CORRECTION else follow_up).append(entry)
    return {"awaiting_review": awaiting, "needs_follow_up": follow_up, "awaiting_correction": correction}


# ---- calendar (REQ-COMP-004/005) --------------------------------------------

@router.get("/calendar")
def calendar(days: int = svc.CALENDAR_DAYS, participant_id: Optional[int] = None, session: Session = Depends(get_session),
             _: User = Depends(view)):
    """Every deadline in the next `days` days (default 90, REQ-COMP-004)
    plus everything Overdue, which the page shows in red (REQ-COMP-005)."""
    days = max(1, min(days, 366))
    lk = svc.Lookups(session)
    end = lk.today + timedelta(days=days)
    return {
        "start": lk.today,
        "end": end,
        "deadlines": svc.deadlines(session, lk.today, end, participant_id=participant_id, lk=lk),
        "overdue": svc.overdue_rows(session, participant_id=participant_id, lk=lk),
    }


# ---- documents (REQ-COMP-001) -----------------------------------------------

@router.get("/documents")
def documents(participant_id: Optional[int] = None, session: Session = Depends(get_session), _: User = Depends(view)):
    """Required documents per participant with expiry status and the
    register entry that tracks each."""
    return svc.document_rows(session, participant_id)


# ---- incidents (REQ-COMP-006/007/010/011, §6.2, §19.3) -----------------------

def _get_incident(session: Session, incident_id: int) -> Issue:
    incident = session.get(Issue, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return incident


@router.get("/incidents")
def list_incidents(
    participant_id: Optional[int] = None,
    severity: Optional[IssueSeverity] = None,
    status: Optional[IssueStatus] = None,
    owner_id: Optional[int] = None,
    mine: bool = False,
    open_only: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    """§19.3 List all incidents, newest first. mine: incidents the viewer
    owns or has a remediation action on."""
    query = select(Issue).order_by(Issue.created_at.desc(), Issue.id.desc())
    if participant_id is not None:
        query = query.where(Issue.participant_id == participant_id)
    if severity is not None:
        query = query.where(Issue.severity == severity)
    if status is not None:
        query = query.where(Issue.status == status)
    if owner_id is not None:
        query = query.where(Issue.owner_id == owner_id)
    if open_only:
        query = query.where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))
    rows = session.exec(query).all()
    if mine:
        actioned = set(session.exec(select(RemediationAction.incident_id).where(RemediationAction.owner_id == user.id)).all())
        rows = [r for r in rows if r.owner_id == user.id or r.id in actioned]
    lk = svc.Lookups(session)
    return [inc_svc.incident_out(session, r, user, lk) for r in rows]


class IncidentIn(BaseModel):
    participant_id: Optional[int] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    incident_date: Optional[str] = None
    owner_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    resolution_summary: Optional[str] = None


@router.post("/incidents", status_code=201)
def create_incident(body: IncidentIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    """§19.3 / §6.2 step 1: logged as Open; the assigned owner is notified."""
    incident = inc_svc.create(session, user, participant_id=body.participant_id, description=body.description or "",
                              severity=body.severity or "Medium", incident_date=body.incident_date, owner_id=body.owner_id,
                              notes=body.notes or "")
    audit.record(session, "INCIDENT_CREATE", f"{inc_svc.incident_ref(incident)} ({incident.severity.value}) {incident.description[:80]}",
                 user, request)
    return inc_svc.incident_out(session, incident, user)


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    return inc_svc.incident_out(session, _get_incident(session, incident_id), user)


@router.put("/incidents/{incident_id}")
def update_incident(incident_id: int, body: IncidentIn, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(view)):
    """§19.3 Update incident status (and details). Compliance edits, resolves
    and closes; the assigned owner acknowledges. Everyone else gets 403."""
    incident = _get_incident(session, incident_id)
    before = incident.status.value
    data = body.model_dump(exclude_unset=True)
    data.pop("participant_id", None)
    incident = inc_svc.update(session, incident, user, data)
    change = f"{before} → {incident.status.value}" if incident.status.value != before else ", ".join(sorted(data)) or "no change"
    audit.record(session, "INCIDENT_UPDATE", f"{inc_svc.incident_ref(incident)}: {change}", user, request)
    return inc_svc.incident_out(session, incident, user)


class ActionIn(BaseModel):
    description: Optional[str] = None
    owner_id: Optional[int] = None
    due_date: Optional[str] = None


def _get_action(session: Session, incident: Issue, action_id: int) -> RemediationAction:
    action = session.get(RemediationAction, action_id)
    if action is None or action.incident_id != incident.id:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return action


@router.post("/incidents/{incident_id}/actions", status_code=201)
def add_action(incident_id: int, body: ActionIn, request: Request, session: Session = Depends(get_session),
               user: User = Depends(manage)):
    """REQ-COMP-010 / §6.2 step 3: a remediation action item with owner and
    due date; the incident moves to Remediation In Progress."""
    incident = _get_incident(session, incident_id)
    action = inc_svc.add_action(session, incident, user, description=body.description, owner_id=body.owner_id, due_date=body.due_date)
    audit.record(session, "REMEDIATION_ACTION_CREATE", f"{inc_svc.incident_ref(incident)} action #{action.id} due {action.due_date}",
                 user, request)
    return inc_svc.incident_out(session, session.get(Issue, incident_id), user)


@router.put("/incidents/{incident_id}/actions/{action_id}")
def update_action(incident_id: int, action_id: int, body: ActionIn, request: Request, session: Session = Depends(get_session),
                  user: User = Depends(manage)):
    incident = _get_incident(session, incident_id)
    action = inc_svc.update_action(session, incident, _get_action(session, incident, action_id), user, body.model_dump(exclude_unset=True))
    audit.record(session, "REMEDIATION_ACTION_UPDATE", f"{inc_svc.incident_ref(incident)} action #{action.id}", user, request)
    return inc_svc.incident_out(session, incident, user)


class CompleteIn(BaseModel):
    note: str = ""


@router.post("/incidents/{incident_id}/actions/{action_id}/complete")
def complete_action(incident_id: int, action_id: int, body: CompleteIn, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(view)):
    """§6.2 step 4: the action's owner (any role) marks it Completed."""
    incident = _get_incident(session, incident_id)
    action = inc_svc.complete_action(session, incident, _get_action(session, incident, action_id), user, body.note)
    audit.record(session, "REMEDIATION_ACTION_COMPLETE", f"{inc_svc.incident_ref(incident)} action #{action.id}", user, request)
    return inc_svc.incident_out(session, session.get(Issue, incident_id), user)


# ---- read models for Participant 360, Reports and Dashboard -------------------

@router.get("/dashboard")
def dashboard(days: int = 30, session: Session = Depends(get_session), _: User = Depends(view)):
    """§15.1 Compliance dashboard widgets."""
    return svc.dashboard_summary(session, max(1, min(days, 366)))


@router.get("/participants/{participant_id}")
def participant_status(participant_id: int, months: int = 12, session: Session = Depends(get_session), _: User = Depends(view)):
    """REQ-P360-005 compliance status, with REQ-COMP-008 failure rate and
    deadline adherence."""
    if session.get(Participant, participant_id) is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    out = svc.participant_compliance(session, participant_id)
    out["failure_rate"] = svc.failure_rate(session, participant_id, months)
    out["adherence"] = svc.adherence_rate(session, participant_id, months)
    return out


@router.get("/participants/{participant_id}/history")
def participant_history(participant_id: int, session: Session = Depends(get_session), _: User = Depends(view)):
    """REQ-COMP-009, oldest first."""
    if session.get(Participant, participant_id) is None:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return svc.history(session, participant_id)


@router.get("/failure-rates")
def failure_rates(months: int = 12, session: Session = Depends(get_session), _: User = Depends(view)):
    """REQ-COMP-008 per participant over a rolling window (default 12 months)."""
    return svc.failure_rates(session, max(1, min(months, 60)))


@router.get("/reports/summary")
def summary_report(participant_id: Optional[int] = None, institution_type: Optional[str] = None, status: Optional[str] = None,
                   date_from: Optional[str] = None, date_to: Optional[str] = None, session: Session = Depends(get_session),
                   _: User = Depends(view)):
    """§14.1 Compliance Summary rows (the Reports module renders them)."""
    return svc.summary_rows(session, {"participant_id": participant_id, "institution_type": institution_type, "status": status,
                                      "date_from": _date(date_from, "date_from"), "date_to": _date(date_to, "date_to")})


@router.get("/reports/incidents")
def incident_report(participant_id: Optional[int] = None, severity: Optional[str] = None, status: Optional[str] = None,
                    date_from: Optional[str] = None, date_to: Optional[str] = None, session: Session = Depends(get_session),
                    _: User = Depends(view)):
    """§14.5 Incident Report rows."""
    if severity and severity not in [s.value for s in IssueSeverity]:
        raise validation_error([problem("severity", "allowed_values", "Severity must be Low, Medium, High or Critical.")])
    if status and status not in [s.value for s in inc_svc.STATUSES]:
        raise validation_error([problem("status", "allowed_values", "Not an incident status.")])
    return svc.incident_rows(session, {"participant_id": participant_id, "severity": severity, "status": status,
                                       "date_from": _date(date_from, "date_from"), "date_to": _date(date_to, "date_to")})
