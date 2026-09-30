"""System settings live in the DB (SystemSetting rows) with these defaults,
so an admin edit takes effect without a deploy."""

from copy import deepcopy

from sqlmodel import Session

from app.models.admin import SystemSetting

DEFAULTS: dict[str, dict] = {
    "organization": {
        "name": "RSwitch Ltd (Rwanda National Switch)",
        "timezone": "Africa/Kigali",
        "date_format": "YYYY-MM-DD",
    },
    "security": {"mfa_enforced": False, "session_timeout_minutes": 720, "min_password_length": 12},
    "reminders": {"days_before": [14, 7, 1]},
    # Weights for the participant risk score (must sum to 100).
    "risk_weights": {"integration": 30, "compliance": 30, "incidents": 20, "overdue": 20},
    "anomaly": {"volume_deviation_pct": 50, "error_rate_pct": 20, "auto_escalate_days": 3},
}


def get_setting(session: Session, key: str) -> dict:
    row = session.get(SystemSetting, key)
    value = deepcopy(DEFAULTS.get(key, {}))
    if row:
        value.update(row.value)
    return value


def all_settings(session: Session) -> dict:
    return {key: get_setting(session, key) for key in DEFAULTS}


def put_setting(session: Session, key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise KeyError(key)
    merged = {**get_setting(session, key), **{k: v for k, v in value.items() if k in DEFAULTS[key]}}
    row = session.get(SystemSetting, key) or SystemSetting(key=key)
    row.value = merged
    session.add(row)
    session.commit()
    return merged
