"""System settings (SRS §5.14): organization and branding (REQ-SET-001), API
keys (REQ-SET-002), security policy (REQ-SET-003), reminder lead times
(REQ-SET-004), notification events (REQ-NOTIF-003) and the outbound email
log. Technical/Admin edits; Business may view (§12.1); module sections
(anomaly, pipelines, risk_weights) are saved through the same PUT."""

import hashlib
import importlib
import re
import secrets
from typing import Optional
from zoneinfo import available_timezones

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import has_cap, require_cap
from app.core.security import hash_api_key
from app.db import get_session
from app.models.admin import ApiKey, EmailOutbox
from app.models.user import User
from app.services import audit, notify
from app.services.settings_store import DEFAULTS, all_settings, get_setting, put_setting
from app.storage import get_file, put_file

router = APIRouter(prefix="/settings", tags=["settings"])

DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD MMM YYYY"]
LOGO_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
MAX_LOGO_BYTES = 2 * 1024 * 1024
# Written only by the logo endpoints, never by PUT /settings/organization.
_LOGO_FIELDS = ("logo_url", "logo_key", "logo_content_type")

# REQ-SET-003 bounds. The password length floor is the §11.1 minimum, so the
# policy can be tightened but never set below the SRS.
SECURITY_RANGES = {
    "session_timeout_minutes": (5, 480),
    "min_password_length": (12, 128),
    "password_history": (0, 24),
    "lockout_attempts": (3, 20),
    "lockout_minutes": (1, 1440),
    "trusted_device_days": (1, 90),
    "reset_link_minutes": (5, 1440),
    "invite_link_hours": (1, 168),
}


@router.get("")
def read_settings(session: Session = Depends(get_session), _: User = Depends(require_cap("settings.view"))):
    return all_settings(session)


@router.get("/organization")
def organization(session: Session = Depends(get_session), _: User = Depends(require_cap("dashboard.view"))):
    """Branding and formats every signed-in user needs (header, dates)."""
    org = get_setting(session, "organization")
    return {k: org[k] for k in ("name", "logo_url", "timezone", "date_format")}


@router.get("/logo")
def logo(session: Session = Depends(get_session)):
    """Public so an <img> (and the sign-in page) can load it without a token."""
    org = get_setting(session, "organization")
    if not org.get("logo_key"):
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    return Response(get_file(org["logo_key"]), media_type=org.get("logo_content_type") or "image/png",
                    headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})


def _image_kind(data: bytes) -> Optional[str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@router.post("/organization/logo")
async def upload_logo(request: Request, file: UploadFile = File(...), session: Session = Depends(get_session),
                      admin: User = Depends(require_cap("settings.manage"))):
    """REQ-SET-001 logo. PNG, JPEG or WebP up to 2 MB (SVG is refused: it
    can carry script)."""
    data = await file.read()
    kind = _image_kind(data)
    if kind is None:
        raise validation_error([problem("logo", "type", "Upload a PNG, JPEG or WebP image.")])
    if len(data) > MAX_LOGO_BYTES:
        raise validation_error([problem("logo", "max_size", "The logo must be 2 MB or smaller.")])
    digest = hashlib.sha256(data).hexdigest()[:12]
    key = f"branding/logo-{digest}.{LOGO_TYPES[kind]}"
    put_file(key, data, kind)
    saved = put_setting(session, "organization",
                        {"logo_key": key, "logo_content_type": kind, "logo_url": f"/settings/logo?v={digest}"})
    audit.record(session, "SETTINGS_UPDATE", f"organization: logo uploaded ({file.filename}, {len(data)} bytes)", admin, request)
    return {k: saved[k] for k in ("name", "logo_url", "timezone", "date_format")}


@router.delete("/organization/logo")
def remove_logo(request: Request, session: Session = Depends(get_session), admin: User = Depends(require_cap("settings.manage"))):
    saved = put_setting(session, "organization", {"logo_key": "", "logo_content_type": "", "logo_url": ""})
    audit.record(session, "SETTINGS_UPDATE", "organization: logo removed", admin, request)
    return {k: saved[k] for k in ("name", "logo_url", "timezone", "date_format")}


# ---- notification events (REQ-NOTIF-003) ------------------------------------

@router.get("/notification-events")
def notification_events(session: Session = Depends(get_session), _: User = Depends(require_cap("settings.view"))):
    """Every SRS §13 event with who receives it, its channels and whether
    it is switched on. Transactional emails are always on."""
    enabled = get_setting(session, "notifications")["events"]
    return [
        {
            "key": key,
            "label": spec.label,
            "recipient": spec.recipient,
            "channels": [c for c, on in (("In-app", spec.in_app), ("Email", spec.email)) if on],
            "always_on": spec.always_on,
            "enabled": spec.always_on or bool(enabled.get(key, True)),
        }
        for key, spec in notify.EVENTS.items()
    ]


# ---- validation of PUT /settings/{key} ----------------------------------------

def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _lead_times(field: str, value) -> list[dict]:
    if not isinstance(value, list) or not value:
        return [problem(field, "required", "Add at least one lead time.")]
    if not all(isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 365 for v in value):
        return [problem(field, "range", "Each lead time must be a whole number of days from 1 to 365.")]
    if len(set(value)) != len(value):
        return [problem(field, "unique", "Each lead time can appear only once.")]
    return []


def _check(key: str, value: dict) -> list[dict]:
    """§20.2 problems for a settings write; empty when valid."""
    defaults = DEFAULTS[key]
    problems: list[dict] = []
    for field, v in value.items():
        if key == "notifications" or field not in defaults:
            continue
        expected = defaults[field]
        name = f"{key}.{field}"
        if isinstance(expected, bool) and not isinstance(v, bool):
            problems.append(problem(name, "type", "Must be on or off."))
        elif _is_number(expected) and (not _is_number(v) or v < 0):
            problems.append(problem(name, "type", "Must be a number of zero or more."))
        elif isinstance(expected, list) and not isinstance(v, list):
            problems.append(problem(name, "type", "Must be a list."))
        elif isinstance(expected, str) and not isinstance(v, str):
            problems.append(problem(name, "type", "Must be text."))
    if problems:
        return problems

    if key == "organization":
        if "name" in value and not (1 <= len(value["name"].strip()) <= 120):
            problems.append(problem("organization.name", "required", "Enter the organization name (up to 120 characters)."))
        if "timezone" in value and value["timezone"] not in available_timezones():
            problems.append(problem("organization.timezone", "enum", "Choose a timezone from the list."))
        if "date_format" in value and value["date_format"] not in DATE_FORMATS:
            problems.append(problem("organization.date_format", "enum", f"Choose one of: {', '.join(DATE_FORMATS)}."))
    elif key == "security":
        for field, (low, high) in SECURITY_RANGES.items():
            if field in value and not (isinstance(value[field], int) and low <= value[field] <= high):
                problems.append(problem(f"security.{field}", "range", f"Enter a whole number from {low} to {high}."))
    elif key == "reminders":
        for field in ("days_before", "action_item_days_before"):
            if field in value:
                problems.extend(_lead_times(f"reminders.{field}", value[field]))
    elif key == "notifications":
        events = value.get("events", {})
        if not isinstance(events, dict):
            problems.append(problem("notifications.events", "type", "Must map event keys to on/off."))
        else:
            for event, on in events.items():
                spec = notify.EVENTS.get(event)
                if spec is None:
                    problems.append(problem(f"notifications.events.{event}", "unknown", "Unknown notification event."))
                elif not isinstance(on, bool):
                    problems.append(problem(f"notifications.events.{event}", "type", "Must be on or off."))
                elif spec.always_on and not on:
                    problems.append(problem(f"notifications.events.{event}", "always_on",
                                            f"“{spec.label}” is a transactional email and can't be switched off."))
    elif key == "pipelines":
        retention = value.get("log_retention_days")
        if retention is not None and not (isinstance(retention, int) and 90 <= retention <= 3650):
            problems.append(problem("pipelines.log_retention_days", "range",
                                    "Logs must be kept at least 90 days (REQ-PIPE-009); enter 90 to 3650."))
        grace = value.get("overdue_grace_days")
        if grace is not None and not (isinstance(grace, int) and 0 <= grace <= 60):
            problems.append(problem("pipelines.overdue_grace_days", "range", "Enter a whole number of days from 0 to 60."))
    elif key == "risk_weights":
        merged = {**defaults, **{k: v for k, v in value.items() if k in defaults}}
        if any(not (0 <= float(v) <= 100) for v in merged.values()):
            problems.append(problem("risk_weights", "range", "Each weight must be between 0 and 100."))
        elif round(sum(float(v) for v in merged.values()), 6) != 100:
            problems.append(problem("risk_weights", "sum", "Risk weights must add up to 100."))
    return problems


# Modules that own a settings section validate it themselves; their
# validate_config(value, current) returns [{field, error}] problems.
_MODULE_VALIDATORS = {"anomaly": "app.services.anomaly"}


def _module_problems(session: Session, key: str, value: dict) -> list[dict]:
    module_path = _MODULE_VALIDATORS.get(key)
    if not module_path:
        return []
    validate = getattr(importlib.import_module(module_path), "validate_config", None)
    if validate is None:
        return []
    return [
        problem(f"{key}.{e.get('field', '')}".rstrip("."), str(e.get("rule", "invalid")),
                str(e.get("message") or e.get("error") or "Invalid value"))
        for e in validate(value, get_setting(session, key))
    ]


def _diff(before: dict, after: dict) -> str:
    changed = [f"{k} {before.get(k)!r}→{after.get(k)!r}" for k in after if before.get(k) != after.get(k)]
    return ", ".join(changed)[:900] or "no changes"


@router.put("/{key}")
def write_setting(
    key: str,
    request: Request,
    value: dict = Body(...),
    session: Session = Depends(get_session),
    admin: User = Depends(require_cap("settings.manage")),
):
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    if key == "notifications" and not has_cap(admin, "notifications.manage"):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
    if key == "organization":
        value = {k: v for k, v in value.items() if k not in _LOGO_FIELDS}
        if isinstance(value.get("name"), str):
            value["name"] = value["name"].strip()
    if key == "reminders":
        value = {k: sorted(v, reverse=True) if isinstance(v, list) and all(isinstance(x, int) for x in v) else v
                 for k, v in value.items()}
    problems = _check(key, value) or _module_problems(session, key, value)
    if problems:
        raise validation_error(problems)
    before = get_setting(session, key)
    saved = put_setting(session, key, value)
    if key == "notifications":
        summary = _diff(before["events"], saved["events"])
    else:
        summary = _diff(before, saved)
    audit.record(session, "SETTINGS_UPDATE", f"{key}: {summary}", admin, request)
    return saved


# ---- API keys (REQ-SET-002) ---------------------------------------------------

def _key_out(k: ApiKey, owner: str = "") -> dict:
    return {
        "id": k.id,
        "name": k.name,
        "masked": f"{k.prefix}••••••••••••",
        "owner": owner,
        "created_at": k.created_at,
        "last_used_at": k.last_used_at,
        "is_active": k.is_active,
    }


class ApiKeyBody(BaseModel):
    name: str


@router.get("/api-keys")
def list_keys(session: Session = Depends(get_session), _: User = Depends(require_cap("settings.view"))):
    """Masked only; the full key is shown once, at creation."""
    owners = {u.id: u.email for u in session.exec(select(User)).all()}
    return [_key_out(k, owners.get(k.user_id, "")) for k in session.exec(select(ApiKey).order_by(ApiKey.created_at.desc())).all()]


@router.post("/api-keys")
def create_key(body: ApiKeyBody, request: Request, session: Session = Depends(get_session),
               admin: User = Depends(require_cap("settings.manage"))):
    """The key authenticates as its creator via the X-API-Key header. Only a
    hash is stored; the plaintext is returned here and never again."""
    name = body.name.strip()
    if not name or len(name) > 80:
        raise validation_error([problem("name", "required", "Name the key (up to 80 characters).")])
    plaintext = "rdip_" + secrets.token_urlsafe(32)
    key = ApiKey(name=name, prefix=plaintext[:9], key_hash=hash_api_key(plaintext), user_id=admin.id)
    session.add(key)
    session.commit()
    session.refresh(key)
    audit.record(session, "API_KEY_CREATE", key.name, admin, request)
    return {**_key_out(key, admin.email), "key": plaintext}


@router.delete("/api-keys/{key_id}")
def revoke_key(key_id: int, request: Request, session: Session = Depends(get_session),
               admin: User = Depends(require_cap("settings.manage"))):
    key = session.get(ApiKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    if key.is_active:
        key.is_active = False
        session.add(key)
        session.commit()
        audit.record(session, "API_KEY_REVOKE", key.name, admin, request, status="WARNING")
    owner = session.get(User, key.user_id)
    return _key_out(key, owner.email if owner else "")


# ---- outbound email log -------------------------------------------------------

_TOKEN_RE = re.compile(r"(token=)[A-Za-z0-9_\-]+")


@router.get("/email-log")
def email_log(
    q: Optional[str] = None,
    status: Optional[str] = None,
    event: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    _: User = Depends(require_cap("settings.manage")),
):
    """Every outbound email (SRS §16). Without SMTP this log *is* the
    delivery channel, so links are shown in full; once a message was really
    sent the single-use token in it is redacted."""
    query = select(EmailOutbox).order_by(EmailOutbox.created_at.desc(), EmailOutbox.id.desc())
    if status:
        query = query.where(EmailOutbox.status == status)
    if event:
        query = query.where(EmailOutbox.event == event)
    if q:
        like = f"%{q}%"
        query = query.where(EmailOutbox.to_address.ilike(like) | EmailOutbox.subject.ilike(like))
    return [
        {
            "id": r.id,
            "to_address": r.to_address,
            "subject": r.subject,
            "body": _TOKEN_RE.sub(r"\1[redacted]", r.body) if r.status == "Sent" else r.body,
            "event": r.event,
            "event_label": notify.EVENTS[r.event].label if r.event in notify.EVENTS else r.event,
            "status": r.status,
            "error": r.error,
            "attachments": r.attachments or [],
            "created_at": r.created_at,
        }
        for r in session.exec(query.limit(limit)).all()
    ]
