"""Report generation shared by on-demand exports and scheduled runs.
Every generated file is stored and recorded as a ReportRun (history)."""

import io
from datetime import date
from enum import Enum
from typing import Optional

import pandas as pd
from fpdf import FPDF
from sqlmodel import Session, select

from app.models.admin import ReportRun
from app.models.document import ComplianceDocument
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.storage import put_file

REPORTS = {
    "submission_history": "Submission History",
    "integration_status": "Integration Health",
    "compliance_status": "Compliance Status",
    "issues": "Issue Report",
    "inclusion": "Financial Inclusion Summary",
}

MEDIA = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


def _cell(row, col):
    value = row.get(col, "") if isinstance(row, dict) else getattr(row, col, "")
    # str(Enum member) would render as "IntegrationStatus.connected".
    return value.value if isinstance(value, Enum) else value


def report_rows(session: Session, report: str, participant_id=None, date_from=None, date_to=None):
    if report == "submission_history":
        query = select(Submission)
        if participant_id:
            query = query.where(Submission.participant_id == participant_id)
        if date_from:
            query = query.where(Submission.uploaded_at >= date_from)
        if date_to:
            query = query.where(Submission.uploaded_at <= date_to)
        rows = session.exec(query).all()
        columns = ["participant_id", "period", "filename", "uploaded_at", "uploaded_by", "result", "error_count", "review_status"]
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
    elif report == "inclusion":
        # §14.4 columns; the period filter is the reported month.
        from app.services.inclusion import report_rows as inclusion_rows

        rows, columns, _ = inclusion_rows(
            session,
            period_from=date_from.strftime("%Y-%m") if date_from else None,
            period_to=date_to.strftime("%Y-%m") if date_to else None,
        )
    else:
        query = select(Issue)
        if participant_id:
            query = query.where(Issue.participant_id == participant_id)
        rows = session.exec(query).all()
        columns = ["participant_id", "description", "severity", "assignee", "status", "due_date"]
    return rows, columns


def render(rows, columns, report: str, fmt: str) -> bytes:
    if fmt == "xlsx":
        df = pd.DataFrame([{c: _cell(r, c) for c in columns} for r in rows], columns=columns)
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False)
        return buffer.getvalue()
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 8, REPORTS.get(report, report), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=8)
    pdf.cell(0, 6, " | ".join(columns), new_x="LMARGIN", new_y="NEXT")
    for row in rows:
        line = " | ".join(str(_cell(row, c)) for c in columns)
        # Core PDF fonts are latin-1 only; replace anything else rather than 500.
        line = line.encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def generate(
    session: Session,
    report: str,
    fmt: str,
    generated_by: str,
    participant_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    schedule_id: Optional[int] = None,
) -> tuple[ReportRun, bytes]:
    rows, columns = report_rows(session, report, participant_id, date_from, date_to)
    data = render(rows, columns, report, fmt)
    suffix = ""
    if participant_id:
        p = session.get(Participant, participant_id)
        suffix = f"_{p.code}" if p else ""
    filename = f"{report}{suffix}_{date.today():%Y%m%d}.{fmt}"
    run = ReportRun(
        report=report,
        format=fmt,
        participant_id=participant_id,
        date_from=str(date_from) if date_from else None,
        date_to=str(date_to) if date_to else None,
        storage_key="",
        filename=filename,
        size_bytes=len(data),
        generated_by=generated_by,
        schedule_id=schedule_id,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    run.storage_key = f"reports/{run.id}-{filename}"
    put_file(run.storage_key, data, MEDIA[fmt])
    session.add(run)
    session.commit()
    session.refresh(run)
    return run, data
