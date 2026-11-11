"""Authentication primitives (SRS §5.1, §11.1, §11.2, §17.2).

Session tokens are JWTs with an expiry, each bound to a server-side
UserSession row (by jti) so a session can be revoked (logout, password reset,
deactivation) and expires after the configured period of *inactivity*
(REQ-AUTH-005). The browser reports how long the user has been idle in the
X-RDIP-Idle header, so background polling (notification bell, dashboard
refresh) never keeps a session alive on its own."""

import hashlib
import re
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

import bcrypt
from fastapi import Depends, Request, Security, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func
from sqlmodel import Session, select

from app.config import settings
from app.core.errors import CodedHTTPException, problem, validation_error
from app.db import engine, get_session
from app.models.admin import ApiKey, UserSession
from app.models.user import User
from app.services.settings_store import get_setting

# Both schemes use auto_error=False: a request may authenticate with either,
# and _resolve_user decides. Declaring them as security schemes (rather than
# a plain Header parameter) is what puts them in Swagger's Authorize dialog.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/token",
    auto_error=False,
    description="Sign in with an RDIP staff email and password. Accounts with two-step sign-in "
                "can't finish MFA here: use BearerToken instead (see the API description).",
)
api_key_scheme = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
    description="An API key created under Settings → API keys. It acts as the user who created it.",
)

MFA_TOKEN_MINUTES = 5
SCOPE_ACCESS = "access"
# Password accepted, MFA enforced but not enrolled yet: only the enrolment
# endpoints accept this scope (REQ-AUTH-002).
SCOPE_MFA_SETUP = "mfa_setup"
# Password accepted, TOTP code still owed. Stateless and short-lived.
SCOPE_MFA = "mfa"
SESSION_SCOPES = (SCOPE_ACCESS, SCOPE_MFA_SETUP)

IDLE_HEADER = "x-rdip-idle"
# Don't rewrite the session row for every request in a burst.
ACTIVITY_WRITE_GRANULARITY = timedelta(seconds=15)

SPECIAL_CHARS = "!@#$%^&*"  # §11.1


# ---- hashing ---------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    """False for a wrong password and for the unusable placeholder an
    invited user has before accepting."""
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# Same digest for emailed tokens and trusted-device tokens.
hash_token = hash_api_key


# ---- email (§11.2) ---------------------------------------------------------

# RFC 5322 dot-atom addr-spec (the form every real mailbox uses; quoted local
# parts and IP literals are deliberately not accepted). Any domain is fine.
_ATEXT = r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]"
_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
EMAIL_RE = re.compile(rf"^{_ATEXT}+(?:\.{_ATEXT}+)*@{_LABEL}(?:\.{_LABEL})+$")


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def is_valid_email(email: str) -> bool:
    email = normalize_email(email)
    if len(email) > 254 or "@" not in email or len(email.split("@", 1)[0]) > 64:
        return False
    return bool(EMAIL_RE.match(email))


def find_user_by_email(session: Session, email: str) -> Optional[User]:
    """Case-insensitive: emails are unique regardless of case (§11.2)."""
    return session.exec(select(User).where(func.lower(User.email) == normalize_email(email))).first()


# ---- password policy (§11.1, REQ-SET-003) ----------------------------------

def password_policy(session: Session) -> dict:
    sec = get_setting(session, "security")
    return {
        "min_length": int(sec["min_password_length"]),
        "require_uppercase": bool(sec["require_uppercase"]),
        "require_lowercase": bool(sec["require_lowercase"]),
        "require_digit": bool(sec["require_digit"]),
        "require_special": bool(sec["require_special"]),
        "special_characters": SPECIAL_CHARS,
        "history": int(sec["password_history"]),
    }


def password_problems(password: str, policy: dict, field: str = "new_password") -> list[dict]:
    problems = []
    if len(password) < policy["min_length"]:
        problems.append(problem(field, "min_length", f"Use at least {policy['min_length']} characters."))
    if policy["require_uppercase"] and not re.search(r"[A-Z]", password):
        problems.append(problem(field, "uppercase", "Include at least one uppercase letter."))
    if policy["require_lowercase"] and not re.search(r"[a-z]", password):
        problems.append(problem(field, "lowercase", "Include at least one lowercase letter."))
    if policy["require_digit"] and not re.search(r"[0-9]", password):
        problems.append(problem(field, "digit", "Include at least one number."))
    if policy["require_special"] and not any(c in SPECIAL_CHARS for c in password):
        problems.append(problem(field, "special", f"Include at least one special character ({SPECIAL_CHARS})."))
    return problems


def set_password(session: Session, user: User, password: str, field: str = "new_password") -> None:
    """The one way a password is ever set: enforces the configured policy
    and the "not one of the last N" rule, then rotates the history. Raises a
    §20.2 validation error. The caller commits."""
    policy = password_policy(session)
    problems = password_problems(password, policy, field)
    keep = max(policy["history"], 0)
    previous = ([user.hashed_password] if user.hashed_password else []) + list(user.password_history or [])
    if not problems and keep and any(verify_password(password, h) for h in previous[:keep]):
        problems.append(problem(field, "history", f"Choose a password you haven't used for your last {keep} passwords."))
    if problems:
        raise validation_error(problems)
    usable = [h for h in previous if h.startswith("$2")]  # skip the invite placeholder
    user.password_history = usable[: max(keep - 1, 0)]
    user.hashed_password = hash_password(password)
    user.password_changed_at = datetime.utcnow()


def unusable_password() -> str:
    """Placeholder for an invited user: matches no password."""
    return "!" + uuid4().hex


# ---- tokens & sessions -----------------------------------------------------

def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: str,
    minutes: Optional[int] = None,
    scope: str = SCOPE_ACCESS,
    *,
    ip: str = "",
    user_agent: str = "",
    db: Optional[Session] = None,
) -> str:
    """Token for `subject` (an email). For the session scopes this also opens
    the server-side UserSession it is bound to, so a single call returns a
    token every endpoint accepts — `create_access_token("x@rswitch.rw")` is
    the supported way to get one in tests. `minutes` caps the absolute
    lifetime; inactivity is enforced separately."""
    expire = datetime.utcnow() + timedelta(minutes=minutes or settings.jwt_expires_minutes)
    payload = {"sub": normalize_email(subject), "exp": expire, "scope": scope}
    if scope in SESSION_SCOPES:
        jti = uuid4().hex
        own = db or Session(engine)
        try:
            user = find_user_by_email(own, subject)
            if user is None:
                raise ValueError(f"No user with email {subject}")
            own.add(UserSession(jti=jti, user_id=user.id, scope=scope, expires_at=expire,
                                ip_address=ip, user_agent=(user_agent or "")[:300]))
            own.commit()
        finally:
            if db is None:
                own.close()
        payload["jti"] = jti
    return _encode(payload)


def _unauthorized(message: str = "Could not validate credentials", code: str = "unauthorized") -> CodedHTTPException:
    return CodedHTTPException(status.HTTP_401_UNAUTHORIZED, message, code, headers={"WWW-Authenticate": "Bearer"})


def decode_payload(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise _unauthorized("Your session has expired. Please sign in again.", "session_expired")
    if not payload.get("sub"):
        raise _unauthorized()
    return payload


def decode_token(token: str, scope: str = SCOPE_ACCESS) -> str:
    """Subject (email) of a token of exactly this scope, or 401. An
    MFA-pending token can't be used as an access token and vice versa."""
    payload = decode_payload(token)
    if payload.get("scope", SCOPE_ACCESS) != scope:
        raise _unauthorized()
    return payload["sub"]


def _reported_idle(request: Optional[Request]) -> float:
    """Seconds since the user's last real interaction, as reported by the
    web app. Absent (API clients, scripts) means "active now"."""
    if request is None:
        return 0.0
    try:
        return max(float(request.headers.get(IDLE_HEADER, "0")), 0.0)
    except ValueError:
        return 0.0


def session_timeout_minutes(session: Session) -> int:
    return int(get_setting(session, "security")["session_timeout_minutes"])


def revoke_sessions(session: Session, user_id: int, reason: str, except_jti: Optional[str] = None) -> int:
    now = datetime.utcnow()
    rows = session.exec(select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at == None)).all()  # noqa: E711
    count = 0
    for row in rows:
        if row.jti == except_jti:
            continue
        row.revoked_at = now
        row.revoked_reason = reason
        session.add(row)
        count += 1
    return count


def _touch_session(session: Session, payload: dict, request: Optional[Request]) -> UserSession:
    jti = payload.get("jti")
    row = session.exec(select(UserSession).where(UserSession.jti == jti)).first() if jti else None
    if row is None or row.revoked_at is not None:
        raise _unauthorized("Your session has ended. Please sign in again.", "session_revoked")
    now = datetime.utcnow()
    timeout = session_timeout_minutes(session)
    if now - row.last_activity_at > timedelta(minutes=timeout):
        row.revoked_at = now
        row.revoked_reason = "idle"
        session.add(row)
        session.commit()
        raise _unauthorized(
            f"You were signed out after {timeout} minutes of inactivity. Please sign in again.", "session_idle"
        )
    activity = now - timedelta(seconds=_reported_idle(request))
    if activity > row.last_activity_at + ACTIVITY_WRITE_GRANULARITY:
        row.last_activity_at = activity
        session.add(row)
        session.commit()
    return row


def _resolve_user(
    request: Request, token: Optional[str], x_api_key: Optional[str], session: Session, scopes: tuple[str, ...]
) -> User:
    user: Optional[User] = None
    if token:
        payload = decode_payload(token)
        scope = payload.get("scope", SCOPE_ACCESS)
        if scope not in SESSION_SCOPES:
            raise _unauthorized()
        row = _touch_session(session, payload, request)
        if scope not in scopes:
            # Signed in, but MFA enrolment is still owed: not a 401 (the
            # client must not drop the session), just nothing else is open.
            raise CodedHTTPException(403, "Set up two-factor authentication to continue.", "mfa_setup_required")
        user = session.get(User, row.user_id)
        if user is not None and normalize_email(user.email) != payload["sub"]:
            user = None
        request.state.user_session = row
    elif x_api_key:
        key = session.exec(
            select(ApiKey).where(ApiKey.key_hash == hash_api_key(x_api_key), ApiKey.is_active == True)  # noqa: E712
        ).first()
        if key:
            key.last_used_at = datetime.utcnow()
            session.add(key)
            session.commit()
            user = session.get(User, key.user_id)
        request.state.user_session = None
    if user is None or not user.is_active:
        raise _unauthorized()
    return user


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Security(api_key_scheme),
    session: Session = Depends(get_session),
) -> User:
    """A fully signed-in user (full session or API key)."""
    return _resolve_user(request, token, x_api_key, session, (SCOPE_ACCESS,))


def get_enrolling_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Security(api_key_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Also accepts the MFA-setup session — only for /auth/me, the MFA
    enrolment endpoints and logout."""
    return _resolve_user(request, token, x_api_key, session, SESSION_SCOPES)
