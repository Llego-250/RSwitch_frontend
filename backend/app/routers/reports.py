from datetime import date, datetime
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.permissions import require_staff
from app.db import get_session
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import UNRESOLVED_INCIDENT_STATUSES, IntegrationStatus, IssueSeverity, SubmissionResult
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.models.admin import ReportRun, ReportSchedule
from app.services import audit, inclusion, reporting
from app.services.compliance import document_status
from app.storage import get_file

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview")
def overview(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    """Plain counts for a board-level glance — no charts."""
    participants = session.exec(select(Participant)).all()
    integrations = session.exec(select(Integration)).all()
    open_issues = session.exec(
        select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))
    ).all()
    doc_types = session.exec(select(RequiredDocumentType)).all()
    docs = session.exec(select(ComplianceDocument)).all()

    docs_by_participant: dict[int, dict[int, ComplianceDocument]] = {}
    for doc in docs:
        docs_by_participant.setdefault(doc.participant_id, {})[doc.doc_type_id] = doc

    docs_needing_attention = 0
    for participant in participants:
        participant_docs = docs_by_participant.get(participant.id, {})
        for doc_type in doc_types:
            doc = participant_docs.get(doc_type.id)
            status = "Missing" if doc is None else document_status(doc)
            if status != "On File":
                docs_needing_attention += 1

    severity_counts = {sv.value: sum(1 for i in open_issues if i.severity == sv) for sv in IssueSeverity}

    return {
        "participants_total": len(participants),
        "participants_connected": sum(1 for i in integrations if i.status == IntegrationStatus.connected),
        "participants_degraded_or_worse": sum(
            1 for i in integrations if i.status in (IntegrationStatus.degraded, IntegrationStatus.disconnected)
        ),
        "documents_needing_attention": docs_needing_attention,
        "open_issues_total": len(open_issues),
        "open_issues_by_severity": severity_counts,
    }


@router.get("/export")
def export_report(
    request: Request,
    report: str = Query(..., description="submission_history | integration_status | compliance_status | issues | inclusion"),
    participant_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    format: str = Query("xlsx", pattern="^(xlsx|pdf)$"),
    session: Session = Depends(get_session),
    user: User = Depends(require_staff),
):
    if report not in reporting.REPORTS:
        raise HTTPException(status_code=422, detail="Unknown report")
    run, data = reporting.generate(session, report, format, user.full_name or user.email, participant_id, date_from, date_to)
    audit.record(session, "REPORT_GENERATE", f"{run.filename}", user, request)
    return StreamingResponse(
        iter([data]),
        media_type=reporting.MEDIA[format],
        headers={"Content-Disposition": f'attachment; filename="{run.filename}"', "X-Report-Run-Id": str(run.id)},
    )


@router.get("/history", response_model=list[ReportRun])
def report_history(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return session.exec(select(ReportRun).order_by(ReportRun.generated_at.desc()).limit(200)).all()


@router.get("/history/{run_id}/download")
def download_run(run_id: int, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    run = session.get(ReportRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Report not found")
    return StreamingResponse(
        iter([get_file(run.storage_key)]),
        media_type=reporting.MEDIA[run.format],
        headers={"Content-Disposition": f'attachment; filename="{run.filename}"'},
    )


@router.delete("/history/{run_id}")
def delete_run(run_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    run = session.get(ReportRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Report not found")
    session.delete(run)
    session.commit()
    audit.record(session, "REPORT_DELETE", run.filename, user, request, status="WARNING")
    return {"ok": True}


@router.get("/schedules", response_model=list[ReportSchedule])
def list_schedules(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return session.exec(select(ReportSchedule).order_by(ReportSchedule.created_at)).all()


@router.post("/schedules", response_model=ReportSchedule)
def create_schedule(
    request: Request,
    name: str = Body(...),
    report: str = Body(...),
    format: str = Body("pdf"),
    frequency: str = Body("Monthly"),
    recipient: str = Body(""),
    session: Session = Depends(get_session),
    user: User = Depends(require_staff),
):
    if report not in reporting.REPORTS or format not in reporting.MEDIA or frequency not in FREQUENCIES:
        raise HTTPException(status_code=422, detail="Invalid report, format or frequency")
    schedule = ReportSchedule(
        name=name.strip() or reporting.REPORTS[report], report=report, format=format,
        frequency=frequency, recipient=recipient.strip(), created_by=user.full_name or user.email,
    )
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    audit.record(session, "REPORT_SCHEDULE_CREATE", f"{schedule.name} ({frequency})", user, request)
    return schedule


@router.patch("/schedules/{schedule_id}", response_model=ReportSchedule)
def toggle_schedule(
    schedule_id: int,
    active: bool = Body(..., embed=True),
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    schedule = session.get(ReportSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.active = active
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return schedule


@router.post("/schedules/{schedule_id}/run", response_model=ReportRun)
def run_schedule_now(schedule_id: int, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    schedule = session.get(ReportSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return run_schedule(session, schedule)


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    schedule = session.get(ReportSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    session.delete(schedule)
    session.commit()
    audit.record(session, "REPORT_SCHEDULE_DELETE", schedule.name, user, request)
    return {"ok": True}


@router.get("/inclusion")
def inclusion_summary(months: int = 6, session: Session = Depends(get_session), _: User = Depends(require_staff)):
    return inclusion.summary(session, months)


@router.get("/trends")
def trends(months: int = Query(6, ge=1, le=24), session: Session = Depends(get_session), _: User = Depends(require_staff)):
    """Monthly series for the board dashboard. Every figure is derived from
    real rows — nothing here is fabricated at read time (the demo seed data
    it runs against, on the other hand, is synthetic — see seed_demo.py)."""
    now = datetime.utcnow()
    month_starts = [
        (now.replace(day=1) - relativedelta(months=offset)) for offset in range(months - 1, -1, -1)
    ]
    month_keys = [d.strftime("%Y-%m") for d in month_starts]

    submissions = session.exec(select(Submission)).all()
    participants = session.exec(select(Participant)).all()
    issues = session.exec(select(Issue)).all()

    by_month = {key: {"submissions_total": 0, "submissions_passed": 0, "volume": 0.0} for key in month_keys}
    for submission in submissions:
        key = submission.uploaded_at.strftime("%Y-%m")
        if key not in by_month:
            continue
        by_month[key]["submissions_total"] += 1
        if submission.result == SubmissionResult.passed:
            by_month[key]["submissions_passed"] += 1
            by_month[key]["volume"] += submission.numeric_totals.get("amount", 0)

    new_participants_by_month = {key: 0 for key in month_keys}
    for participant in participants:
        key = participant.created_at.strftime("%Y-%m")
        if key in new_participants_by_month:
            new_participants_by_month[key] += 1

    issues_by_month = {key: 0 for key in month_keys}
    for issue in issues:
        key = issue.created_at.strftime("%Y-%m")
        if key in issues_by_month:
            issues_by_month[key] += 1

    participants_before = sum(
        1 for p in participants if p.created_at.strftime("%Y-%m") < month_keys[0]
    )
    cumulative = participants_before
    series = []
    for key in month_keys:
        month_data = by_month[key]
        total = month_data["submissions_total"]
        passed = month_data["submissions_passed"]
        cumulative += new_participants_by_month[key]
        series.append(
            {
                "month": key,
                "submissions_total": total,
                "submissions_passed": passed,
                "on_time_rate": round(passed / total, 3) if total else None,
                "volume": round(month_data["volume"], 2),
                "new_participants": new_participants_by_month[key],
                "cumulative_participants": cumulative,
                "issues_raised": issues_by_month[key],
            }
        )
    return series


FREQUENCIES = {"Daily": relativedelta(days=1), "Weekly": relativedelta(weeks=1), "Monthly": relativedelta(months=1)}


def run_schedule(session: Session, schedule: ReportSchedule) -> ReportRun:
    run, _ = reporting.generate(session, schedule.report, schedule.format, f"Schedule: {schedule.name}", schedule_id=schedule.id)
    schedule.last_run_at = datetime.utcnow()
    session.add(schedule)
    session.commit()
    session.refresh(run)
    return run


def run_due_schedules(session: Session) -> int:
    count = 0
    for schedule in session.exec(select(ReportSchedule).where(ReportSchedule.active == True)).all():  # noqa: E712
        due = schedule.last_run_at is None or schedule.last_run_at + FREQUENCIES[schedule.frequency] <= datetime.utcnow()
        if due:
            run_schedule(session, schedule)
            count += 1
    return count
