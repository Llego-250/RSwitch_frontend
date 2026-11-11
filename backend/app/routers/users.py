"""User administration (SRS §5.13, §19.7) and the audit log (§12.1 Audit
Log, REQ-SET-005). Each user-management action is audited under its own
action name (REQ-USR-006): USER_INVITE, USER_ROLE_CHANGE, USER_DEACTIVATE,
USER_REACTIVATE."""

import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import require_cap
from app.core.security import find_user_by_email, is_valid_email, normalize_email, unusable_password
from app.db import get_session
from app.models.admin import AuditEvent
from app.models.enums import UserRole
from app.models.user import ASSIGNABLE_ROLES, User
from app.services import accounts, audit, notify

router = APIRouter(tags=["Users & Audit Log"])

require_users_admin = require_cap("users.manage")


class InviteBody(BaseModel):
    email: str
    full_name: str
    role: str


class RoleBody(BaseModel):
    role: str


class UserPatch(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    is_senior: Optional[bool] = None


def _role(value: str, field: str = "role") -> UserRole:
    for role in ASSIGNABLE_ROLES:
        if value in (role.value, role.name):
            return role
    labels = ", ".join(r.value for r in ASSIGNABLE_ROLES)
    raise validation_error([problem(field, "enum", f"Choose one of: {labels}.")])


def _get(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return user


@router.get("/users")
def list_users(session: Session = Depends(get_session), _: User = Depends(require_users_admin)):
    """§19.7 / REQ-USR-005: name, email, role, status, last login."""
    return [accounts.user_out(u) for u in session.exec(select(User).order_by(User.created_at.desc())).all()]


@router.post("/users/invite")
def invite_user(body: InviteBody, request: Request, session: Session = Depends(get_session),
                admin: User = Depends(require_users_admin)):
    """REQ-USR-001/002: the account starts as Invited with no usable password;
    the emailed link (48 h, single use) lets the person set one."""
    email = normalize_email(body.email)
    name = body.full_name.strip()
    problems = []
    if not is_valid_email(email):
        problems.append(problem("email", "format", "Enter a valid email address, e.g. name@rswitch.rw."))
    if not name:
        problems.append(problem("full_name", "required", "Enter the person's full name."))
    elif len(name) > 120:
        problems.append(problem("full_name", "max_length", "Use at most 120 characters."))
    try:
        role = _role(body.role)
    except HTTPException as exc:
        problems.extend(exc.detail)
        role = None
    if problems:
        raise validation_error(problems)
    if find_user_by_email(session, email):
        raise HTTPException(status_code=409, detail="A user with this email address already exists.")
    user = User(email=email, full_name=name, role=role, hashed_password=unusable_password(), is_active=False,
                pending_invite=True, invited_at=datetime.utcnow(), invited_by=admin.email)
    session.add(user)
    session.commit()
    session.refresh(user)
    accounts.send_invitation(session, user, admin)
    audit.record(session, "USER_INVITE", f"{email} as {role.value}", admin, request)
    return accounts.user_out(user)


@router.post("/users/{user_id}/resend-invite")
def resend_invite(user_id: int, request: Request, session: Session = Depends(get_session),
                  admin: User = Depends(require_users_admin)):
    """A new link replaces any earlier one (expired or not)."""
    user = _get(session, user_id)
    if not user.pending_invite:
        raise HTTPException(status_code=409, detail="This user has already accepted their invitation.")
    user.invited_at = datetime.utcnow()
    user.invited_by = admin.email
    session.add(user)
    session.commit()
    accounts.send_invitation(session, user, admin)
    audit.record(session, "USER_INVITE", f"{user.email} (invitation resent)", admin, request)
    return accounts.user_out(user)


def _change_role(session: Session, request: Request, admin: User, user: User, role: UserRole) -> None:
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't change your own role. Ask another Technical / Admin user.")
    if role == user.role:
        return
    old = user.role
    user.role = role
    session.add(user)
    session.commit()
    audit.record(session, "USER_ROLE_CHANGE", f"{user.email}: {old.value} → {role.value}", admin, request)
    # §13 "User role changed" → affected user, email + in-app.
    notify.dispatch(
        session, "user_role_changed", [user], "Your RDIP role has changed",
        f"{admin.full_name or admin.email} changed your role from {old.value} to {role.value}. "
        "The modules you can open have changed accordingly.",
        link="/", dedupe_key=f"user_role_changed:{user.id}:{datetime.utcnow().isoformat()}",
    )


def _deactivate(session: Session, request: Request, admin: User, user: User) -> None:
    """REQ-USR-003: blocks sign-in and ends every session; the account and
    its audit history are kept."""
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account.")
    if not user.is_active and not user.pending_invite:
        return
    user.is_active = False
    user.pending_invite = False
    accounts.cut_off(session, user, "deactivated")
    session.add(user)
    session.commit()
    audit.record(session, "USER_DEACTIVATE", user.email, admin, request, status="WARNING")


def _reactivate(session: Session, request: Request, admin: User, user: User) -> None:
    """Someone who never set a password gets a fresh invitation instead."""
    if user.is_active or user.pending_invite:
        return
    never_set = not user.hashed_password.startswith("$2")
    if never_set:
        user.pending_invite = True
        user.invited_at = datetime.utcnow()
    else:
        user.is_active = True
    user.failed_attempts, user.locked_until = 0, None
    session.add(user)
    session.commit()
    if never_set:
        accounts.send_invitation(session, user, admin)
    audit.record(session, "USER_REACTIVATE", f"{user.email}{' (invitation re-sent)' if never_set else ''}", admin, request)


@router.put("/users/{user_id}/role")
def change_role(user_id: int, body: RoleBody, request: Request, session: Session = Depends(get_session),
                admin: User = Depends(require_users_admin)):
    """§19.7, REQ-AUTH-009, REQ-USR-004."""
    user = _get(session, user_id)
    _change_role(session, request, admin, user, _role(body.role))
    return accounts.user_out(user)


@router.put("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, request: Request, session: Session = Depends(get_session),
                    admin: User = Depends(require_users_admin)):
    """§19.7, REQ-USR-003."""
    user = _get(session, user_id)
    _deactivate(session, request, admin, user)
    return accounts.user_out(user)


@router.put("/users/{user_id}/reactivate")
def reactivate_user(user_id: int, request: Request, session: Session = Depends(get_session),
                    admin: User = Depends(require_users_admin)):
    user = _get(session, user_id)
    _reactivate(session, request, admin, user)
    return accounts.user_out(user)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, request: Request, session: Session = Depends(get_session),
                admin: User = Depends(require_users_admin)):
    """Name and the senior flag (escalation recipient, SRS §13); role and
    active changes go through the same audited paths as the §19.7 calls."""
    user = _get(session, user_id)
    if body.role is not None:
        _change_role(session, request, admin, user, _role(body.role))
    if body.is_active is False:
        _deactivate(session, request, admin, user)
    elif body.is_active is True:
        _reactivate(session, request, admin, user)
    changes = []
    if body.full_name is not None and body.full_name.strip() and body.full_name.strip() != user.full_name:
        user.full_name = body.full_name.strip()[:120]
        changes.append("name updated")
    if body.is_senior is not None and body.is_senior != user.is_senior:
        user.is_senior = body.is_senior
        changes.append("marked senior" if body.is_senior else "senior flag removed")
    if changes:
        session.add(user)
        session.commit()
        audit.record(session, "USER_UPDATE", f"{user.email}: {', '.join(changes)}", admin, request)
    return accounts.user_out(user)


@router.post("/users/{user_id}/reset-password")
def send_reset_link(user_id: int, request: Request, session: Session = Depends(get_session),
                    admin: User = Depends(require_users_admin)):
    """Emails the user a reset link; the admin never sees or sets the
    password, which must still satisfy the policy when the user sets it."""
    user = _get(session, user_id)
    if not user.is_active or user.pending_invite:
        raise HTTPException(status_code=409, detail="Only active accounts can be sent a password reset link.")
    accounts.send_password_reset(session, user, requested_by=admin.email)
    audit.record(session, "PASSWORD_RESET_REQUESTED", f"{user.email} (sent by administrator)", admin, request)
    return {"ok": True}


@router.post("/users/{user_id}/reset-mfa")
def reset_mfa(user_id: int, request: Request, session: Session = Depends(get_session),
              admin: User = Depends(require_users_admin)):
    """For a lost authenticator: two-factor must be enrolled again at the
    next sign-in. Ends the user's sessions and trusted devices."""
    user = _get(session, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Use your profile page to manage your own two-factor authentication.")
    user.mfa_enabled = False
    user.mfa_secret = None
    user.recovery_codes = []
    accounts.cut_off(session, user, "mfa_reset")
    session.add(user)
    session.commit()
    audit.record(session, "USER_MFA_RESET", user.email, admin, request, status="WARNING")
    return accounts.user_out(user)


@router.post("/users/{user_id}/unlock")
def unlock_user(user_id: int, request: Request, session: Session = Depends(get_session),
                admin: User = Depends(require_users_admin)):
    user = _get(session, user_id)
    user.failed_attempts, user.locked_until = 0, None
    session.add(user)
    session.commit()
    audit.record(session, "USER_UNLOCK", user.email, admin, request)
    return accounts.user_out(user)


# ---- audit log ----------------------------------------------------------------

def _parse_day(value: Optional[str], field: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise validation_error([problem(field, "date", "Use the format YYYY-MM-DD.")])


def _audit_query(q: Optional[str], action: Optional[str], status: Optional[str], actor: Optional[str],
                 date_from: Optional[str], date_to: Optional[str]):
    start, end = _parse_day(date_from, "date_from"), _parse_day(date_to, "date_to")
    if start and end and start > end:
        raise validation_error([problem("date_to", "range", "The end date must be on or after the start date.")])
    query = select(AuditEvent).order_by(AuditEvent.timestamp.desc(), AuditEvent.id.desc())
    if action:
        # "USER_*" matches every action with that prefix.
        query = query.where(AuditEvent.action.startswith(action[:-1]) if action.endswith("*") else AuditEvent.action == action)
    if status:
        query = query.where(AuditEvent.status == status)
    if actor:
        query = query.where(AuditEvent.actor_email.ilike(f"%{actor}%"))
    if start:
        query = query.where(AuditEvent.timestamp >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.where(AuditEvent.timestamp < datetime.combine(end + timedelta(days=1), datetime.min.time()))
    if q:
        like = f"%{q}%"
        query = query.where(
            AuditEvent.actor_email.ilike(like) | AuditEvent.resource.ilike(like) | AuditEvent.action.ilike(like)
            | AuditEvent.ip_address.ilike(like)
        )
    return query


@router.get("/audit-log")
def list_audit(
    q: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    actor: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
    _: User = Depends(require_cap("audit.view")),
):
    """§19.7 GET /api/audit-log with filters."""
    return session.exec(_audit_query(q, action, status, actor, date_from, date_to).offset(offset).limit(limit)).all()


@router.get("/audit-log/actions")
def audit_actions(session: Session = Depends(get_session), _: User = Depends(require_cap("audit.view"))):
    """Distinct action names, for the filter dropdown."""
    return sorted({a for a in session.exec(select(AuditEvent.action).distinct()).all() if a})


@router.get("/audit-log/export")
def export_audit(
    request: Request,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_cap("settings.manage")),
):
    """REQ-SET-005: the full audit log for a date range, as CSV."""
    rows = session.exec(_audit_query(q, action, status, None, date_from, date_to)).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "timestamp_utc", "actor_email", "actor_name", "actor_role", "action", "resource",
                     "ip_address", "user_agent", "status"])
    for r in rows:
        writer.writerow([r.id, r.timestamp.isoformat(), r.actor_email, r.actor_name, r.actor_role, r.action,
                         _csv_safe(r.resource), r.ip_address, _csv_safe(r.user_agent), r.status])
    span = f"{date_from or 'start'}_to_{date_to or 'now'}"
    audit.record(session, "AUDIT_EXPORT", f"{len(rows)} events, {span}", user, request)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="rdip_audit_log_{span}.csv"'},
    )


def _csv_safe(value: str) -> str:
    """Neutralise spreadsheet formula injection (OWASP CSV injection)."""
    return "'" + value if value and value[0] in "=+-@" else value


# Earlier paths, kept for existing clients.
router.add_api_route("/audit", list_audit, methods=["GET"], include_in_schema=False)
router.add_api_route("/audit/export", export_audit, methods=["GET"], include_in_schema=False)
