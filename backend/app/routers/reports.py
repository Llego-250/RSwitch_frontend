import io
from datetime import date, datetime
from typing import Optional

import pandas as pd
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from fpdf import FPDF
from sqlmodel import Session, select

from app.core.permissions import require_staff
from app.db import get_session
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import IntegrationStatus, IssueSeverity, IssueStatus, SubmissionResult
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services.compliance import document_status

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview")
def overview(session: Session = Depends(get_session), _: User = Depends(require_staff)):
    """Plain counts for a board-level glance — no charts."""
    participants = session.exec(select(Participant)).all()
    integrations = session.exec(select(Integration)).all()
    open_issues = session.exec(
        select(Issue).where(Issue.status.in_([IssueStatus.open, IssueStatus.in_progress]))
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
    report: str = Query(..., description="submission_history | integration_status | compliance_status | issues"),
    participant_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    format: str = Query("xlsx", pattern="^(xlsx|pdf)$"),
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    rows, columns = _report_rows(session, report, participant_id, date_from, date_to)
    if format == "xlsx":
        return _to_xlsx(rows, columns, report)
    return _to_pdf(rows, columns, report)


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


def _report_rows(session, report, participant_id, date_from, date_to):
    if report == "submission_history":
        query = select(Submission)
        if participant_id:
            query = query.where(Submission.participant_id == participant_id)
        if date_from:
            query = query.where(Submission.uploaded_at >= date_from)
        if date_to:
            query = query.where(Submission.uploaded_at <= date_to)
        rows = session.exec(query).all()
        columns = ["participant_id", "period", "filename", "uploaded_at", "uploaded_by", "result", "error_count"]
    elif report == "integration_status":
        rows = session.exec(select(Integration)).all()
        if participant_id:
            rows = [r for r in rows if r.participant_id == participant_id]
        columns = ["participant_id", "status", "note", "source", "updated_at", "updated_by"]
    elif report == "compliance_status":
        rows = session.exec(select(ComplianceDocument)).all()
        if participant_id:
            rows = [r for r in rows if r.participant_id == participant_id]
        columns = ["participant_id", "doc_type_id", "filename", "expiry_date"]
    else:
        query = select(Issue)
        if participant_id:
            query = query.where(Issue.participant_id == participant_id)
        rows = session.exec(query).all()
        columns = ["participant_id", "description", "severity", "assignee", "status", "due_date"]
    return rows, columns


def _to_xlsx(rows, columns, report_name):
    data = [{col: getattr(r, col, "") for col in columns} for r in rows]
    df = pd.DataFrame(data, columns=columns)
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={report_name}.xlsx"},
    )


def _to_pdf(rows, columns, report_name):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 8, report_name.replace("_", " ").title(), ln=True)
    pdf.set_font("Helvetica", size=8)
    for row in rows:
        line = " | ".join(str(getattr(row, col, "")) for col in columns)
        pdf.multi_cell(0, 6, line)
    buffer = io.BytesIO(pdf.output())
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={report_name}.pdf"},
    )
