import io
import secrets
from base64 import b64encode
from datetime import datetime

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.core.security import (
    MFA_TOKEN_MINUTES,
    create_access_token,
    decode_token,
    get_current_user,
    hash_api_key,
    hash_password,
    verify_password,
)
from app.db import get_session
from app.models.user import User
from app.services import audit
from app.services.settings_store import get_setting

router = APIRouter(prefix="/auth", tags=["auth"])

ISSUER = "RDIP · RSwitch"


def _user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "mfa_enabled": user.mfa_enabled,
        "last_login_at": user.last_login_at,
    }


def _issue_session(session: Session, user: User, request: Request) -> dict:
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    audit.record(session, "LOGIN", user.email, user, request)
    minutes = int(get_setting(session, "security")["session_timeout_minutes"])
    return {"access_token": create_access_token(user.email, minutes), "token_type": "bearer", "expires_in_minutes": minutes}


@router.post("/token")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        audit.record(session, "LOGIN_FAILED", form.username, request=request, status="FAILED", actor_email=form.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is deactivated")
    if user.mfa_enabled:
        # Second factor still owed: hand back a short-lived, MFA-scoped token.
        return {"mfa_required": True, "mfa_token": create_access_token(user.email, MFA_TOKEN_MINUTES, scope="mfa")}
    return {"mfa_required": False, "mfa_setup_required": get_setting(session, "security")["mfa_enforced"], **_issue_session(session, user, request)}


@router.post("/mfa/verify")
def mfa_verify(
    request: Request,
    mfa_token: str = Body(...),
    code: str = Body(...),
    session: Session = Depends(get_session),
):
    email = decode_token(mfa_token, scope="mfa")
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not user.mfa_secret:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    code = code.strip().replace(" ", "")
    ok = pyotp.TOTP(user.mfa_secret).verify(code, valid_window=1)
    if not ok and hash_api_key(code.upper()) in user.recovery_codes:
        # Recovery codes are single-use.
        user.recovery_codes = [c for c in user.recovery_codes if c != hash_api_key(code.upper())]
        ok = True
    if not ok:
        audit.record(session, "MFA_FAILED", user.email, user, request, status="FAILED")
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    return _issue_session(session, user, request)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.patch("/me")
def update_me(
    request: Request,
    full_name: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not full_name.strip():
        raise HTTPException(status_code=422, detail="Name can't be empty")
    current_user.full_name = full_name.strip()
    session.add(current_user)
    session.commit()
    audit.record(session, "PROFILE_UPDATE", current_user.email, current_user, request)
    return _user_out(current_user)


@router.post("/change-password")
def change_password(
    request: Request,
    current_password: str = Body(...),
    new_password: str = Body(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    min_len = int(get_setting(session, "security")["min_password_length"])
    if len(new_password) < min_len:
        raise HTTPException(status_code=422, detail=f"Password must be at least {min_len} characters")
    current_user.hashed_password = hash_password(new_password)
    session.add(current_user)
    session.commit()
    audit.record(session, "PASSWORD_CHANGE", current_user.email, current_user, request)
    return {"ok": True}


@router.post("/mfa/setup")
def mfa_setup(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Generates a fresh secret (not active until /mfa/enable confirms a code)."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="Two-factor is already enabled")
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
    request: Request,
    code: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start setup first")
    if not pyotp.TOTP(current_user.mfa_secret).verify(code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="That code doesn't match — check your authenticator's clock and try again")
    codes = ["-".join(secrets.token_hex(2).upper() for _ in range(3)) for _ in range(5)]
    current_user.recovery_codes = [hash_api_key(c) for c in codes]
    current_user.mfa_enabled = True
    session.add(current_user)
    session.commit()
    audit.record(session, "MFA_ENABLED", current_user.email, current_user, request)
    return {"recovery_codes": codes}


@router.post("/mfa/disable")
def mfa_disable(
    request: Request,
    password: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    current_user.recovery_codes = []
    session.add(current_user)
    session.commit()
    audit.record(session, "MFA_DISABLED", current_user.email, current_user, request, status="WARNING")
    return {"ok": True}
