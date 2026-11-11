"""Reports API (SRS §5.11, §14, §19.6): the report catalogue, on-demand
generation (queued, §17.3), the report history and downloads, recurring
schedules and saved filter templates.

Everyone has reports.view (§12.1); which report types a user may generate or
only view is decided per report by §14 (app.services.reporting)."""

from datetime import date, datetime
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import FORBIDDEN, has_cap, require_cap
from app.db import get_session
from app.models.admin import ReportRun, ReportSchedule, ReportTemplate
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import REGIONS, UNRESOLVED_INCIDENT_STATUSES, InstitutionType, IntegrationStatus, IssueSeverity, SubmissionResult
from app.models.governance import GovernanceCommittee
from app.models.integration import Integration, IntegrationMode
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import audit, inclusion, reporting
from app.services.compliance import document_status
from app.services.reporting import run_due_schedules  # noqa: F401 — the scheduler's entry point

router = APIRouter(prefix="/reports", tags=["Reports"])

view = require_cap("reports.view")
schedule_cap = require_cap("reports.schedule")

NOT_FOUND = "The requested record could not be found."


def _who(user: User) -> str:
    return user.full_name or user.email


def _forbidden() -> HTTPException:
    return HTTPException(status_code=403, detail=FORBIDDEN)


def _report_key(key: str, field: str = "report") -> str:
    if key not in reporting.REPORT_TYPES:
        raise validation_error([problem(field, "allowed_values",
                                        f"Report must be one of: {', '.join(reporting.REPORT_TYPES)}.")])
    return key


def _format(fmt: str) -> str:
    if fmt not in reporting.MEDIA:
        raise validation_error([problem("format", "allowed_values", "Format must be pdf, xlsx or csv.")])
    return fmt


def _filters(session: Session, key: str, raw: Optional[dict]) -> dict:
    try:
        return reporting.clean_filters(session, key, raw)
    except reporting.FilterError as exc:
        raise validation_error([problem(f"filters.{exc.field}", "invalid", exc.message)])


# ---- catalogue -------------------------------------------------------------------

@router.get("/types")
def report_types(session: Session = Depends(get_session), user: User = Depends(view)):
    """The six §14 report types with their columns, filters (and options) and
    what this user may do with each; plus the option lists for the filters."""
    types = []
    for rt in reporting.REPORT_TYPES.values():
        types.append({
            "key": rt.key, "name": rt.name, "section": rt.section, "purpose": rt.purpose,
            "columns": [c.header for c in rt.columns], "filters": list(rt.filters),
            "status_label": rt.status_label, "status_options": list(rt.status_options), "date_basis": rt.date_basis,
            "note": rt.note, "formats": reporting.FORMATS,
            "generate_roles": sorted(r.value for r in rt.generate), "view_roles": sorted(r.value for r in rt.view),
            "can_generate": reporting.can_generate(user, rt.key), "can_view": reporting.can_view(user, rt.key),
            "can_schedule": reporting.can_generate(user, rt.key) and has_cap(user, "reports.schedule"),
        })
    participants = session.exec(select(Participant).order_by(Participant.name)).all()
    committees = session.exec(select(GovernanceCommittee).order_by(GovernanceCommittee.name)).all()
    return {
        "types": types,
        "frequencies": list(reporting.FREQUENCIES),
        "delivery_hour": reporting.DELIVERY_HOUR,
        "filter_labels": reporting.FILTER_LABELS,
        "options": {
            "participants": [{"id": p.id, "name": p.name, "code": p.code, "type": p.type, "region": p.region,
                              "status": p.status} for p in participants],
            "institution_types": [t.value for t in InstitutionType],
            "regions": REGIONS,
            "risk_levels": list(reporting.RISK_LEVELS),
            "integration_types": [m.value for m in IntegrationMode],
            "severities": [s.value for s in IssueSeverity],
            "committees": [{"id": c.id, "name": c.name} for c in committees],
        },
    }


# ---- schedules (REQ-RPT-005, §19.6) ------------------------------------------------

class ScheduleIn(BaseModel):
    name: str = ""
    report: str
    format: str = "pdf"
    frequency: str = "Monthly"
    filters: dict = {}
    start_date: Optional[str] = None  # first delivery (default: the next 06:00)


@router.get("/schedules")
def list_schedules(include_cancelled: bool = False, session: Session = Depends(get_session), user: User = Depends(view)):
    """The signed-in user's own schedules — each is delivered to whoever set
    it up (§13)."""
    query = select(ReportSchedule).where(ReportSchedule.created_by_id == user.id)
    if not include_cancelled:
        query = query.where(ReportSchedule.active == True)  # noqa: E712
    return [reporting.schedule_out(session, s) for s in session.exec(query.order_by(ReportSchedule.created_at.desc())).all()]


@router.post("/schedules", status_code=201)
def create_schedule(body: ScheduleIn, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(schedule_cap)):
    key = _report_key(body.report)
    if not reporting.can_generate(user, key):
        raise _forbidden()
    fmt = _format(body.format)
    if body.frequency not in reporting.FREQUENCIES:
        raise validation_error([problem("frequency", "allowed_values", "Frequency must be Daily, Weekly or Monthly.")])
    filters = _filters(session, key, body.filters)
    start: Optional[date] = None
    if body.start_date:
        try:
            start = date.fromisoformat(body.start_date[:10])
        except ValueError:
            raise validation_error([problem("start_date", "format", "Use a date like 2026-10-31.")])
        from app.services.governance_jobs import org_today

        if start < org_today(session):
            raise validation_error([problem("start_date", "min", "The first delivery can't be in the past.")])
    slot = reporting.first_slot(session, start)
    schedule = ReportSchedule(
        name=(body.name.strip() or reporting.default_name(session, key, filters))[:160], report=key, format=fmt,
        frequency=body.frequency, filters=filters, created_by=_who(user), created_by_id=user.id,
        start_at=slot, next_run_at=slot,
    )
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    audit.record(session, "REPORT_SCHEDULE_CREATE", f"{schedule.name} ({schedule.frequency}, {fmt})", user, request)
    return reporting.schedule_out(session, schedule)


@router.delete("/schedules/{schedule_id}")
def cancel_schedule(schedule_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(view)):
    """§19.6 cancel: the schedule stops; its past runs stay in history."""
    schedule = session.get(ReportSchedule, schedule_id)
    if schedule is None or schedule.created_by_id != user.id:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if not schedule.active:
        raise HTTPException(status_code=409, detail="This schedule is already cancelled.")
    schedule.active, schedule.cancelled_at, schedule.cancelled_by = False, datetime.utcnow(), _who(user)
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    audit.record(session, "REPORT_SCHEDULE_CANCEL", schedule.name, user, request)
    return reporting.schedule_out(session, schedule)


# ---- saved filter templates (REQ-RPT-006) ----------------------------------------------

class TemplateIn(BaseModel):
    name: str
    report: str
    filters: dict = {}
    format: str = "pdf"
    shared: bool = False


def _template_out(t: ReportTemplate, user: User) -> dict:
    return {"id": t.id, "name": t.name, "report": t.report, "filters": t.filters or {}, "format": t.format,
            "shared": t.shared, "owner_id": t.owner_id, "owner_name": t.owner_name, "mine": t.owner_id == user.id,
            "created_at": t.created_at, "updated_at": t.updated_at}


@router.get("/templates")
def list_templates(report: Optional[str] = None, session: Session = Depends(get_session), user: User = Depends(view)):
    """The user's own templates and those shared with everyone, for report
    types the user may generate."""
    query = select(ReportTemplate).where((ReportTemplate.owner_id == user.id) | (ReportTemplate.shared == True))  # noqa: E712
    if report:
        query = query.where(ReportTemplate.report == report)
    rows = session.exec(query.order_by(ReportTemplate.name)).all()
    return [_template_out(t, user) for t in rows if reporting.can_generate(user, t.report)]


@router.post("/templates", status_code=201)
def create_template(body: TemplateIn, request: Request, session: Session = Depends(get_session), user: User = Depends(view)):
    key = _report_key(body.report)
    if not reporting.can_generate(user, key):
        raise _forbidden()
    name = body.name.strip()
    if not name or len(name) > 100:
        raise validation_error([problem("name", "length", "Give the template a name of up to 100 characters.")])
    clash = session.exec(select(ReportTemplate.id).where(ReportTemplate.owner_id == user.id, ReportTemplate.report == key,
                                                         ReportTemplate.name == name)).first()
    if clash is not None:
        raise HTTPException(status_code=409, detail="You already have a template with this name for this report.")
    template = ReportTemplate(name=name, report=key, filters=_filters(session, key, body.filters), format=_format(body.format),
                              owner_id=user.id, owner_name=_who(user), shared=body.shared)
    session.add(template)
    session.commit()
    session.refresh(template)
    audit.record(session, "REPORT_TEMPLATE_CREATE", f"{name} ({reporting.REPORTS[key]}{', shared' if body.shared else ''})",
                 user, request)
    return _template_out(template, user)


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(view)):
    template = session.get(ReportTemplate, template_id)
    if template is None or (template.owner_id != user.id and not template.shared):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if template.owner_id != user.id:
        raise _forbidden()
    session.delete(template)
    session.commit()
    audit.record(session, "REPORT_TEMPLATE_DELETE", template.name, user, request)
    return {"ok": True}


# ---- board-level summaries used by other pages -------------------------------------------

@router.get("/overview")
def overview(session: Session = Depends(get_session), _: User = Depends(view)):
    """Plain counts for a board-level glance — no charts."""
    participants = session.exec(select(Participant)).all()
    integrations = session.exec(select(Integration)).all()
    open_issues = session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all()
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(select(ComplianceDocument)).all()
    docs_by_participant: dict[int, dict[int, ComplianceDocument]] = {}
    for doc in docs:
        docs_by_participant.setdefault(doc.participant_id, {})[doc.doc_type_id] = doc
    needing_attention = 0
    for participant in participants:
        mine = docs_by_participant.get(participant.id, {})
        for doc_type in doc_types:
            doc = mine.get(doc_type.id)
            if doc is None or document_status(doc) != "On File":
                needing_attention += 1
    return {
        "participants_total": len(participants),
        "participants_connected": sum(1 for i in integrations if i.status == IntegrationStatus.healthy),
        "participants_degraded_or_worse": sum(1 for i in integrations if i.status in (IntegrationStatus.warning, IntegrationStatus.failed)),
        "documents_needing_attention": needing_attention,
        "open_issues_total": len(open_issues),
        "open_issues_by_severity": {sv.value: sum(1 for i in open_issues if i.severity == sv) for sv in IssueSeverity},
    }


@router.get("/inclusion")
def inclusion_summary(months: int = 6, session: Session = Depends(get_session), _: User = Depends(view)):
    return inclusion.summary(session, months)


@router.get("/trends")
def trends(months: int = Query(6, ge=1, le=24), session: Session = Depends(get_session), _: User = Depends(view)):
    """Monthly series derived from real rows (submissions, participants,
    incidents)."""
    now = datetime.utcnow()
    month_keys = [(now.replace(day=1) - relativedelta(months=o)).strftime("%Y-%m") for o in range(months - 1, -1, -1)]
    by_month = {k: {"submissions_total": 0, "submissions_passed": 0, "volume": 0.0} for k in month_keys}
    for s in session.exec(select(Submission)).all():
        k = s.uploaded_at.strftime("%Y-%m")
        if k in by_month:
            by_month[k]["submissions_total"] += 1
            if s.result == SubmissionResult.passed:
                by_month[k]["submissions_passed"] += 1
                by_month[k]["volume"] += s.numeric_totals.get("amount", 0)
    participants = session.exec(select(Participant)).all()
    new_by_month = {k: sum(1 for p in participants if p.created_at.strftime("%Y-%m") == k) for k in month_keys}
    issues = session.exec(select(Issue)).all()
    issues_by_month = {k: sum(1 for i in issues if i.created_at.strftime("%Y-%m") == k) for k in month_keys}
    cumulative = sum(1 for p in participants if p.created_at.strftime("%Y-%m") < month_keys[0])
    series = []
    for k in month_keys:
        total, passed = by_month[k]["submissions_total"], by_month[k]["submissions_passed"]
        cumulative += new_by_month[k]
        series.append({"month": k, "submissions_total": total, "submissions_passed": passed,
                       "on_time_rate": round(passed / total, 3) if total else None, "volume": round(by_month[k]["volume"], 2),
                       "new_participants": new_by_month[k], "cumulative_participants": cumulative,
                       "issues_raised": issues_by_month[k]})
    return series


# ---- history and generation (REQ-RPT-001/003/004, §19.6) -----------------------------------

class GenerateIn(BaseModel):
    report: str
    format: str = "pdf"
    filters: dict = {}
    name: str = ""
    template_id: Optional[int] = None


@router.get("")
def history(
    report: Optional[str] = None,
    status: Optional[str] = None,
    mine: bool = False,
    q: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    """§19.6 list generated reports: every run of a report type this user may
    view (§14), newest first."""
    runs = reporting.visible_runs(session, user, report=report, mine=mine, limit=500 if (status or q) else limit)
    if status:
        runs = [r for r in runs if r.status == status]
    if q:
        needle = q.lower()
        runs = [r for r in runs if needle in (r.name or "").lower() or needle in r.generated_by.lower()
                or needle in (r.filename or "").lower()]
    return [reporting.run_out(session, r, user) for r in runs[:limit]]


@router.post("/generate", status_code=202)
def generate(body: GenerateIn, request: Request, background: BackgroundTasks, session: Session = Depends(get_session),
             user: User = Depends(view)):
    """§19.6 generate: queued and rendered off the request (§17.3). Poll
    GET /reports/{id} until Completed, then download."""
    key = _report_key(body.report)
    if not reporting.can_generate(user, key):
        raise _forbidden()
    fmt = _format(body.format)
    raw = dict(body.filters or {})
    if body.template_id is not None:
        template = session.get(ReportTemplate, body.template_id)
        if template is None or template.report != key or (template.owner_id != user.id and not template.shared):
            raise validation_error([problem("template_id", "invalid", "Unknown template for this report.")])
        raw = {**(template.filters or {}), **{k: v for k, v in raw.items() if v not in (None, "")}}
    filters = _filters(session, key, raw)
    run = reporting.create_run(session, key, fmt, filters, user, name=body.name)
    audit.record(session, "REPORT_GENERATE",
                 f"RPT-{run.id:04d} {run.name} ({fmt})" + (f" [{'; '.join(reporting.describe_filters(session, key, filters))}]" if filters else ""),
                 user, request)
    background.add_task(reporting.execute, run.id)
    return reporting.run_out(session, run, user)


def _visible_run(session: Session, run_id: int, user: User) -> ReportRun:
    run = session.get(ReportRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if not reporting.can_view(user, run.report):
        raise _forbidden()
    return run


@router.get("/{run_id}")
def get_run(run_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    return reporting.run_out(session, _visible_run(session, run_id, user), user)


@router.get("/{run_id}/download")
def download(run_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(view)):
    """§19.6 download — for anyone who may view this report type (§14)."""
    run = _visible_run(session, run_id, user)
    if run.status != "Completed" or not run.storage_key:
        raise HTTPException(status_code=409, detail="This report has no file yet." if run.status in ("Queued", "Running")
                            else "This report failed to generate; generate it again.")
    data = reporting.file_of(run)
    audit.record(session, "REPORT_DOWNLOAD", f"RPT-{run.id:04d} {run.filename}", user, request)
    return StreamingResponse(iter([data]), media_type=reporting.MEDIA.get(run.format, "application/octet-stream"),
                             headers={"Content-Disposition": f'attachment; filename="{run.filename}"',
                                      "X-Report-Run-Id": str(run.id)})
