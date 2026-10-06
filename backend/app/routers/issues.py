from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.core.permissions import require_staff
from app.core.security import get_current_user
from app.db import get_session
from app.models.enums import IssueSeverity, IssueStatus
from app.models.issue import Issue
from app.models.user import User
from app.services import audit

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("", response_model=list[Issue])
def list_issues(
    participant_id: Optional[int] = None,
    severity: Optional[IssueSeverity] = None,
    status: Optional[IssueStatus] = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    query = select(Issue)
    if participant_id is not None:
        query = query.where(Issue.participant_id == participant_id)
    if severity is not None:
        query = query.where(Issue.severity == severity)
    if status is not None:
        query = query.where(Issue.status == status)
    return session.exec(query).all()


@router.get("/mine", response_model=list[Issue])
def my_issues(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    name = current_user.full_name or current_user.email
    return session.exec(select(Issue).where(Issue.assignee == name)).all()


@router.post("", response_model=Issue)
def create_issue(issue: Issue, request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    session.add(issue)
    session.commit()
    session.refresh(issue)
    audit.record(session, "ISSUE_CREATE", f"ISS-{issue.id}: {issue.description}", user, request)
    return issue


@router.patch("/{issue_id}", response_model=Issue)
def update_issue(
    issue_id: int, updates: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_staff)
):
    issue = session.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    for key, value in updates.items():
        if hasattr(issue, key):
            setattr(issue, key, value)
    session.add(issue)
    session.commit()
    session.refresh(issue)
    audit.record(session, "ISSUE_UPDATE", f"ISS-{issue.id}: {', '.join(f'{k}={v}' for k, v in updates.items())}", user, request)
    return issue
