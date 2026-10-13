"""System settings live in the DB (SystemSetting rows) with these defaults,
so an admin edit takes effect without a deploy."""

from copy import deepcopy

from sqlmodel import Session

from app.models.admin import SystemSetting


def _notification_defaults() -> dict:
    from app.services.notify import EVENTS

    return {"events": {key: True for key in EVENTS}}


DEFAULTS: dict[str, dict] = {
    # REQ-SET-001
    "organization": {
        "name": "RSwitch Ltd (Rwanda National Switch)",
        # Set only by the logo upload endpoint: logo_url is the API path that
        # serves it, logo_key the storage object.
        "logo_url": "",
        "logo_key": "",
        "logo_content_type": "",
        "timezone": "Africa/Kigali",
        "date_format": "YYYY-MM-DD",
    },
    # REQ-SET-003, REQ-AUTH-002..006, §11.1
    "security": {
        "mfa_enforced": True,
        "session_timeout_minutes": 30,
        "min_password_length": 12,
        "require_uppercase": True,
        "require_lowercase": True,
        "require_digit": True,
        "require_special": True,
        "password_history": 5,
        "lockout_attempts": 5,
        "lockout_minutes": 30,
        "trusted_device_days": 30,
        "reset_link_minutes": 60,
        "invite_link_hours": 48,
    },
    # REQ-SET-004: compliance deadline reminder lead times; §6.3 / REQ-GOV-009:
    # governance action item reminders.
    "reminders": {"days_before": [14, 7, 1], "action_item_days_before": [7, 1]},
    # §11.5 weights for the participant risk score (must sum to 100).
    "risk_weights": {"integration": 30, "compliance": 30, "incidents": 20, "overdue": 20},
    # REQ-AI-006b, REQ-AI-007, REQ-AI-010..012, §8.3. Validated by
    # app.services.anomaly.validate_config.
    "anomaly": {
        "volume_deviation_pct": 50,  # reported volume vs its baseline
        "error_rate_pct": 20,  # R1: validation failure rate threshold
        "failure_rate_change_pp": 15,  # R2/R3: failure-rate change vs own/peer baseline
        "auto_escalate_days": 3,  # REQ-AI-006b
        "min_history_months": 3,  # §8.3 "Insufficient history"
        "baseline_method": "threshold",  # REQ-AI-011: threshold (R1) | rolling (R2) | peer (R3)
        "rolling_window_months": 6,  # R2 window; never below the SRS minimum of 6
        "peer_min_peers": 2,  # R3 needs this many same-type peers with data
        "cadence_multiplier": 2,  # overdue when silent for N × expected frequency
        # Severity = how many times past its trigger a signal is.
        "severity_bands": {"medium": 1.5, "high": 2.0, "critical": 3.0},
        "trend_months": 3,  # REQ-AI-007
        # REQ-AI-010: active detectors, loaded by import path.
        "detectors": [
            "app.services.detectors.threshold:ThresholdDetector",
            "app.services.detectors.rolling:RollingBaselineDetector",
            "app.services.detectors.peer:PeerGroupDetector",
            "app.services.detectors.cadence:CadenceDetector",
        ],
    },
    # REQ-NOTIF-003
    "notifications": {"events": {}},
    # REQ-PIPE-009 log retention (never below 90 days); REQ-INTG-010 grace
    # before a late data source turns Failed (Warning until then, §9.1).
    "pipelines": {"log_retention_days": 90, "overdue_grace_days": 3},
}


def _defaults(key: str) -> dict:
    if key == "notifications":
        return _notification_defaults()
    return deepcopy(DEFAULTS.get(key, {}))


def get_setting(session: Session, key: str) -> dict:
    row = session.get(SystemSetting, key)
    value = _defaults(key)
    if row:
        stored = dict(row.value)
        if key == "notifications":
            value["events"].update(stored.get("events", {}))
        else:
            value.update(stored)
    return value


def all_settings(session: Session) -> dict:
    return {key: get_setting(session, key) for key in DEFAULTS}


def put_setting(session: Session, key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise KeyError(key)
    allowed = _defaults(key)
    current = get_setting(session, key)
    if key == "notifications":
        events = {k: bool(v) for k, v in value.get("events", {}).items() if k in allowed["events"]}
        merged = {"events": {**current["events"], **events}}
    else:
        merged = {**current, **{k: v for k, v in value.items() if k in allowed}}
    row = session.get(SystemSetting, key) or SystemSetting(key=key)
    row.value = merged
    session.add(row)
    session.commit()
    return merged
