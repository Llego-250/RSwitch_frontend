"""Financial inclusion analytics (SRS §5.10, §14.4). Everyone with
inclusion.view sees the dashboard and filters it (REQ-FIN-005); exporting the
§14.4 report is "generate", which is Business only (inclusion.manage)."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.admin import ReportRun
from app.models.user import User
from app.services import audit, inclusion
from app.services.reporting import MEDIA
from app.storage import put_file

router = APIRouter(prefix="/inclusion", tags=["inclusion"])

view = require_cap("inclusion.view")


def _bad_filter(exc: inclusion.FilterError) -> HTTPException:
    return validation_error([problem(exc.field, "invalid", exc.message)])


@router.get("/dashboard")
def dashboard(
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    period_from: Optional[str] = Query(None, description="YYYY-MM"),
    period_to: Optional[str] = Query(None, description="YYYY-MM"),
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    try:
        return inclusion.public(inclusion.dashboard(session, institution_type, region, period_from, period_to))
    except inclusion.FilterError as exc:
        raise _bad_filter(exc)


@router.get("/metrics")
def metrics(_: User = Depends(view)):
    """The metric registry (REQ-FIN-007): definitions, source columns and
    aggregation for every metric the dashboard can show."""
    return {"indicative_label": inclusion.INDICATIVE_LABEL, "metrics": inclusion.registry()}


@router.get("/export")
def export(
    request: Request,
    format: str = Query("xlsx", pattern="^(xlsx|pdf)$"),
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    period_from: Optional[str] = Query(None, description="YYYY-MM"),
    period_to: Optional[str] = Query(None, description="YYYY-MM"),
    session: Session = Depends(get_session),
    user: User = Depends(require_cap("inclusion.manage")),
):
    """REQ-FIN-008 / §14.4: PDF or Excel, kept in report history."""
    try:
        rows, columns, dash = inclusion.report_rows(session, institution_type, region, period_from, period_to)
    except inclusion.FilterError as exc:
        raise _bad_filter(exc)
    author = user.full_name or user.email
    data = inclusion.render(rows, columns, dash, format, author)
    filename = f"financial_inclusion_{date.today():%Y%m%d}.{format}"
    run = ReportRun(report="inclusion", format=format, date_from=dash["filters"]["period_from"],
                    date_to=dash["filters"]["period_to"], storage_key="", filename=filename,
                    size_bytes=len(data), generated_by=author)
    session.add(run)
    session.commit()
    session.refresh(run)
    run.storage_key = f"reports/{run.id}-{filename}"
    put_file(run.storage_key, data, MEDIA[format])
    session.add(run)
    session.commit()
    filters = ", ".join(f"{k}={v}" for k, v in dash["filters"].items() if v) or "no filters"
    audit.record(session, "REPORT_GENERATE", f"{filename} ({filters})", user, request)
    return StreamingResponse(
        iter([data]),
        media_type=MEDIA[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Report-Run-Id": str(run.id)},
    )
