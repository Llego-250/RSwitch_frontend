import csv
import io
import re
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.permissions import require_admin, require_staff
from app.core.security import hash_password
from app.db import get_session
from app.models.admin import AuditEvent
from app.models.enums import UserRole
from app.models.user import User
from app.services import audit

router = APIRouter(tags=["users"])

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "mfa_enabled": u.mfa_enabled,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
    }


@router.get("/users")
def list_users(session: Session = Depends(get_session), _: User = Depends(require_admin)):
    return [_out(u) for u in session.exec(select(User).order_by(User.created_at.desc())).all()]


@router.post("/users")
def create_user(
    request: Request,
    email: str = Body(...),
    full_name: str = Body(...),
    role: UserRole = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """No mail server is configured, so the one-time password is returned to
    the admin to hand over; the user should change it at first login."""
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists")
    if role == UserRole.participant:
        raise HTTPException(status_code=422, detail="Participant institutions don't have RDIP logins")
    temp_password = secrets.token_urlsafe(12)
    user = User(
        email=email,
        full_name=full_name.strip(),
        role=role,
        hashed_password=hash_password(temp_password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    audit.record(session, "USER_CREATE", f"{email} ({role.value})", admin, request)
    return {**_out(user), "temporary_password": temp_password}


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    request: Request,
    role: Optional[UserRole] = Body(None),
    is_active: Optional[bool] = Body(None),
    full_name: Optional[str] = Body(None),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and (is_active is False or (role and role != UserRole.technical)):
        raise HTTPException(status_code=400, detail="You can't demote or deactivate your own account")
    changes = []
    if role is not None and role != user.role:
        if role == UserRole.participant:
            raise HTTPException(status_code=422, detail="Participant institutions don't have RDIP logins")
        changes.append(f"role {user.role.value} → {role.value}")
        user.role = role
    if is_active is not None and is_active != user.is_active:
        changes.append("activated" if is_active else "deactivated")
        user.is_active = is_active
    if full_name:
        user.full_name = full_name.strip()
    session.add(user)
    session.commit()
    if changes:
        audit.record(session, "USER_UPDATE", f"{user.email}: {', '.join(changes)}", admin, request,
                     status="WARNING" if "deactivated" in changes else "SUCCESS")
    return _out(user)


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, request: Request, session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    temp_password = secrets.token_urlsafe(12)
    user.hashed_password = hash_password(temp_password)
    user.mfa_enabled = False
    user.mfa_secret = None
    session.add(user)
    session.commit()
    audit.record(session, "PASSWORD_RESET", user.email, admin, request, status="WARNING")
    return {"temporary_password": temp_password}


def _audit_query(q: Optional[str], action: Optional[str], status: Optional[str]):
    query = select(AuditEvent).order_by(AuditEvent.timestamp.desc())
    if action:
        query = query.where(AuditEvent.action == action)
    if status:
        query = query.where(AuditEvent.status == status)
    if q:
        like = f"%{q}%"
        query = query.where(
            AuditEvent.actor_email.ilike(like) | AuditEvent.resource.ilike(like) | AuditEvent.action.ilike(like)
        )
    return query


@router.get("/audit")
def list_audit(
    q: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(200, le=1000),
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
):
    return session.exec(_audit_query(q, action, status).limit(limit)).all()


@router.get("/audit/export")
def export_audit(
    request: Request,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
):
    rows = session.exec(_audit_query(q, None, None)).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["timestamp", "actor_email", "actor_name", "actor_role", "action", "resource", "ip_address", "status"])
    for r in rows:
        writer.writerow([r.timestamp.isoformat(), r.actor_email, r.actor_name, r.actor_role, r.action, r.resource, r.ip_address, r.status])
    audit.record(session, "AUDIT_EXPORT", f"{len(rows)} events", user, request)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit_log_{datetime.utcnow():%Y%m%d}.csv"'},
    )
