"""Auth / users / settings / notifications checks (SRS §5.1 REQ-AUTH-001..010,
§5.12 REQ-NOTIF-001..005, §5.13 REQ-USR-001..006, §5.14 REQ-SET-001..005,
§11.1, §11.2, §13, §17.2, §19.1, §19.7, §20).

Run against a seeded database:
    DATABASE_URL=sqlite:////tmp/auth.db STORAGE_BACKEND=local \
    LOCAL_STORAGE_DIR=/tmp/auth-storage RATE_LIMIT_ENABLED=false \
    python -m app.seed_demo && python -m tests.test_auth
(or under pytest). Every test creates its own users, and restores any
setting it changes, so the file can be re-run against the same database."""

import csv
import io
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta
from uuid import uuid4

if "DATABASE_URL" not in os.environ:  # self-contained fallback
    _tmp = tempfile.mkdtemp(prefix="rdip-auth-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/auth.db"
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("LOCAL_STORAGE_DIR", f"{_tmp}/storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pyotp  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.core.permissions import FORBIDDEN  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.admin import AuditEvent, EmailOutbox, Notification, UserSession, UserToken  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.models.integration import Integration  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import notifications as notification_jobs  # noqa: E402
from app.services import notify  # noqa: E402
from app.services.settings_store import get_setting, put_setting  # noqa: E402

PASSWORD = "Strong-Pass-2026!"
_client: TestClient | None = None


def client() -> TestClient:
    """One app instance for the whole run; the background scheduler is
    stopped so its jobs can't race the assertions."""
    global _client
    if _client is None:
        _client = TestClient(app, raise_server_exceptions=False)
        _client.__enter__()
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None:
            scheduler.shutdown(wait=True)
    return _client


def make_user(role: UserRole = UserRole.compliance, *, mfa: bool = False, password: str = PASSWORD) -> User:
    email = f"t-{uuid4().hex[:10]}@rswitch.rw"
    with Session(engine) as s:
        user = User(email=email, full_name=f"Test {email[:12]}", role=role, hashed_password=hash_password(password),
                    mfa_secret=pyotp.random_base32() if mfa else None, mfa_enabled=mfa)
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


def auth(email: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(email)}"}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class security_settings:
    """Temporarily change security settings, restoring them afterwards."""

    def __init__(self, **changes):
        self.changes = changes

    def __enter__(self):
        with Session(engine) as s:
            self.saved = get_setting(s, "security")
            put_setting(s, "security", self.changes)

    def __exit__(self, *exc):
        with Session(engine) as s:
            put_setting(s, "security", self.saved)


def login(email: str, password: str = PASSWORD, **extra):
    return client().post("/auth/login", json={"email": email, "password": password, **extra},
                         headers={"User-Agent": "rdip-tests/1.0"})


def full_login(user: User) -> str:
    """Password + TOTP → full session token."""
    r = login(user.email)
    assert r.status_code == 200 and r.json()["mfa_required"], r.text
    code = pyotp.TOTP(user.mfa_secret).now()
    v = client().post("/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": code})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


def latest_email_token(address: str, path: str) -> str:
    with Session(engine) as s:
        row = s.exec(select(EmailOutbox).where(EmailOutbox.to_address == address).order_by(EmailOutbox.id.desc())).first()
    assert row is not None, f"no email to {address}"
    match = re.search(rf"{path}\?token=([A-Za-z0-9_\-]+)", row.body)
    assert match, row.body
    return match.group(1)


def audit_actions(email: str) -> list[AuditEvent]:
    with Session(engine) as s:
        return list(s.exec(select(AuditEvent).where(AuditEvent.resource.contains(email)).order_by(AuditEvent.id)).all())


# ---- REQ-AUTH-001/003/007 -------------------------------------------------------

def test_lockout_after_five_failures():
    user = make_user(mfa=True)
    for attempt in range(4):
        r = login(user.email, "Wrong-Pass-2026!")
        assert r.status_code == 401 and r.json()["detail"] == "Incorrect email or password.", r.text
    r = login(user.email, "Wrong-Pass-2026!")
    assert r.status_code == 423 and r.json()["code"] == "account_locked", r.text
    assert "locked" in r.json()["detail"] and "Try again in 30 minutes" in r.json()["detail"]
    # Even the right password is refused while locked.
    assert login(user.email).status_code == 423
    events = audit_actions(user.email)
    failed = [e for e in events if e.action == "LOGIN_FAILED"]
    assert len(failed) == 6 and all(e.user_agent == "rdip-tests/1.0" and e.ip_address for e in failed)
    assert any(e.action == "ACCOUNT_LOCKED" for e in events)
    # Lock expires → sign-in works and the counter is reset.
    with Session(engine) as s:
        u = s.get(User, user.id)
        u.locked_until = datetime.utcnow() - timedelta(seconds=1)
        s.add(u)
        s.commit()
    assert full_login(user)
    with Session(engine) as s:
        assert s.get(User, user.id).failed_attempts == 0
    assert any(e.action == "LOGIN" for e in audit_actions(user.email))


def test_unknown_email_is_indistinguishable():
    ghost = f"nobody-{uuid4().hex[:8]}@rswitch.rw"
    first = login(ghost, "Wrong-Pass-2026!")
    assert first.status_code == 401 and first.json()["detail"] == "Incorrect email or password."
    for _ in range(4):
        r = login(ghost, "Wrong-Pass-2026!")
    assert r.status_code == 423 and r.json()["code"] == "account_locked"
    assert any(e.action == "LOGIN_FAILED" and "unknown email" in e.resource for e in audit_actions(ghost))


def test_mfa_failures_count_toward_lockout():
    user = make_user(mfa=True)
    for i in range(5):
        r = login(user.email)
        assert r.json()["mfa_required"], r.text
        v = client().post("/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": "000000"})
        if i < 4:
            assert v.status_code == 401, v.text
    assert v.status_code == 423, v.text
    assert sum(e.action == "MFA_FAILED" for e in audit_actions(user.email)) == 5


def test_inactive_account_is_logged():
    user = make_user()
    with Session(engine) as s:
        u = s.get(User, user.id)
        u.is_active = False
        s.add(u)
        s.commit()
    r = login(user.email)
    assert r.status_code == 403 and r.json()["code"] == "account_inactive"
    assert any("deactivated" in e.resource for e in audit_actions(user.email))


# ---- REQ-AUTH-002 MFA enforced ------------------------------------------------------

def test_mfa_enforced_setup_token_is_restricted():
    user = make_user(UserRole.technical)
    r = login(user.email)
    body = r.json()
    assert r.status_code == 200 and body["mfa_setup_required"] and not body["mfa_required"], r.text
    setup = bearer(body["access_token"])
    # Nothing but enrolment works.
    blocked = client().get("/notifications", headers=setup)
    assert blocked.status_code == 403 and blocked.json()["code"] == "mfa_setup_required"
    assert client().get("/users", headers=setup).status_code == 403
    me = client().get("/auth/me", headers=setup).json()
    assert me["session_scope"] == "mfa_setup" and me["mfa_enforced"]
    secret = client().post("/auth/mfa/setup", headers=setup).json()["secret"]
    bad = client().post("/auth/mfa/enable", json={"code": "000000"}, headers=setup)
    assert bad.status_code == 400 and bad.json()["detail"][0]["field"] == "code"
    done = client().post("/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=setup)
    assert done.status_code == 200 and len(done.json()["recovery_codes"]) == 5, done.text
    full = bearer(done.json()["access_token"])
    assert client().get("/notifications", headers=full).status_code == 200
    assert client().get("/users", headers=full).status_code == 200
    # The enrolment-only session is closed.
    assert client().get("/auth/me", headers=setup).status_code == 401
    # Users can't switch MFA off while it's enforced.
    off = client().post("/auth/mfa/disable", json={"password": PASSWORD}, headers=full)
    assert off.status_code == 400 and off.json()["code"] == "mfa_enforced"
    # Next sign-in asks for the code; a recovery code works exactly once.
    recovery = done.json()["recovery_codes"][0]
    r = login(user.email)
    assert r.json()["mfa_required"]
    ok = client().post("/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": recovery.lower()})
    assert ok.status_code == 200, ok.text
    r = login(user.email)
    again = client().post("/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": recovery})
    assert again.status_code == 401


def test_mfa_not_enforced_gives_full_session():
    user = make_user()
    with security_settings(mfa_enforced=False):
        r = login(user.email)
        assert r.status_code == 200 and not r.json()["mfa_setup_required"]
        assert client().get("/notifications", headers=bearer(r.json()["access_token"])).status_code == 200


# ---- REQ-AUTH-006 trusted device ------------------------------------------------------

def test_trusted_device_skips_mfa():
    user = make_user(mfa=True)
    other = make_user(mfa=True)
    r = login(user.email)
    v = client().post("/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"],
                                                 "code": pyotp.TOTP(user.mfa_secret).now(), "trust_device": True})
    device = v.json()["device_token"]
    skipped = login(user.email, device_token=device)
    assert skipped.status_code == 200 and not skipped.json()["mfa_required"] and skipped.json()["access_token"]
    assert login(user.email, device_token="not-a-device").json()["mfa_required"]
    assert login(other.email, device_token=device).json()["mfa_required"]
    # Forgetting devices brings the prompt back.
    client().delete("/auth/trusted-devices", headers=bearer(skipped.json()["access_token"]))
    assert login(user.email, device_token=device).json()["mfa_required"]
    with Session(engine) as s:  # expired devices don't count either
        assert s.exec(select(AuditEvent).where(AuditEvent.action == "TRUSTED_DEVICE_ADDED",
                                               AuditEvent.actor_email == user.email)).first()


# ---- REQ-AUTH-005 sessions ----------------------------------------------------------------

def _session_row(token: str) -> UserSession:
    from jose import jwt

    jti = jwt.get_unverified_claims(token)["jti"]
    with Session(engine) as s:
        return s.exec(select(UserSession).where(UserSession.jti == jti)).first()


def _age_session(token: str, minutes: int) -> None:
    row = _session_row(token)
    with Session(engine) as s:
        row = s.get(UserSession, row.id)
        row.last_activity_at = datetime.utcnow() - timedelta(minutes=minutes)
        s.add(row)
        s.commit()


def test_idle_timeout_returns_401():
    user = make_user()
    token = create_access_token(user.email)
    _age_session(token, 31)
    r = client().get("/auth/me", headers=bearer(token))
    assert r.status_code == 401 and r.json()["code"] == "session_idle" and "30 minutes" in r.json()["detail"]
    # Once idle-expired, staying expired.
    assert client().get("/auth/me", headers=bearer(token)).json()["code"] == "session_revoked"


def test_background_polling_is_not_activity():
    user = make_user()
    token = create_access_token(user.email)
    _age_session(token, 20)
    # A poll reporting the user idle for 25 min must not refresh the session…
    r = client().get("/notifications", headers={**bearer(token), "X-RDIP-Idle": str(25 * 60)})
    assert r.status_code == 200
    assert datetime.utcnow() - _session_row(token).last_activity_at > timedelta(minutes=19)
    _age_session(token, 29)
    client().get("/notifications", headers={**bearer(token), "X-RDIP-Idle": str(29 * 60)})
    _age_session(token, 31)  # …so 30 min after the last real interaction it ends.
    assert client().get("/notifications", headers=bearer(token)).status_code == 401
    # Real interaction (idle 3 s) does keep it alive.
    token = create_access_token(user.email)
    _age_session(token, 20)
    client().get("/notifications", headers={**bearer(token), "X-RDIP-Idle": "3"})
    assert datetime.utcnow() - _session_row(token).last_activity_at < timedelta(minutes=1)


def test_logout_revokes_session():
    user = make_user()
    token = create_access_token(user.email)
    assert client().get("/auth/me", headers=bearer(token)).status_code == 200
    assert client().post("/auth/logout", headers=bearer(token)).status_code == 200
    r = client().get("/auth/me", headers=bearer(token))
    assert r.status_code == 401 and r.json()["code"] == "session_revoked"
    assert client().post("/auth/logout", headers=bearer(token)).status_code == 200  # idempotent
    assert any(e.action == "LOGOUT" for e in audit_actions(user.email))


# ---- REQ-AUTH-004 password reset ----------------------------------------------------

def test_reset_token_single_use_and_expiry():
    user = make_user(mfa=True)
    old_session = create_access_token(user.email)
    r = client().post("/auth/password/reset-request", json={"email": user.email.upper()})
    unknown = client().post("/auth/password/reset-request", json={"email": f"ghost-{uuid4().hex[:6]}@rswitch.rw"})
    assert r.status_code == unknown.status_code == 200 and r.json() == unknown.json()
    token = latest_email_token(user.email, "/reset-password")
    with Session(engine) as s:
        row = s.exec(select(UserToken).where(UserToken.user_id == user.id, UserToken.purpose == "reset")).first()
        assert row.token_hash != token and timedelta(minutes=59) < row.expires_at - row.created_at <= timedelta(minutes=60)
    weak = client().post("/auth/password/reset", json={"token": token, "new_password": "short"})
    assert weak.status_code == 422
    assert {p["rule"] for p in weak.json()["detail"]} == {"min_length", "uppercase", "digit", "special"}
    reuse = client().post("/auth/password/reset", json={"token": token, "new_password": PASSWORD})
    assert reuse.status_code == 422 and reuse.json()["detail"][0]["rule"] == "history"
    ok = client().post("/auth/password/reset", json={"token": token, "new_password": "Brand-New-Pass-77#"})
    assert ok.status_code == 200, ok.text
    again = client().post("/auth/password/reset", json={"token": token, "new_password": "Another-New-Pass-88#"})
    assert again.status_code == 400 and again.json()["code"] == "token_used"
    assert client().get("/auth/me", headers=bearer(old_session)).status_code == 401  # sessions revoked
    assert login(user.email, "Brand-New-Pass-77#").json()["mfa_required"]
    # Expired link.
    client().post("/auth/password/reset-request", json={"email": user.email})
    with Session(engine) as s:  # the 1-minute resend guard: backdate the last link
        for t in s.exec(select(UserToken).where(UserToken.user_id == user.id)).all():
            t.created_at -= timedelta(minutes=5)
            s.add(t)
        s.commit()
    client().post("/auth/password/reset-request", json={"email": user.email})
    token = latest_email_token(user.email, "/reset-password")
    with Session(engine) as s:
        row = s.exec(select(UserToken).where(UserToken.user_id == user.id, UserToken.used_at == None,  # noqa: E711
                                             UserToken.revoked_at == None)).first()  # noqa: E711
        row.expires_at = datetime.utcnow() - timedelta(seconds=1)
        s.add(row)
        s.commit()
    expired = client().post("/auth/password/reset", json={"token": token, "new_password": "Third-New-Pass-99#"})
    assert expired.status_code == 400 and expired.json()["code"] == "token_expired"


# ---- §11.1 password policy & history ----------------------------------------------------

def test_password_policy_and_history():
    user = make_user()
    headers = auth(user.email)

    def change(current, new):
        return client().post("/auth/change-password", json={"current_password": current, "new_password": new}, headers=headers)

    cases = {"Sh0rt!a": "min_length", "alllowercase-123!": "uppercase", "ALLUPPERCASE-123!": "lowercase",
             "No-Digits-Here-At-All!": "digit", "NoSpecials123456": "special"}
    for pwd, rule in cases.items():
        r = change(PASSWORD, pwd)
        assert r.status_code == 422 and rule in {p["rule"] for p in r.json()["detail"]}, (pwd, r.text)
        assert all(p["field"] == "new_password" for p in r.json()["detail"])
    wrong = change("Not-My-Pass-2026!", "Valid-New-Pass-1!")
    assert wrong.status_code == 400 and wrong.json()["detail"][0]["field"] == "current_password"
    current = PASSWORD
    for i in range(1, 6):
        nxt = f"Rotation-Pass-{i}!x"
        assert change(current, nxt).status_code == 200
        current = nxt
    # The last five (current + 4 before) are refused; the sixth back is allowed.
    for recent in ("Rotation-Pass-5!x", "Rotation-Pass-3!x", "Rotation-Pass-1!x"):
        r = change(current, recent)
        assert r.status_code == 422 and r.json()["detail"][0]["rule"] == "history", recent
    assert change(current, PASSWORD).status_code == 200
    # Admin-configured policy is enforced (REQ-SET-003).
    with security_settings(min_password_length=20):
        r = change(PASSWORD, "Only-17-Chars-1!x")
        assert r.status_code == 422 and r.json()["detail"][0]["rule"] == "min_length"
        assert client().get("/auth/password-policy").json()["min_length"] == 20


# ---- REQ-USR-001/002 invitations ----------------------------------------------------------

def test_invite_accept_and_expiry():
    admin = make_user(UserRole.technical)
    headers = auth(admin.email)
    email = f"new-{uuid4().hex[:8]}@RSwitch.rw"
    r = client().post("/users/invite", json={"email": email, "full_name": "New Person", "role": "Business"}, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "Invited" and r.json()["email"] == email.lower(), r.text
    user_id = r.json()["id"]
    assert client().post("/users/invite", json={"email": email.upper(), "full_name": "Dup", "role": "Business"},
                         headers=headers).status_code == 409
    bad = client().post("/users/invite", json={"email": "not an email", "full_name": "", "role": "Board"}, headers=headers)
    assert bad.status_code == 422 and {p["field"] for p in bad.json()["detail"]} == {"email", "full_name", "role"}
    forbidden = client().post("/users/invite", json={"email": "x@rswitch.rw", "full_name": "X", "role": "Business"},
                              headers=auth(make_user(UserRole.business).email))
    assert forbidden.status_code == 403 and forbidden.json()["detail"] == FORBIDDEN
    token = latest_email_token(email.lower(), "/accept-invite")
    with Session(engine) as s:
        row = s.exec(select(UserToken).where(UserToken.user_id == user_id, UserToken.purpose == "invite")).first()
        assert timedelta(hours=47) < row.expires_at - row.created_at <= timedelta(hours=48)
    assert login(email.lower()).status_code == 401  # can't sign in before accepting
    details = client().get(f"/auth/invite?token={token}")
    assert details.status_code == 200 and details.json()["full_name"] == "New Person"
    weak = client().post("/auth/invite/accept", json={"token": token, "password": "weak"})
    assert weak.status_code == 422 and weak.json()["detail"][0]["field"] == "password"
    ok = client().post("/auth/invite/accept", json={"token": token, "password": PASSWORD})
    assert ok.status_code == 200, ok.text
    assert client().post("/auth/invite/accept", json={"token": token, "password": PASSWORD}).json()["code"] == "token_used"
    first = login(email.lower())
    assert first.status_code == 200 and first.json()["mfa_setup_required"]  # then MFA enrolment
    users = {u["id"]: u for u in client().get("/users", headers=headers).json()}
    assert users[user_id]["status"] == "Active"
    assert any(e.action == "USER_INVITE" for e in audit_actions(email.lower()))
    # Expired invitation, then resend: the new link works, the old one doesn't.
    email2 = f"late-{uuid4().hex[:8]}@rswitch.rw"
    uid2 = client().post("/users/invite", json={"email": email2, "full_name": "Late", "role": "Compliance"}, headers=headers).json()["id"]
    old = latest_email_token(email2, "/accept-invite")
    with Session(engine) as s:
        row = s.exec(select(UserToken).where(UserToken.user_id == uid2)).first()
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        s.add(row)
        s.commit()
    assert client().post("/auth/invite/accept", json={"token": old, "password": PASSWORD}).json()["code"] == "token_expired"
    assert client().post(f"/users/{uid2}/resend-invite", headers=headers).status_code == 200
    new = latest_email_token(email2, "/accept-invite")
    assert new != old
    assert client().get(f"/auth/invite?token={old}").status_code == 400
    assert client().post("/auth/invite/accept", json={"token": new, "password": PASSWORD}).status_code == 200


# ---- REQ-USR-003..006 -------------------------------------------------------------------

def test_user_management_actions():
    admin = make_user(UserRole.technical)
    headers = auth(admin.email)
    user = make_user(UserRole.compliance)
    user_token = create_access_token(user.email)
    r = client().put(f"/users/{user.id}/role", json={"role": "Business"}, headers=headers)
    assert r.status_code == 200 and r.json()["role"] == "Business"
    assert client().put(f"/users/{user.id}/role", json={"role": "Board"}, headers=headers).status_code == 422
    assert client().put(f"/users/{admin.id}/role", json={"role": "Business"}, headers=headers).status_code == 400
    with Session(engine) as s:
        n = s.exec(select(Notification).where(Notification.user_id == user.id, Notification.event == "user_role_changed")).first()
        assert n is not None
        assert s.exec(select(EmailOutbox).where(EmailOutbox.to_address == user.email, EmailOutbox.event == "user_role_changed")).first()
    # Role change takes effect on the next request (server-side RBAC).
    assert client().get("/audit-log", headers=bearer(user_token)).status_code == 403
    assert client().patch(f"/users/{user.id}", json={"is_senior": True}, headers=headers).json()["is_senior"] is True
    d = client().put(f"/users/{user.id}/deactivate", headers=headers)
    assert d.status_code == 200 and d.json()["status"] == "Inactive"
    assert client().get("/auth/me", headers=bearer(user_token)).status_code == 401  # sessions ended
    assert login(user.email).status_code == 403
    assert client().put(f"/users/{admin.id}/deactivate", headers=headers).status_code == 400
    a = client().put(f"/users/{user.id}/reactivate", headers=headers)
    assert a.status_code == 200 and a.json()["status"] == "Active"
    actions = [e.action for e in audit_actions(user.email)]
    for expected in ("USER_ROLE_CHANGE", "USER_DEACTIVATE", "USER_REACTIVATE", "USER_UPDATE"):
        assert expected in actions, (expected, actions)
    with Session(engine) as s:  # deactivation never deletes
        assert s.get(User, user.id) is not None
    row = next(u for u in client().get("/users", headers=headers).json() if u["id"] == user.id)
    assert {"full_name", "email", "role", "status", "last_login_at", "mfa_enabled", "is_senior"} <= row.keys()


# ---- REQ-AUTH-008/010 RBAC --------------------------------------------------------------

def test_rbac_403_message_never_names_module():
    compliance, business, technical = (make_user(r) for r in (UserRole.compliance, UserRole.business, UserRole.technical))
    denied = [
        (compliance, "get", "/users"), (compliance, "get", "/settings"), (business, "get", "/audit-log"),
        (business, "put", "/settings/security"), (compliance, "get", "/audit-log/export"),
        (business, "post", "/settings/api-keys"), (compliance, "get", "/settings/email-log"),
    ]
    for user, method, path in denied:
        kwargs = {"json": {"name": "x"}} if method != "get" else {}
        r = getattr(client(), method)(path, headers=auth(user.email), **kwargs)
        assert r.status_code == 403 and r.json() == {"detail": FORBIDDEN}, (path, r.text)
    allowed = [(business, "/settings"), (compliance, "/audit-log"), (technical, "/users"), (compliance, "/settings/organization"),
               (business, "/notifications"), (business, "/settings/api-keys")]
    for user, path in allowed:
        assert client().get(path, headers=auth(user.email)).status_code == 200, path
    assert client().get("/users").status_code == 401


# ---- REQ-SET-001..005 -----------------------------------------------------------------------

def test_settings_validation_and_branding():
    technical = make_user(UserRole.technical)
    headers = auth(technical.email)
    bad = client().put("/settings/security", json={"session_timeout_minutes": 2, "min_password_length": 8}, headers=headers)
    assert bad.status_code == 422
    assert {p["field"] for p in bad.json()["detail"]} == {"security.session_timeout_minutes", "security.min_password_length"}
    assert client().put("/settings/reminders", json={"days_before": [14, 14]}, headers=headers).status_code == 422
    assert client().put("/settings/organization", json={"timezone": "Mars/Base"}, headers=headers).status_code == 422
    assert client().put("/settings/pipelines", json={"log_retention_days": 30}, headers=headers).status_code == 422
    assert client().put("/settings/anomaly", json={"error_rate_pct": -5}, headers=headers).status_code == 422
    with Session(engine) as s:
        saved = get_setting(s, "reminders")
    try:
        r = client().put("/settings/reminders", json={"days_before": [3, 30, 10], "action_item_days_before": [5, 2]}, headers=headers)
        assert r.status_code == 200 and r.json()["days_before"] == [30, 10, 3]
    finally:
        with Session(engine) as s:
            put_setting(s, "reminders", saved)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    up = client().post("/settings/organization/logo", files={"file": ("logo.png", png, "image/png")}, headers=headers)
    assert up.status_code == 200 and up.json()["logo_url"].startswith("/settings/logo"), up.text
    served = client().get("/settings/logo")  # public, no token
    assert served.status_code == 200 and served.content == png and served.headers["content-type"] == "image/png"
    svg = client().post("/settings/organization/logo", files={"file": ("x.svg", b"<svg/>", "image/svg+xml")}, headers=headers)
    assert svg.status_code == 422 and svg.json()["detail"][0]["field"] == "logo"
    org = client().get("/settings/organization", headers=auth(make_user(UserRole.compliance).email)).json()
    assert org["logo_url"] == up.json()["logo_url"] and "logo_key" not in org
    client().delete("/settings/organization/logo", headers=headers)


def test_api_keys_create_masked_revoke():
    technical = make_user(UserRole.technical)
    headers = auth(technical.email)
    created = client().post("/settings/api-keys", json={"name": "Test connector"}, headers=headers).json()
    plaintext = created["key"]
    listed = client().get("/settings/api-keys", headers=headers).json()
    row = next(k for k in listed if k["id"] == created["id"])
    assert "key" not in row and plaintext not in str(listed) and row["masked"].startswith(plaintext[:9])
    assert client().get("/auth/me", headers={"X-API-Key": plaintext}).json()["session_scope"] == "api_key"
    assert client().delete(f"/settings/api-keys/{created['id']}", headers=headers).json()["is_active"] is False
    assert client().get("/auth/me", headers={"X-API-Key": plaintext}).status_code == 401


def test_audit_export_date_range():
    technical = make_user(UserRole.technical)
    marker = uuid4().hex[:8]
    with Session(engine) as s:
        for day in (10, 15, 20):
            s.add(AuditEvent(timestamp=datetime(2025, 1, day, 12), action="TEST_EVENT", resource=f"{marker}-{day}",
                             actor_email="tester@rswitch.rw", ip_address="10.0.0.1", user_agent="ua-test"))
        s.commit()
    r = client().get(f"/audit-log/export?date_from=2025-01-12&date_to=2025-01-15&q={marker}", headers=auth(technical.email))
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert [row["resource"] for row in rows] == [f"{marker}-15"]
    assert rows[0]["user_agent"] == "ua-test" and rows[0]["ip_address"] == "10.0.0.1"
    full = client().get(f"/audit-log/export?date_from=2025-01-01&date_to=2025-01-31&q={marker}", headers=auth(technical.email))
    assert len(list(csv.DictReader(io.StringIO(full.text)))) == 3
    inverted = client().get("/audit-log/export?date_from=2025-02-01&date_to=2025-01-01", headers=auth(technical.email))
    assert inverted.status_code == 422 and inverted.json()["detail"][0]["field"] == "date_to"
    listed = client().get(f"/audit-log?q={marker}&date_from=2025-01-14", headers=auth(make_user(UserRole.compliance).email))
    assert {e["resource"] for e in listed.json()} == {f"{marker}-15", f"{marker}-20"}
    assert client().get("/audit-log/export", headers=auth(make_user(UserRole.compliance).email)).status_code == 403


# ---- REQ-NOTIF-001..005 ---------------------------------------------------------------------

def test_notification_event_toggle():
    technical = make_user(UserRole.technical)
    headers = auth(technical.email)
    events = client().get("/settings/notification-events", headers=headers).json()
    assert {e["key"] for e in events} == set(notify.EVENTS)
    invited = next(e for e in events if e["key"] == "user_invited")
    assert invited["always_on"] and invited["channels"] == ["Email"]
    locked = client().put("/settings/notifications", json={"events": {"user_invited": False}}, headers=headers)
    assert locked.status_code == 422
    target = make_user(UserRole.compliance)
    try:
        off = client().put("/settings/notifications", json={"events": {"user_role_changed": False}}, headers=headers)
        assert off.status_code == 200 and off.json()["events"]["user_role_changed"] is False
        client().put(f"/users/{target.id}/role", json={"role": "Business"}, headers=headers)
        with Session(engine) as s:
            assert s.exec(select(Notification).where(Notification.user_id == target.id)).first() is None
    finally:
        client().put("/settings/notifications", json={"events": {"user_role_changed": True}}, headers=headers)
    client().put(f"/users/{target.id}/role", json={"role": "Compliance"}, headers=headers)
    with Session(engine) as s:
        assert s.exec(select(Notification).where(Notification.user_id == target.id)).first() is not None
    assert client().put("/settings/notifications", json={"events": {}},
                        headers=auth(make_user(UserRole.business).email)).status_code == 403


def test_notification_history_and_read_state():
    user = make_user(UserRole.business)
    headers = auth(user.email)
    with Session(engine) as s:
        for i, age in enumerate((0, 10, 89, 91)):
            s.add(Notification(user_id=user.id, dedupe_key=f"t:{uuid4().hex}", event="ai_alert_generated",
                               title=f"Notice {age}d", message="m", created_at=datetime.utcnow() - timedelta(days=age)))
        s.commit()
    history = client().get("/notifications/history", headers=headers).json()
    assert [n["title"] for n in history] == ["Notice 0d", "Notice 10d", "Notice 89d"]  # 90-day window
    first = history[0]["id"]
    assert client().post(f"/notifications/{first}/read", headers=headers).json()["read"] is True
    assert client().get("/notifications/unread-count", headers=headers).json()["unread"] == 2
    assert [n["id"] for n in client().get("/notifications/history?status=read", headers=headers).json()] == [first]
    assert client().post(f"/notifications/{first}/unread", headers=headers).json()["read"] is False
    client().post("/notifications/read-all", headers=headers)
    assert client().get("/notifications/history?status=unread", headers=headers).json() == []
    client().delete("/notifications/read", headers=headers)
    assert client().get("/notifications", headers=headers).json() == []  # cleared from the bell…
    assert len(client().get("/notifications/history", headers=headers).json()) == 3  # …but kept in history
    other = make_user(UserRole.business)
    assert client().post(f"/notifications/{first}/read", headers=auth(other.email)).status_code == 404


def test_generate_routes_by_role():
    """Integration failures go to Technical users only (§13), not everyone."""
    tech, comp = make_user(UserRole.technical), make_user(UserRole.compliance)
    with Session(engine) as s:
        integ = s.exec(select(Integration)).first()
        if integ is None:
            return  # unseeded database: nothing to route
        saved = integ.status
        integ.status = next(m for m in type(integ.status) if m.value in ("Disconnected", "Failed"))
        integ.updated_at = datetime.utcnow()
        s.add(integ)
        s.commit()
        try:
            notification_jobs.generate(s)
            notification_jobs.generate(s)  # idempotent
            tech_notes = s.exec(select(Notification).where(Notification.user_id == tech.id,
                                                           Notification.event == "integration_failed")).all()
            comp_notes = s.exec(select(Notification).where(Notification.user_id == comp.id,
                                                           Notification.event == "integration_failed")).all()
            assert len([n for n in tech_notes if f":{integ.id}:" in n.dedupe_key]) == 1 and comp_notes == []
        finally:
            integ = s.get(Integration, integ.id)
            integ.status = saved
            s.add(integ)
            s.commit()


# ---- §20 errors ---------------------------------------------------------------------------------

def test_error_shapes():
    r = client().post("/auth/login", json={"email": "a@b.rw"})
    assert r.status_code == 422 and r.json()["detail"][0] == {
        "field": "password", "rule": "missing", "message": "Field required"}

    def boom():
        raise RuntimeError("secret internals: db password=hunter2")

    if not any(getattr(route, "path", "") == "/__test_boom" for route in app.router.routes):
        app.add_api_route("/__test_boom", boom)
    r = client().get("/__test_boom")
    assert r.status_code == 500 and r.json() == {"detail": "Something went wrong on our end. The technical team has been notified."}
    assert "hunter2" not in r.text


def test_create_access_token_contract():
    """Other modules' tests rely on this being a one-call valid token."""
    with Session(engine) as s:
        seeded = s.exec(select(User).where(User.is_active == True)).first()  # noqa: E712
    r = client().get("/auth/me", headers=auth(seeded.email))
    assert r.status_code == 200 and r.json()["session_scope"] == "access"


def _run_all() -> int:
    failures = 0
    tests = [(name, fn) for name, fn in globals().items() if name.startswith("test_") and callable(fn)]
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return failures


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
