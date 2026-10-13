"""Account lifecycle shared by the auth and users routers: emailed
single-use links (invitation REQ-USR-002, password reset REQ-AUTH-004) and
cutting off every way back into an account (REQ-USR-003)."""

import secrets
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.config import settings
from app.core.errors import CodedHTTPException
from app.core.security import hash_token, revoke_sessions
from app.models.admin import TrustedDevice, UserToken
from app.models.user import User
from app.services import notify
from app.services.settings_store import get_setting

INVITE = "invite"
RESET = "reset"

_LINK_PATH = {INVITE: "/accept-invite", RESET: "/reset-password"}
_NOUN = {INVITE: "invitation link", RESET: "password reset link"}
_AFTER_EXPIRY = {INVITE: "Ask your administrator to send a new invitation.", RESET: "Request a new one from the sign-in page."}


def user_out(u: User) -> dict:
    """SRS §10.5 / REQ-USR-005 view of a user."""
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "status": u.status,
        "is_active": u.is_active,
        "is_senior": u.is_senior,
        "mfa_enabled": u.mfa_enabled,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
        "invited_at": u.invited_at,
        "locked": u.is_locked,
        "locked_until": u.locked_until if u.is_locked else None,
    }


def link_url(purpose: str, token: str) -> str:
    return f"{settings.app_base_url.rstrip('/')}{_LINK_PATH[purpose]}?token={token}"


def _revoke_open_tokens(session: Session, user_id: int, purpose: str | None = None) -> None:
    query = select(UserToken).where(UserToken.user_id == user_id, UserToken.used_at == None, UserToken.revoked_at == None)  # noqa: E711
    if purpose:
        query = query.where(UserToken.purpose == purpose)
    now = datetime.utcnow()
    for row in session.exec(query).all():
        row.revoked_at = now
        session.add(row)


def issue_token(session: Session, user: User, purpose: str, lifetime: timedelta, created_by: str = "") -> tuple[UserToken, str]:
    """A fresh link supersedes any earlier unused one for the same purpose.
    Returns the row and the plaintext token (never stored)."""
    _revoke_open_tokens(session, user.id, purpose)
    token = secrets.token_urlsafe(32)
    row = UserToken(user_id=user.id, purpose=purpose, token_hash=hash_token(token), created_by=created_by,
                    expires_at=datetime.utcnow() + lifetime)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row, token


def resolve_token(session: Session, token: str, purpose: str) -> tuple[UserToken, User]:
    """The live token row and its user, or a 400 saying why not."""
    noun = _NOUN[purpose]
    row = session.exec(
        select(UserToken).where(UserToken.token_hash == hash_token(token or ""), UserToken.purpose == purpose)
    ).first()
    user = session.get(User, row.user_id) if row else None
    if row is None or user is None or row.revoked_at is not None:
        raise CodedHTTPException(400, f"This {noun} is not valid. {_AFTER_EXPIRY[purpose]}", "token_invalid")
    if row.used_at is not None:
        raise CodedHTTPException(400, f"This {noun} has already been used. {_AFTER_EXPIRY[purpose]}", "token_used")
    if row.expires_at <= datetime.utcnow():
        raise CodedHTTPException(400, f"This {noun} has expired. {_AFTER_EXPIRY[purpose]}", "token_expired")
    return row, user


def send_invitation(session: Session, user: User, invited_by: User) -> UserToken:
    """REQ-USR-001/002, §13 "New user invited": email with a 48 h link."""
    hours = int(get_setting(session, "security")["invite_link_hours"])
    row, token = issue_token(session, user, INVITE, timedelta(hours=hours), created_by=invited_by.email)
    url = link_url(INVITE, token)
    org = get_setting(session, "organization")["name"]
    body = (
        f"Hello {user.full_name or user.email},\n\n"
        f"{invited_by.full_name or invited_by.email} has invited you to RDIP, the {org} data intelligence platform, "
        f"as a {user.role.value} user.\n\n"
        f"Set your password to activate your account. The link works once and expires in {hours} hours:\n{url}\n\n"
        "After setting your password you'll be asked to set up two-factor authentication with an authenticator app.\n\n"
        "— RSwitch Data Intelligence Platform"
    )
    notify.dispatch(session, "user_invited", [user.email], "You're invited to RDIP", body,
                    dedupe_key=f"user_invited:{row.id}", email_subject="[RDIP] You're invited to RDIP", email_body=body)
    return row


def send_password_reset(session: Session, user: User, requested_by: str = "") -> UserToken:
    """REQ-AUTH-004, §13 "Password reset requested": email with a 60 min link."""
    minutes = int(get_setting(session, "security")["reset_link_minutes"])
    row, token = issue_token(session, user, RESET, timedelta(minutes=minutes), created_by=requested_by or user.email)
    url = link_url(RESET, token)
    body = (
        f"Hello {user.full_name or user.email},\n\n"
        f"We received a request to reset the password for your RDIP account ({user.email}).\n\n"
        f"Choose a new password here. The link works once and expires in {minutes} minutes:\n{url}\n\n"
        "If you didn't ask for this you can ignore this email; your password stays the same.\n\n"
        "— RSwitch Data Intelligence Platform"
    )
    notify.dispatch(session, "password_reset_requested", [user.email], "Password reset requested", body,
                    dedupe_key=f"password_reset_requested:{row.id}", email_subject="[RDIP] Reset your password",
                    email_body=body)
    return row


def latest_open_token(session: Session, user_id: int, purpose: str) -> UserToken | None:
    return session.exec(
        select(UserToken)
        .where(UserToken.user_id == user_id, UserToken.purpose == purpose, UserToken.used_at == None, UserToken.revoked_at == None)  # noqa: E711
        .order_by(UserToken.created_at.desc())
    ).first()


def cut_off(session: Session, user: User, reason: str) -> None:
    """End every session, forget every trusted device and void every open
    emailed link. The caller commits."""
    revoke_sessions(session, user.id, reason)
    now = datetime.utcnow()
    for device in session.exec(select(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.revoked_at == None)).all():  # noqa: E711
        device.revoked_at = now
        session.add(device)
    _revoke_open_tokens(session, user.id)
