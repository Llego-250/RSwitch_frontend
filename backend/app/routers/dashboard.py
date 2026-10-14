"""Role-aware dashboard API (SRS §5.2 REQ-DASH-001..010, §15, §17.1 "Dashboard
data refresh < 3 seconds"). Everyone has dashboard.view; what the payload
contains follows the signed-in user's role (app.services.dashboard)."""

import json
import time
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.db import get_session
from app.models.user import User
from app.services import dashboard as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

view = require_cap("dashboard.view")


def _inputs(session: Session, participant_id, institution_type, region, status, date_from, date_to, risk, widgets):
    try:
        options = json.loads(widgets) if widgets else {}
    except ValueError:
        raise validation_error([problem("widgets", "format", "Widget settings must be a JSON object.")])
    try:
        filters = svc.clean_filters(session, {
            "participant_id": participant_id, "institution_type": institution_type, "region": region, "status": status,
            "date_from": date_from, "date_to": date_to, "risk": risk,
        })
        return filters, svc.clean_options(options if isinstance(options, dict) else {})
    except svc.DashboardError as exc:
        raise validation_error([problem(exc.field, "invalid", exc.message)])


@router.get("")
def dashboard(
    participant_id: Optional[int] = None,
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    status: Optional[str] = Query(None, description="Participant status: Active | Inactive | Suspended"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    risk: Optional[str] = Query(None, description="Risk category: Low | Medium | High | Insufficient data"),
    widgets: Optional[str] = Query(None, description='Per-widget settings, JSON: {"upcoming_deadlines": {"period": 90}}'),
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    """The signed-in role's §15 widgets plus the common sections (attention
    queue, integration health, upcoming deadlines, recent activity), all
    computed for the filters and each widget's period and scope."""
    started = time.perf_counter()
    filters, options = _inputs(session, participant_id, institution_type, region, status, date_from, date_to, risk, widgets)
    out = svc.build(session, user, filters, options)
    out["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
    return out


@router.get("/options")
def options(session: Session = Depends(get_session), _: User = Depends(view)):
    """Values the DASH-009 filters offer."""
    return svc.filter_options(session)


@router.get("/widgets/{key}")
def widget(
    key: str,
    period: Optional[str] = None,
    scope: Optional[str] = None,
    participant_id: Optional[int] = None,
    institution_type: Optional[str] = None,
    region: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    risk: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    """One widget of the user's dashboard with its own period/scope
    (DASH-010) — a widget outside the user's dashboard is not found."""
    role = svc.role_of(user)
    if key not in svc.ROLE_WIDGETS[role] and key not in svc.COMMON_SECTIONS:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    settings = json.dumps({key: {k: v for k, v in (("period", period), ("scope", scope)) if v is not None}})
    filters, opts = _inputs(session, participant_id, institution_type, region, status, date_from, date_to, risk, settings)
    return svc.build(session, user, filters, opts, only=key)["data"][key]
