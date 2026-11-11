"""Sign-in, MFA, sessions and the password lifecycle (SRS §5.1, §11.1, §19.1).

Every sign-in attempt — success or failure, whatever the reason — is written
to the audit log with timestamp, IP and user agent (REQ-AUTH-007)."""

import io
import secrets
import threading
from base64 import b64encode
from datetime import datetime, timedelta
from typing import Optional

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import CodedHTTPException, problem, validation_error
from app.core.security import (
    MFA_TOKEN_MINUTES,
    SCOPE_ACCESS,
    SCOPE_MFA,
    SCOPE_MFA_SETUP,
    create_access_token,
    decode_payload,
    decode_token,
    find_user_by_email,
    get_current_user,
    get_enrolling_user,
    hash_api_key,
    hash_password,
    hash_token,
    normalize_email,
    oauth2_scheme,
    password_policy,
    revoke_sessions,
    session_timeout_minutes,
    set_password,
    verify_password,
)
from app.db import get_session
from app.models.admin import TrustedDevice, UserSession
from app.models.user import User
from app.services import accounts, audit
from app.services.settings_store import get_setting

router = APIRouter(prefix="/auth", tags=["Authentication"])

ISSUER = "RDIP · RSwitch"
# REQ-AUTH-003: the same words whether or not the email exists.
GENERIC_LOGIN_ERROR = "Incorrect email or password."


class LoginBody(BaseModel):
    email: str
    password: str
    # REQ-AUTH-006: token from an earlier "Trust this device" sign-in.
    device_token: Optional[str] = None


class MfaVerifyBody(BaseModel):
    mfa_token: str
    code: str
    trust_device: bool = False


class EmailBody(BaseModel):
    email: str


class ResetBody(BaseModel):
    token: str
    new_password: str


class InviteAcceptBody(BaseModel):
    token: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class CodeBody(BaseModel):
    code: str


class PasswordBody(BaseModel):
    password: str


class ProfileBody(BaseModel):
    full_name: str


def _security(session: Session) -> dict:
    return get_setting(session, "security")


def _client(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else ""
    return ip, request.headers.get("user-agent", "")[:300]


def _user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_senior": user.is_senior,
        "mfa_enabled": user.mfa_enabled,
        "last_login_at": user.last_login_at,
    }


# ---- lockout (REQ-AUTH-003) -------------------------------------------------

# Failed attempts against emails that have no account are counted in memory
# so that an unknown address locks exactly like a real one; otherwise the
# lock message itself would reveal which emails exist.
_unknown_lock = threading.Lock()
_unknown_failures: dict[str, tuple[int, Optional[datetime]]] = {}
_dummy_hash: Optional[str] = None


def _equalize_timing(password: str) -> None:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_hex(8))
    verify_password(password, _dummy_hash)


def _locked_error(until: datetime) -> CodedHTTPException:
    minutes = max(1, int((until - datetime.utcnow()).total_seconds() // 60) + 1)
    return CodedHTTPException(
        423,
        f"This account is locked after too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        "account_locked",
    )


def _unknown_locked_until(email: str) -> Optional[datetime]:
    with _unknown_lock:
        _, until = _unknown_failures.get(email, (0, None))
    return until if until and until > datetime.utcnow() else None


def _record_failure(
    session: Session,
    request: Request,
    email: str,
    user: Optional[User],
    reason: str,
    action: str = "LOGIN_FAILED",
    message: str = GENERIC_LOGIN_ERROR,
) -> HTTPException:
    """Count one failed attempt (password or MFA code), lock on the Nth, and
    return the error to raise."""
    sec = _security(session)
    attempts, minutes = int(sec["lockout_attempts"]), int(sec["lockout_minutes"])
    now = datetime.utcnow()
    locked_until: Optional[datetime] = None
    if user is None:
        with _unknown_lock:
            count, _ = _unknown_failures.get(email, (0, None))
            count += 1
            if count >= attempts:
                locked_until, count = now + timedelta(minutes=minutes), 0
            _unknown_failures[email] = (count, locked_until)
        audit.record(session, action, f"{email}: {reason}", request=request, status="FAILED", actor_email=email)
    else:
        user.failed_attempts = (user.failed_attempts or 0) + 1
        if user.failed_attempts >= attempts:
            user.locked_until, user.failed_attempts = now + timedelta(minutes=minutes), 0
            locked_until = user.locked_until
        session.add(user)
        session.commit()
        audit.record(session, action, f"{user.email}: {reason}", user, request, status="FAILED")
        if locked_until:
            audit.record(session, "ACCOUNT_LOCKED", f"{user.email}: {attempts} consecutive failed attempts, locked {minutes} min",
                         user, request, status="WARNING")
    if locked_until:
        return _locked_error(locked_until)
    return HTTPException(status_code=401, detail=message)


# ---- trusted devices (REQ-AUTH-006) -----------------------------------------

def _trust_device(session: Session, user: User, request: Request) -> str:
    days = int(_security(session)["trusted_device_days"])
    ip, agent = _client(request)
    token = secrets.token_urlsafe(32)
    session.add(TrustedDevice(user_id=user.id, token_hash=hash_token(token), ip_address=ip, user_agent=agent,
                              expires_at=datetime.utcnow() + timedelta(days=days)))
    session.commit()
    audit.record(session, "TRUSTED_DEVICE_ADDED", f"{user.email}: {days} days", user, request)
    return token


def _trusted(session: Session, user: User, token: Optional[str]) -> bool:
    if not token:
        return False
    device = session.exec(
        select(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.token_hash == hash_token(token),
                                    TrustedDevice.revoked_at == None)  # noqa: E711
    ).first()
    if device is None or device.expires_at <= datetime.utcnow():
        return False
    device.last_used_at = datetime.utcnow()
    session.add(device)
    session.commit()
    return True


# ---- sign-in ----------------------------------------------------------------

def _open_session(session: Session, user: User, request: Request, scope: str) -> str:
    ip, agent = _client(request)
    return create_access_token(user.email, scope=scope, ip=ip, user_agent=agent, db=session)


def _complete_login(session: Session, user: User, request: Request, how: str) -> dict:
    """Both factors satisfied: reset the failure counter, open a full session."""
    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    token = _open_session(session, user, request, SCOPE_ACCESS)
    audit.record(session, "LOGIN", f"{user.email} ({how})", user, request)
    return {
        "mfa_required": False,
        "mfa_setup_required": False,
        "access_token": token,
        "token_type": "bearer",
        "session_timeout_minutes": session_timeout_minutes(session),
    }


def _login(session: Session, request: Request, email: str, password: str, device_token: Optional[str]) -> dict:
    email = normalize_email(email)
    user = find_user_by_email(session, email)
    if user is None:
        until = _unknown_locked_until(email)
        if until:
            audit.record(session, "LOGIN_FAILED", f"{email}: account locked", request=request, status="FAILED", actor_email=email)
            raise _locked_error(until)
        _equalize_timing(password)
        raise _record_failure(session, request, email, None, "unknown email")
    if user.is_locked:
        audit.record(session, "LOGIN_FAILED", f"{user.email}: account locked", user, request, status="FAILED")
        raise _locked_error(user.locked_until)
    if not verify_password(password, user.hashed_password):
        reason = "invitation not yet accepted" if user.pending_invite else "wrong password"
        raise _record_failure(session, request, email, user, reason)
    if not user.is_active:
        audit.record(session, "LOGIN_FAILED", f"{user.email}: account deactivated", user, request, status="FAILED")
        raise CodedHTTPException(403, "This account has been deactivated. Contact your administrator.", "account_inactive")

    if user.mfa_enabled and user.mfa_secret:
        if _trusted(session, user, device_token):
            return _complete_login(session, user, request, "password + trusted device")
        audit.record(session, "LOGIN_PASSWORD_OK", f"{user.email}: awaiting MFA code", user, request)
        return {"mfa_required": True, "mfa_token": create_access_token(user.email, MFA_TOKEN_MINUTES, scope=SCOPE_MFA)}

    if _security(session)["mfa_enforced"]:
        # REQ-AUTH-002: MFA is mandatory. Until it is enrolled the session
        # can do nothing but enrol.
        token = _open_session(session, user, request, SCOPE_MFA_SETUP)
        audit.record(session, "LOGIN_PASSWORD_OK", f"{user.email}: MFA enrolment required", user, request)
        return {
            "mfa_required": False,
            "mfa_setup_required": True,
            "access_token": token,
            "token_type": "bearer",
            "session_timeout_minutes": session_timeout_minutes(session),
        }
    return _complete_login(session, user, request, "password")


@router.post("/login")
def login(body: LoginBody, request: Request, session: Session = Depends(get_session)):
    """§19.1 POST /api/auth/login."""
    return _login(session, request, body.email, body.password, body.device_token)


@router.post("/token", include_in_schema=True)
def login_form(request: Request, form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    """OAuth2 form variant of /login (Swagger's Authorize button)."""
    return _login(session, request, form.username, form.password, None)


@router.post("/mfa/verify")
def mfa_verify(body: MfaVerifyBody, request: Request, session: Session = Depends(get_session)):
    """§19.1: second factor — a 6-digit TOTP code or a single-use recovery code."""
    email = decode_token(body.mfa_token, scope=SCOPE_MFA)
    user = find_user_by_email(session, email)
    if not user or not user.mfa_secret or not user.is_active:
        raise HTTPException(status_code=401, detail="Your sign-in expired. Enter your password again.")
    if user.is_locked:
        audit.record(session, "MFA_FAILED", f"{user.email}: account locked", user, request, status="FAILED")
        raise _locked_error(user.locked_until)
    code = body.code.strip().replace(" ", "")
    how = "password + MFA"
    ok = code.isdigit() and len(code) == 6 and pyotp.TOTP(user.mfa_secret).verify(code, valid_window=1)
    if not ok and hash_api_key(code.upper()) in (user.recovery_codes or []):
        user.recovery_codes = [c for c in user.recovery_codes if c != hash_api_key(code.upper())]
        session.add(user)
        session.commit()
        ok, how = True, "password + recovery code"
    if not ok:
        raise _record_failure(session, request, email, user, "wrong MFA code", action="MFA_FAILED",
                              message="That code isn't valid. Check your authenticator app and try again.")
    result = _complete_login(session, user, request, how)
    if body.trust_device:
        result["device_token"] = _trust_device(session, user, request)
    return result


@router.post("/logout")
def logout(request: Request, token: Optional[str] = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    """§19.1: invalidate the session token. Always succeeds, so a client
    holding an already-expired token can still sign out cleanly."""
    if token:
        try:
            payload = decode_payload(token)
        except HTTPException:
            return {"ok": True}
        row = session.exec(select(UserSession).where(UserSession.jti == payload.get("jti"))).first()
        if row and row.revoked_at is None:
            row.revoked_at = datetime.utcnow()
            row.revoked_reason = "logout"
            session.add(row)
            session.commit()
            user = session.get(User, row.user_id)
            audit.record(session, "LOGOUT", user.email if user else "", user, request)
    return {"ok": True}


@router.post("/session/ping")
def ping(session: Session = Depends(get_session), _: User = Depends(get_enrolling_user)):
    """Called by the web app while the user is interacting but not otherwise
    hitting the API, so the server-side inactivity clock stays in step."""
    return {"ok": True, "session_timeout_minutes": session_timeout_minutes(session)}


@router.get("/me")
def me(request: Request, session: Session = Depends(get_session), current_user: User = Depends(get_enrolling_user)):
    row = getattr(request.state, "user_session", None)
    sec = _security(session)
    return {
        **_user_out(current_user),
        "session_scope": row.scope if row else "api_key",
        "session_timeout_minutes": int(sec["session_timeout_minutes"]),
        "mfa_enforced": bool(sec["mfa_enforced"]),
    }


@router.patch("/me")
def update_me(
    body: ProfileBody,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    name = body.full_name.strip()
    if not name or len(name) > 120:
        raise validation_error([problem("full_name", "required", "Enter your name (up to 120 characters).")])
    current_user.full_name = name
    session.add(current_user)
    session.commit()
    audit.record(session, "PROFILE_UPDATE", current_user.email, current_user, request)
    return _user_out(current_user)


# ---- passwords (§11.1, REQ-AUTH-004) ----------------------------------------

@router.get("/password-policy")
def get_password_policy(session: Session = Depends(get_session)):
    """Public: the sign-in, reset and invitation pages show the configured
    rules and link lifetimes before anyone is signed in."""
    sec = _security(session)
    return {
        **password_policy(session),
        "reset_link_minutes": int(sec["reset_link_minutes"]),
        "trusted_device_days": int(sec["trusted_device_days"]),
    }


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise validation_error([problem("current_password", "incorrect", "Your current password is incorrect.")], 400)
    set_password(session, current_user, body.new_password)
    session.add(current_user)
    # Other devices must sign in again with the new password.
    current = getattr(request.state, "user_session", None)
    revoke_sessions(session, current_user.id, "password_changed", except_jti=current.jti if current else None)
    session.commit()
    audit.record(session, "PASSWORD_CHANGE", current_user.email, current_user, request)
    return {"ok": True}


@router.post("/password/reset-request")
def reset_request(body: EmailBody, request: Request, session: Session = Depends(get_session)):
    """§19.1: always the same answer, so it can't be used to find accounts."""
    email = normalize_email(body.email)
    user = find_user_by_email(session, email) if email else None
    if user and user.is_active and not user.pending_invite:
        recent = accounts.latest_open_token(session, user.id, accounts.RESET)
        if recent and recent.created_at > datetime.utcnow() - timedelta(minutes=1):
            audit.record(session, "PASSWORD_RESET_REQUESTED", f"{user.email}: repeat within a minute, not resent",
                         user, request, status="WARNING")
        else:
            accounts.send_password_reset(session, user)
            audit.record(session, "PASSWORD_RESET_REQUESTED", user.email, user, request)
    else:
        audit.record(session, "PASSWORD_RESET_REQUESTED", f"{email}: no active account, nothing sent",
                     request=request, status="WARNING", actor_email=email)
    return {"ok": True, "message": "If an account exists for that email, we've sent a link to reset the password."}


@router.post("/password/reset")
def reset_password(body: ResetBody, request: Request, session: Session = Depends(get_session)):
    """§19.1: complete a reset with the emailed single-use token."""
    row, user = accounts.resolve_token(session, body.token, accounts.RESET)
    if not user.is_active:
        raise CodedHTTPException(400, "This password reset link is not valid. Request a new one from the sign-in page.", "token_invalid")
    set_password(session, user, body.new_password)
    row.used_at = datetime.utcnow()
    # Proving control of the mailbox clears a lockout.
    user.failed_attempts, user.locked_until = 0, None
    session.add(row)
    session.add(user)
    revoke_sessions(session, user.id, "password_reset")
    session.commit()
    audit.record(session, "PASSWORD_RESET", user.email, user, request)
    return {"ok": True}


# ---- invitations (REQ-USR-002) ----------------------------------------------

@router.get("/invite")
def invite_details(token: str, session: Session = Depends(get_session)):
    """Public: who the invitation is for, so the page can greet them."""
    row, user = accounts.resolve_token(session, token, accounts.INVITE)
    return {"email": user.email, "full_name": user.full_name, "role": user.role, "expires_at": row.expires_at}


@router.post("/invite/accept")
def accept_invite(body: InviteAcceptBody, request: Request, session: Session = Depends(get_session)):
    row, user = accounts.resolve_token(session, body.token, accounts.INVITE)
    set_password(session, user, body.password, field="password")
    row.used_at = datetime.utcnow()
    user.pending_invite = False
    user.is_active = True
    session.add(row)
    session.add(user)
    session.commit()
    audit.record(session, "USER_INVITE_ACCEPTED", user.email, user, request)
    return {"ok": True, "email": user.email}


# ---- MFA enrolment (REQ-AUTH-002) -------------------------------------------

@router.post("/mfa/setup")
def mfa_setup(session: Session = Depends(get_session), current_user: User = Depends(get_enrolling_user)):
    """Generates a fresh secret (not active until /mfa/enable confirms a code)."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled.")
    current_user.mfa_secret = pyotp.random_base32()
    session.add(current_user)
    session.commit()
    uri = pyotp.TOTP(current_user.mfa_secret).provisioning_uri(name=current_user.email, issuer_name=ISSUER)
    buffer = io.BytesIO()
    qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=8).save(buffer)
    return {
        "secret": current_user.mfa_secret,
        "otpauth_uri": uri,
        "qr_svg_data_uri": "data:image/svg+xml;base64," + b64encode(buffer.getvalue()).decode(),
    }


@router.post("/mfa/enable")
def mfa_enable(
    body: CodeBody,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_enrolling_user),
):
    """Confirms enrolment with a code. From an enrolment-only session this
    also completes the sign-in: the restricted session is closed and a full
    one returned."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Two-factor authentication is already enabled.")
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start setup first.")
    if not pyotp.TOTP(current_user.mfa_secret).verify(body.code.strip(), valid_window=1):
        raise validation_error([problem("code", "totp", "That code doesn't match. Check your authenticator's clock and try again.")], 400)
    codes = ["-".join(secrets.token_hex(2).upper() for _ in range(3)) for _ in range(5)]
    current_user.recovery_codes = [hash_api_key(c) for c in codes]
    current_user.mfa_enabled = True
    session.add(current_user)
    session.commit()
    audit.record(session, "MFA_ENABLED", current_user.email, current_user, request)
    result: dict = {"recovery_codes": codes}
    row = getattr(request.state, "user_session", None)
    if row is not None and row.scope == SCOPE_MFA_SETUP:
        row = session.get(UserSession, row.id)
        row.revoked_at, row.revoked_reason = datetime.utcnow(), "mfa_enrolled"
        session.add(row)
        session.commit()
        result.update(_complete_login(session, current_user, request, "password + MFA enrolment"))
    return result


@router.post("/mfa/disable")
def mfa_disable(
    body: PasswordBody,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if _security(session)["mfa_enforced"]:
        raise CodedHTTPException(400, "Two-factor authentication is required by your organisation's security policy and can't be turned off.",
                                 "mfa_enforced")
    if not verify_password(body.password, current_user.hashed_password):
        raise validation_error([problem("password", "incorrect", "Your password is incorrect.")], 400)
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    current_user.recovery_codes = []
    session.add(current_user)
    for device in session.exec(select(TrustedDevice).where(TrustedDevice.user_id == current_user.id,
                                                           TrustedDevice.revoked_at == None)).all():  # noqa: E711
        device.revoked_at = datetime.utcnow()
        session.add(device)
    session.commit()
    audit.record(session, "MFA_DISABLED", current_user.email, current_user, request, status="WARNING")
    return {"ok": True}


@router.get("/trusted-devices")
def list_trusted_devices(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    rows = session.exec(
        select(TrustedDevice).where(TrustedDevice.user_id == current_user.id, TrustedDevice.revoked_at == None,  # noqa: E711
                                    TrustedDevice.expires_at > datetime.utcnow())
        .order_by(TrustedDevice.created_at.desc())
    ).all()
    return [{"id": d.id, "user_agent": d.user_agent, "created_at": d.created_at, "expires_at": d.expires_at,
             "last_used_at": d.last_used_at} for d in rows]


@router.delete("/trusted-devices")
def forget_trusted_devices(request: Request, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Every device will ask for a code at the next sign-in."""
    rows = session.exec(select(TrustedDevice).where(TrustedDevice.user_id == current_user.id,
                                                    TrustedDevice.revoked_at == None)).all()  # noqa: E711
    for d in rows:
        d.revoked_at = datetime.utcnow()
        session.add(d)
    session.commit()
    audit.record(session, "TRUSTED_DEVICES_REVOKED", f"{current_user.email}: {len(rows)} device(s)", current_user, request)
    return {"ok": True, "revoked": len(rows)}
