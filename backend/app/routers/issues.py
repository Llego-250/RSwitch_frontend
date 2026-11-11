"""/issues — the original incident endpoints, kept for pages that still read
them. Rows carry the old fields (description, severity, assignee, status,
due_date, notes, created_at) plus the §10.4 ones; statuses are the SRS §9.4
words. Writes go through the same workflow rules as /compliance/incidents
(app.services.incidents), which new code should use."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.permissions import require_cap
from app.db import get_session
from app.models.enums import IssueSeverity, IssueStatus
from app.models.issue import Issue, RemediationAction
from app.models.user import User
from app.services import audit, incidents
from app.services.compliance import Lookups
from app.services.notify import user_by_name_or_email

router = APIRouter(prefix="/issues", tags=["Incidents (legacy)"])

view = require_cap("compliance.view")
manage = require_cap("compliance.manage")


@router.get("")
def list_issues(
    participant_id: Optional[int] = None,
    severity: Optional[IssueSeverity] = None,
    status: Optional[IssueStatus] = None,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    query = select(Issue).order_by(Issue.created_at.desc(), Issue.id.desc())
    if participant_id is not None:
        query = query.where(Issue.participant_id == participant_id)
    if severity is not None:
        query = query.where(Issue.severity == severity)
    if status is not None:
        query = query.where(Issue.status == status)
    lk = Lookups(session)
    return [incidents.incident_out(session, i, user, lk) for i in session.exec(query).all()]


@router.get("/mine")
def my_issues(session: Session = Depends(get_session), user: User = Depends(view)):
    """Incidents the viewer owns or holds a remediation action on."""
    actioned = set(session.exec(select(RemediationAction.incident_id).where(RemediationAction.owner_id == user.id)).all())
    name = user.full_name or user.email
    rows = session.exec(select(Issue).order_by(Issue.created_at.desc())).all()
    lk = Lookups(session)
    return [incidents.incident_out(session, i, user, lk) for i in rows
            if i.owner_id == user.id or i.id in actioned or (i.owner_id is None and i.assignee == name)]


class LegacyIssueIn(BaseModel):
    participant_id: Optional[int] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    assignee: Optional[str] = None
    owner_id: Optional[int] = None
    incident_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    resolution_summary: Optional[str] = None


def _owner_id(session: Session, body: LegacyIssueIn) -> Optional[int]:
    if body.owner_id:
        return body.owner_id
    owner = user_by_name_or_email(session, body.assignee or "")
    return owner.id if owner else None


@router.post("", status_code=201)
def create_issue(body: LegacyIssueIn, request: Request, session: Session = Depends(get_session), user: User = Depends(manage)):
    from app.services.compliance import today_for

    incident = incidents.create(session, user, participant_id=body.participant_id, description=body.description or "",
                                severity=body.severity or "Medium", incident_date=body.incident_date or today_for(session),
                                owner_id=_owner_id(session, body), notes=body.notes or "")
    audit.record(session, "INCIDENT_CREATE", f"{incidents.incident_ref(incident)}: {incident.description[:80]}", user, request)
    return incidents.incident_out(session, incident, user)


@router.patch("/{issue_id}")
def update_issue(issue_id: int, body: LegacyIssueIn, request: Request, session: Session = Depends(get_session),
                 user: User = Depends(view)):
    incident = session.get(Issue, issue_id)
    if not incident:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    data = body.model_dump(exclude_unset=True)
    data.pop("participant_id", None)
    if "assignee" in data:
        data["owner_id"] = _owner_id(session, body)
        data.pop("assignee")
    incident = incidents.update(session, incident, user, data)
    audit.record(session, "INCIDENT_UPDATE", f"{incidents.incident_ref(incident)}: {', '.join(sorted(data)) or 'no change'}", user, request)
    return incidents.incident_out(session, incident, user)
