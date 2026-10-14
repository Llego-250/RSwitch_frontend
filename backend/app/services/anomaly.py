"""AI Decision Support engine (SRS §5.9, §8.3, §9.3).

Advisory only (REQ-AI-002): nothing here changes a participant, an
integration or any other record outside the alert itself. Detection is
model-agnostic (REQ-AI-010): the detectors listed in the `anomaly.detectors`
setting are loaded by import path (app.services.detectors) and only report
findings; this module turns findings into alerts — deduplicated by evidence,
suppressed for participants with insufficient history (§8.3), escalated when
an open issue gets worse — and owns the alert lifecycle (REQ-AI-006).

Everything is derived from real rows against thresholds admins configure in
Settings; no model weights, no fabricated numbers."""

import logging
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.core.errors import problem
from app.core.permissions import has_cap
from app.models.alert import AnomalyAlert
from app.models.compliance import ComplianceRequirement
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import UNRESOLVED_INCIDENT_STATUSES, IntegrationStatus, IssueSeverity, SubmissionResult, UserRole
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import notify
from app.services.compliance import document_status
from app.services.detectors import METHODS, SEVERITIES, Finding, LoadedDetector, load_detectors, method_label
from app.services.detectors.context import ROLLING_MIN_MONTHS, DetectionContext, build_context, month_key, month_label
from app.services.settings_store import DEFAULTS, get_setting

log = logging.getLogger(__name__)

ADVISORY_NOTICE = (
    "AI outputs are advisory and explainable (REQ-AI-002). They never change a participant's status, an integration "
    "or any other record — every decision stays with RSwitch staff."
)

# ---- lifecycle (SRS §9.3, REQ-AI-006/006a/006c) ---------------------------------

GENERATED, ACKNOWLEDGED, INVESTIGATING, RESOLVED, ESCALATED, CLOSED = (
    "Generated", "Acknowledged", "Under Investigation", "Resolved", "Escalated", "Closed",
)
STATUSES = [GENERATED, ACKNOWLEDGED, INVESTIGATING, RESOLVED, ESCALATED, CLOSED]

# Moves a Business or Compliance user may make. Generated → Acknowledged →
# Under Investigation → Resolved / Escalated → Closed: no skipping
# Acknowledged (006a), no shortcut to Closed, and Closed is terminal (006c).
# Escalated can go back to Under Investigation once a senior assigns it.
TRANSITIONS: dict[str, tuple[str, ...]] = {
    GENERATED: (ACKNOWLEDGED,),
    ACKNOWLEDGED: (INVESTIGATING,),
    INVESTIGATING: (RESOLVED, ESCALATED),
    ESCALATED: (INVESTIGATING, CLOSED),
    RESOLVED: (CLOSED,),
    CLOSED: (),
}
# Moves only the system makes: auto-escalation after N days at Acknowledged
# (006b) and escalation when a re-detection finds the issue has got worse.
# A Generated alert is never escalated — nobody has acknowledged it yet, so
# it would skip the mandatory awareness step; its severity is raised instead.
SYSTEM_TRANSITIONS: dict[str, tuple[str, ...]] = {
    ACKNOWLEDGED: (ESCALATED,),
    INVESTIGATING: (ESCALATED,),
    RESOLVED: (ESCALATED,),
}
MIN_RESOLUTION_CHARS = 20
RANK = {s: i for i, s in enumerate(SEVERITIES)}


class TransitionError(Exception):
    """A refused lifecycle move. `field`/`rule` make it a §20.2 problem."""

    def __init__(self, status_code: int, message: str, field: str = "", rule: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.field = field
        self.rule = rule


def allowed_next(alert: AnomalyAlert) -> list[str]:
    return list(TRANSITIONS.get(alert.status, ()))


def _note(text: str, user: Optional[User] = None, **extra) -> dict:
    return {
        "date": datetime.utcnow().isoformat(),
        "user": (user.full_name or user.email) if user else "System",
        "user_id": user.id if user else None,
        "role": user.role.value if user else "System",
        "text": text,
        **extra,
    }


def transition(
    session: Session,
    alert: AnomalyAlert,
    to_status: str,
    note: str,
    actor: User,
    resolution_summary: str = "",
    assignee_id: Optional[int] = None,
) -> AnomalyAlert:
    """Apply one user-initiated lifecycle move, enforcing every §9.3 rule."""
    note = (note or "").strip()
    summary = (resolution_summary or "").strip()
    if not has_cap(actor, "ai.alerts.transition"):
        raise TransitionError(403, "You do not have permission to perform this action.")
    if alert.status == CLOSED:
        raise TransitionError(
            409, "This alert is closed and read-only — it cannot be reopened. If the issue recurs, RDIP raises a new alert."
        )
    if to_status not in STATUSES:
        raise TransitionError(422, f"Unknown status '{to_status}'. Valid statuses: {', '.join(STATUSES)}.",
                              "status", "unknown")
    if to_status not in TRANSITIONS[alert.status]:
        rule = "transition"
        if alert.status == GENERATED and to_status == INVESTIGATING:
            rule = "acknowledge_first"
            message = ("An alert cannot move from Generated directly to Under Investigation — acknowledge it first "
                       "with an awareness note (REQ-AI-006a).")
        elif alert.status == GENERATED and to_status == CLOSED:
            message = ("A Generated alert cannot be closed directly — acknowledge it, investigate and resolve it, "
                       "then close it with a resolution summary.")
        else:
            allowed = ", ".join(TRANSITIONS[alert.status]) or "none"
            message = f"An alert cannot move from {alert.status} to {to_status}. Allowed next: {allowed}."
        raise TransitionError(422, message, "status", rule)
    if not note:
        raise TransitionError(422, "A note is required for every status change (REQ-AI-006).", "note", "required")
    if to_status == CLOSED and len(summary) < MIN_RESOLUTION_CHARS:
        raise TransitionError(
            422, f"Closing requires a written resolution summary of at least {MIN_RESOLUTION_CHARS} characters (REQ-AI-006c).",
            "resolution_summary", "min_length",
        )

    extra: dict = {"from": alert.status, "to": to_status}
    now = datetime.utcnow()
    if to_status == INVESTIGATING:
        assignee = session.get(User, assignee_id) if assignee_id else actor
        if assignee is None or not assignee.is_active or not has_cap(assignee, "ai.alerts.transition"):
            raise TransitionError(422, "Assign the investigation to an active Compliance or Business user.",
                                  "assignee_id", "invalid")
        alert.assignee_id = assignee.id
        alert.assignee_name = assignee.full_name or assignee.email
        extra["assignee"] = alert.assignee_name
    if to_status == RESOLVED:
        alert.resolved_at = now
    if to_status == CLOSED:
        alert.resolution_summary = summary
        alert.closed_at = now
        extra["resolution_summary"] = summary
    alert.notes = [*(alert.notes or []), _note(note, actor, **extra)]
    alert.status = to_status
    alert.status_changed_at = now
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


# ---- configuration (REQ-AI-012) ---------------------------------------------------

def _num(lo: float, hi: float, integer: bool = False):
    def check(v):
        if isinstance(v, bool):
            return None, "Must be a number"
        try:
            n = float(v)
        except (TypeError, ValueError):
            return None, "Must be a number"
        if integer and n != int(n):
            return None, "Must be a whole number"
        if not lo <= n <= hi:
            return None, f"Must be between {lo:g} and {hi:g}"
        return (int(n) if integer else n), ""
    return check


def _bands(v):
    if not isinstance(v, dict):
        return None, "Must give medium, high and critical multipliers"
    out = {}
    for k in ("medium", "high", "critical"):
        n, err = _num(1, 100)(v.get(k))
        if err:
            return None, f"{k}: {err}"
        out[k] = n
    if not out["medium"] <= out["high"] <= out["critical"]:
        return None, "Bands must increase: medium ≤ high ≤ critical"
    return out, ""


def _method(v):
    if not isinstance(v, str) or not v.strip():
        return None, "Choose a baseline method"
    return v.strip(), ""


def _detector_paths(v):
    if not isinstance(v, list) or not v or not all(isinstance(p, str) and p.strip() for p in v):
        return None, "List at least one detector import path"
    return [p.strip() for p in v], ""


def _detectors(v):
    paths, err = _detector_paths(v)
    if err:
        return None, err
    broken = [d for d in load_detectors(paths) if d.detector is None]
    if broken:
        return None, "; ".join(f"{d.path}: {d.error}" for d in broken)
    return paths, ""


VALIDATORS = {
    "volume_deviation_pct": _num(1, 1000),
    "error_rate_pct": _num(1, 100),
    "failure_rate_change_pp": _num(1, 100),
    "auto_escalate_days": _num(1, 90, integer=True),
    "min_history_months": _num(0, 24),
    "baseline_method": _method,
    "rolling_window_months": _num(ROLLING_MIN_MONTHS, 24, integer=True),
    "peer_min_peers": _num(1, 50, integer=True),
    "cadence_multiplier": _num(1, 20),
    "severity_bands": _bands,
    "trend_months": _num(1, 24, integer=True),
    "detectors": _detectors,
}


def validate_config(value: dict, current: Optional[dict] = None) -> list[dict]:
    """§20.2 field problems ({field, rule, message}) for a (partial) anomaly
    settings payload — for the Settings API to call before put_setting.
    `current` is the saved config the payload will be merged into."""
    problems = []
    for key, v in value.items():
        if key not in VALIDATORS:
            problems.append(problem(key, "unknown", "Unknown setting"))
            continue
        _, err = VALIDATORS[key](v)
        if err:
            problems.append(problem(key, "invalid", err))
    method = value.get("baseline_method")
    if method and method not in METHODS and not any(p["field"] == "baseline_method" for p in problems):
        # A plugin method is valid only if a configured detector implements it.
        paths = value.get("detectors") or (current or DEFAULTS["anomaly"])["detectors"]
        if method not in {d.detector.method for d in load_detectors(paths) if d.detector is not None}:
            problems.append(problem("baseline_method", "invalid", f"No configured detector implements '{method}'"))
    return problems


def config(session: Session) -> dict:
    """The anomaly settings with any invalid value replaced by its default, so
    a bad edit can never break detection."""
    raw = get_setting(session, "anomaly")
    defaults = DEFAULTS["anomaly"]
    cfg = {}
    for key, check in VALIDATORS.items():
        if key == "detectors":
            # Keep the configured list even if one path is broken: the
            # loader skips (and reports) it without dropping the others.
            check = _detector_paths
        value, err = check(raw.get(key, defaults[key]))
        if err:
            log.warning("Ignoring invalid anomaly.%s (%s); using default", key, err)
            value, _ = check(defaults[key])
        cfg[key] = value
    return cfg


def _active_method(cfg: dict, loaded: list[LoadedDetector], override: Optional[str] = None) -> tuple[str, str]:
    method = override or cfg["baseline_method"]
    plugin_methods = {d.detector.method for d in loaded if d.detector is not None}
    if method in METHODS or method in plugin_methods:
        return method, ""
    return "threshold", f"No loaded detector implements '{method}'; using {method_label('threshold')}."


# ---- detection ----------------------------------------------------------------------

def _run_detectors(session: Session, method: Optional[str] = None) -> tuple[DetectionContext, list[LoadedDetector], list[Finding]]:
    cfg = config(session)
    loaded = load_detectors(cfg["detectors"])
    active, _ = _active_method(cfg, loaded, method)
    ctx = build_context(session, cfg, active)
    findings: list[Finding] = []
    for ld in loaded:
        if ld.detector is None:
            continue
        try:
            found = ld.detector.detect(ctx) or []
        except Exception:  # one broken detector must not stop the scan
            log.exception("Detector %s failed", ld.path)
            continue
        for f in found:
            h = ctx.histories.get(f.participant_id)
            if h is None or h.suppressed:  # §8.3 — whatever the detector does
                continue
            f.detector = ld.path
            findings.append(f)
    return ctx, loaded, findings


def detect(session: Session, method: Optional[str] = None) -> int:
    """Run every configured detector and record the results. Idempotent:
    returns the number of NEW alerts. `method` overrides the configured
    baseline method for this run only."""
    ctx, _, findings = _run_detectors(session, method)
    return _record(session, ctx, findings)


def _signal(f: Finding) -> str:
    return f"{f.indicator_code}:{f.participant_id}"


_LEGACY_SIGNALS = {"volume": "reported_volume", "errors": "validation_failure_rate", "overdue": "submission_cadence"}


def _backfill_legacy(session: Session, alerts: list[AnomalyAlert]) -> None:
    """Alerts raised before signal keys existed ("volume:12:2026-05")."""
    for a in alerts:
        if a.signal_key:
            continue
        kind, _, rest = a.dedupe_key.partition(":")
        code = _LEGACY_SIGNALS.get(kind, kind)
        a.indicator_code = a.indicator_code or code
        a.signal_key = f"{code}:{a.participant_id}"
        a.evidence_keys = a.evidence_keys or [rest]
        session.add(a)


def _copy_finding(alert: AnomalyAlert, f: Finding) -> None:
    for attr in ("indicator", "baseline_value", "observed_value", "deviation", "deviation_pct", "severity",
                 "recommended_area", "baseline_method", "baseline_method_key", "methodology", "detector"):
        setattr(alert, attr, getattr(f, attr))
    alert.data_sources = list(f.data_sources)
    alert.source_submission_ids = list(dict.fromkeys(f.source_submission_ids))


def _raise_severity(alert: AnomalyAlert, f: Finding, now: datetime) -> str:
    old = alert.severity
    _copy_finding(alert, f)
    reason = (f"Severity increased {old} → {f.severity} on re-detection: observed {f.observed_value} against "
              f"baseline {f.baseline_value} ({f.deviation}).")
    extra = {}
    if alert.status in SYSTEM_TRANSITIONS:
        extra = {"from": alert.status, "to": ESCALATED}
        alert.status = ESCALATED
        alert.status_changed_at = now
    alert.notes = [*(alert.notes or []), _note(reason + " Senior Compliance and Business users notified.", **extra)]
    return reason


def _record(session: Session, ctx: DetectionContext, findings: list[Finding]) -> int:
    alerts = list(session.exec(select(AnomalyAlert).order_by(AnomalyAlert.id)).all())
    _backfill_legacy(session, alerts)
    seen = {(a.signal_key, k) for a in alerts for k in (a.evidence_keys or [])}
    dedupe_keys = {a.dedupe_key for a in alerts}
    open_by_signal = {a.signal_key: a for a in alerts if a.status != CLOSED}
    closed_by_signal = {a.signal_key: a for a in alerts if a.status == CLOSED}

    # One finding per signal per scan: the most severe.
    best: dict[str, Finding] = {}
    for f in findings:
        sig = _signal(f)
        if sig not in best or RANK[f.severity] > RANK[best[sig].severity]:
            best[sig] = f

    now = ctx.now
    created: list[AnomalyAlert] = []
    escalated: list[tuple[AnomalyAlert, str, str]] = []
    for sig, f in best.items():
        current = open_by_signal.get(sig)
        if current is not None and RANK[f.severity] > RANK[current.severity]:
            # §9.3: the same open issue, now worse → escalate and notify.
            if f.evidence_key not in current.evidence_keys:
                current.evidence_keys = [*current.evidence_keys, f.evidence_key]
            current.last_detected_at = now
            escalated.append((current, _raise_severity(current, f, now), f"severity:{f.severity}"))
            session.add(current)
            seen.add((sig, f.evidence_key))
            continue
        if (sig, f.evidence_key) in seen:
            continue  # this evidence has already raised (or been absorbed by) an alert
        if current is not None:
            # New evidence for an issue that is still open: one alert per issue.
            current.evidence_keys = [*current.evidence_keys, f.evidence_key]
            current.source_submission_ids = list(dict.fromkeys([*current.source_submission_ids, *f.source_submission_ids]))
            current.last_detected_at = now
            current.notes = [*(current.notes or []), _note(
                f"Signal detected again: observed {f.observed_value} against baseline {f.baseline_value} ({f.deviation})."
            )]
            session.add(current)
            seen.add((sig, f.evidence_key))
            continue
        # No open alert for this signal: a first occurrence, or a recurrence
        # after closure — which is always a NEW alert (REQ-AI-006c).
        dedupe = f"{sig}:{f.evidence_key}"
        while dedupe in dedupe_keys:
            dedupe += "+"
        dedupe_keys.add(dedupe)
        previous = closed_by_signal.get(sig)
        alert = AnomalyAlert(
            participant_id=f.participant_id,
            dedupe_key=dedupe,
            signal_key=sig,
            evidence_keys=[f.evidence_key],
            indicator_code=f.indicator_code,
            indicator=f.indicator,
            baseline_value=f.baseline_value,
            observed_value=f.observed_value,
            deviation=f.deviation,
            recommended_area=f.recommended_area,
            severity=f.severity,
            baseline_method=f.baseline_method,
            recurrence_of=previous.id if previous else None,
            created_at=now,
            status_changed_at=now,
            last_detected_at=now,
        )
        _copy_finding(alert, f)
        alert.notes = [_note(
            f"Generated by the '{f.detector}' detector using {f.baseline_method}."
            + (f" Recurrence of ALT-{previous.id}, closed {previous.closed_at or previous.status_changed_at:%d %b %Y}."
               if previous else ""),
            to=GENERATED,
        )]
        session.add(alert)
        created.append(alert)
        open_by_signal[sig] = alert
        seen.add((sig, f.evidence_key))
    session.commit()

    names = {h.participant.id: h.participant.name for h in ctx.histories.values()}
    for alert in created:
        session.refresh(alert)
        _notify_generated(session, alert, names.get(alert.participant_id, ""))
    for alert, reason, key in escalated:
        session.refresh(alert)
        _notify_escalated(session, alert, names.get(alert.participant_id, ""), reason, key)
    return len(created)


def _notify_generated(session: Session, alert: AnomalyAlert, participant: str) -> None:
    """SRS §13: AI alert generated → Business + Compliance users, in-app."""
    notify.dispatch(
        session, "ai_alert_generated",
        notify.users_with_roles(session, UserRole.compliance, UserRole.business),
        f"AI alert ALT-{alert.id} ({alert.severity}): {alert.indicator}",
        f"{participant} — observed {alert.observed_value} against baseline {alert.baseline_value} ({alert.deviation}). "
        "Advisory: review and acknowledge in AI Decision Support.",
        link=f"/ai?alert={alert.id}",
        severity="alert" if alert.severity in ("CRITICAL", "HIGH") else "warning",
        dedupe_key=f"ai_alert_generated:{alert.id}",
    )


def _senior_recipients(session: Session) -> list[User]:
    # Per role, so a senior Compliance user doesn't hide Business seniors.
    return notify.senior_users(session, UserRole.compliance) + notify.senior_users(session, UserRole.business)


def _notify_escalated(session: Session, alert: AnomalyAlert, participant: str, reason: str, key: str) -> None:
    """REQ-AI-006b / §9.3: senior Compliance and Business users."""
    notify.dispatch(
        session, "ai_alert_escalated", _senior_recipients(session),
        f"AI alert ALT-{alert.id} escalated: {alert.indicator}",
        f"{participant} — {reason} Current status: {alert.status}.",
        link=f"/ai?alert={alert.id}",
        severity="alert",
        dedupe_key=f"ai_alert_escalated:{alert.id}:{key}",
    )


def auto_escalate(session: Session, now: Optional[datetime] = None) -> int:
    """REQ-AI-006b: an alert left at Acknowledged for more than
    anomaly.auto_escalate_days without progressing becomes Escalated and the
    senior users are notified. Idempotent (status changes; dispatch dedupes)."""
    days = int(config(session)["auto_escalate_days"])
    now = now or datetime.utcnow()
    due: list[tuple[AnomalyAlert, datetime]] = []
    for alert in session.exec(select(AnomalyAlert).where(AnomalyAlert.status == ACKNOWLEDGED)).all():
        waited = now - alert.status_changed_at
        if waited <= timedelta(days=days):
            continue
        since = alert.status_changed_at
        alert.notes = [*(alert.notes or []), _note(
            f"Auto-escalated: at Acknowledged for {waited.days} days without progressing (limit {days} days, "
            "REQ-AI-006b). Senior Compliance and Business users notified.",
            **{"from": ACKNOWLEDGED, "to": ESCALATED},
        )]
        alert.status = ESCALATED
        alert.status_changed_at = now
        session.add(alert)
        due.append((alert, since))
    session.commit()
    names = {p.id: p.name for p in session.exec(select(Participant)).all()}
    for alert, since in due:
        session.refresh(alert)
        _notify_escalated(
            session, alert, names.get(alert.participant_id, ""),
            f"No progress for more than {days} days after acknowledgement.", f"auto:{since.isoformat()}",
        )
    return len(due)


# ---- engine status, priority list, trends (REQ-AI-005/007/009/011) ------------------

def engine_status(session: Session) -> dict:
    cfg = config(session)
    loaded = load_detectors(cfg["detectors"])
    active, warning = _active_method(cfg, loaded)
    ctx = build_context(session, cfg, active)
    counts = Counter(a.status for a in session.exec(select(AnomalyAlert)).all())
    participants = []
    for h in sorted(ctx.histories.values(), key=lambda h: h.participant.name):
        participants.append({
            "participant_id": h.participant.id,
            "participant_name": h.participant.name,
            "participant_type": h.participant.type,
            "history_months": h.history_months,
            "first_submission_at": h.submissions[0].uploaded_at if h.submissions else None,
            "prior_months_with_data": len(h.prior_months()),
            "insufficient_history": h.suppressed,
            "insufficient_history_reason": h.suppressed_reason,
            "method": h.method,
            "method_label": method_label(h.method),
            "fallback_reason": h.fallback_reason,
        })
    return {
        "advisory_notice": ADVISORY_NOTICE,
        "active_method": active,
        "active_method_label": method_label(active),
        "configured_method": cfg["baseline_method"],
        "method_warning": warning,
        "methods": [{"key": k, **v} for k, v in METHODS.items()],
        "rolling_min_months": ROLLING_MIN_MONTHS,
        "config": cfg,
        "detectors": [d.info() for d in loaded],
        "participants": participants,
        "insufficient_history": [p for p in participants if p["insufficient_history"]],
        "status_counts": {s: counts.get(s, 0) for s in STATUSES},
        "lifecycle": {"statuses": STATUSES, "transitions": TRANSITIONS, "system_transitions": SYSTEM_TRANSITIONS},
        "schedule": "Detection runs every 15 minutes, after every submission upload, and on demand (Run scan now).",
    }


SEVERITY_POINTS = {"CRITICAL": 40, "HIGH": 25, "MEDIUM": 15, "LOW": 5}
PRIORITY_WEIGHTS = {"risk_score": 0.6, "open_alerts": 0.4}


def priority_list(session: Session) -> dict:
    """REQ-AI-005: participants ranked by composite risk signal strength —
    the participant risk score (services.risk, REQ-P360-009..012) blended
    with the severity of their open AI alerts. A participant without 3
    months of submission history has no risk score (REQ-P360-012): it is
    labelled, not scored, and ranked on its alerts alone. Every input is
    shown so the ranking is explainable."""
    from app.services import risk

    cfg = config(session)
    ctx = build_context(session, cfg, cfg["baseline_method"])
    open_alerts = session.exec(select(AnomalyAlert).where(AnomalyAlert.status != CLOSED)).all()
    rows = []
    for r in risk.latest_scores(session):
        pid = r["participant_id"]
        mine = sorted((a for a in open_alerts if a.participant_id == pid), key=lambda a: RANK.get(a.severity, 0), reverse=True)
        points = min(100, sum(SEVERITY_POINTS.get(a.severity, 0) for a in mine))
        scored = r["composite"] is not None
        if scored:
            composite = PRIORITY_WEIGHTS["risk_score"] * r["composite"] + PRIORITY_WEIGHTS["open_alerts"] * points
        else:
            composite = PRIORITY_WEIGHTS["open_alerts"] * points
        signals = []
        if scored and r["top_factor"]:
            top = next(c["indicators"][r["top_factor"]] for c in r["categories"].values() if r["top_factor"] in c["indicators"])
            signals.append(f"Risk score {r['composite']:g} ({r['band']}) driven by {top['label'].lower()} "
                           f"({top['score']:.0f}/100)")
        elif not scored:
            signals.append(f"Risk score: {risk.INSUFFICIENT_MESSAGE}")
        signals += [f"{a.severity} alert ALT-{a.id}: {a.indicator}" for a in mine[:3]]
        h = ctx.histories.get(pid)
        rows.append({
            "participant_id": pid,
            "participant_name": r["participant_name"],
            "participant_type": r["participant_type"],
            "region": r["region"],
            "composite_score": round(composite, 1),
            "signal_strength": "High" if composite >= 60 else "Medium" if composite >= 30 else "Low",
            "risk_score": r["composite"],
            "risk_status": r["status"],
            "risk_message": r["message"],
            "risk_band": r["band"],
            "risk_components": r["components"],
            "risk_categories": {k: v["score"] for k, v in r["categories"].items()},
            "alert_points": points,
            "open_alerts": len(mine),
            "highest_severity": mine[0].severity if mine else None,
            "open_alert_ids": [a.id for a in mine],
            "signals": signals or ["No open risk signals"],
            "insufficient_history": bool(h and h.suppressed),
            "insufficient_history_reason": h.suppressed_reason if h else "",
            "history_months": h.history_months if h else 0,
        })
    rows.sort(key=lambda x: (x["composite_score"], x["risk_score"] or 0), reverse=True)
    for i, row in enumerate(rows, start=1):
        row["rank"] = i
    return {
        "methodology": (
            f"Composite signal = {PRIORITY_WEIGHTS['risk_score']:.0%} × participant risk score + "
            f"{PRIORITY_WEIGHTS['open_alerts']:.0%} × open-alert points (CRITICAL {SEVERITY_POINTS['CRITICAL']}, "
            f"HIGH {SEVERITY_POINTS['HIGH']}, MEDIUM {SEVERITY_POINTS['MEDIUM']}, LOW {SEVERITY_POINTS['LOW']}; capped at 100). "
            "The risk score is the Participant 360 risk assessment (compliance, operational and technical risk, "
            "weighted per Settings, recalculated nightly); participants with less than 3 months of submission history "
            "have none yet and are ranked on their alerts alone. Strength: High ≥ 60, Medium ≥ 30."
        ),
        "data_sources": [
            "Participant risk score (Participant 360): Compliance Register, incidents, data source status history, pipeline jobs, submissions",
            "Open AI alerts (this module)",
            "Settings: risk methodology",
        ],
        "weights": PRIORITY_WEIGHTS,
        "severity_points": SEVERITY_POINTS,
        "risk_methodology": risk.config(session),
        "rows": rows,
    }


def _month_bounds(key: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(key, "%Y-%m")
    return start, start + relativedelta(months=1)


def trend_summary(session: Session, months: Optional[int] = None) -> dict:
    """REQ-AI-007: operational and compliance trends over the last N months
    (default 3, from Settings) across all participants. A metric whose data
    doesn't exist yet is returned as null with the reason, never as zero."""
    months = months or int(config(session)["trend_months"])
    now = datetime.utcnow()
    keys = [month_key(now - relativedelta(months=i)) for i in range(months - 1, -1, -1)]
    start, _ = _month_bounds(keys[0])

    subs = session.exec(select(Submission).where(Submission.uploaded_at >= start)).all()
    alerts = session.exec(select(AnomalyAlert).where(AnomalyAlert.created_at >= start)).all()
    issues = session.exec(select(Issue)).all()
    participants = session.exec(select(Participant)).all()
    requirements = session.exec(select(ComplianceRequirement).where(ComplianceRequirement.active == True)).all()  # noqa: E712
    documents = session.exec(select(ComplianceDocument)).all()
    today = date.today()

    operational, compliance = [], []
    for key in keys:
        lo, hi = _month_bounds(key)
        in_month = [s for s in subs if lo <= s.uploaded_at < hi]
        failed = sum(1 for s in in_month if s.result == SubmissionResult.failed)
        operational.append({
            "month": key,
            "label": month_label(key),
            "partial": key == keys[-1],
            "submissions": len(in_month),
            "failed_submissions": failed,
            "validation_error_rate": round(failed / len(in_month) * 100, 1) if in_month else None,
            "validation_errors": sum(s.error_count for s in in_month),
            "alerts_raised": sum(1 for a in alerts if lo <= a.created_at < hi),
            "incidents_raised": sum(1 for i in issues if lo <= i.created_at < hi),
        })

        # Participants expected to report at least monthly and onboarded by then.
        expected = [p for p in participants if p.created_at < hi and (p.expected_frequency_days or 30) <= 31]
        reported = {s.participant_id for s in in_month}
        due = [r for r in requirements if lo.date() <= r.due_date < hi.date()]
        on_time = [r for r in due if r.submitted_at and r.submitted_at.date() <= r.due_date]
        overdue = [r for r in due if r.due_date < today and not (r.submitted_at and r.submitted_at.date() <= r.due_date)]
        compliance.append({
            "month": key,
            "label": month_label(key),
            "partial": key == keys[-1],
            "reporting_coverage_pct": round(len(reported & {p.id for p in expected}) / len(expected) * 100, 1) if expected else None,
            "requirements_due": len(due),
            "on_time_rate": round(len(on_time) / len(due) * 100, 1) if due else None,
            "overdue_items": len(overdue) if requirements else None,
            "document_expiries": sum(1 for d in documents if d.expiry_date and lo.date() <= d.expiry_date < hi.date()),
        })

    open_alerts = session.exec(select(AnomalyAlert).where(AnomalyAlert.status != CLOSED)).all()
    snapshot = {
        "open_incidents": sum(1 for i in issues if i.status in UNRESOLVED_INCIDENT_STATUSES),
        "open_alerts": len(open_alerts),
        "open_alerts_by_severity": {s: sum(1 for a in open_alerts if a.severity == s) for s in reversed(SEVERITIES)},
        "overdue_requirements": sum(
            1 for r in requirements
            if r.submission_status == "Overdue" or (r.due_date < today and r.submission_status not in ("Approved", "Submitted", "Under Review"))
        ) if requirements else None,
        "documents_expired": sum(1 for d in documents if document_status(d).value == "Expired"),
    }
    register_note = "" if requirements else "No compliance requirements are registered yet (Compliance Register), so on-time and overdue figures are not available."
    return {
        "months": keys,
        "window_label": f"{month_label(keys[0])} – {month_label(keys[-1])} (current month to date)",
        "operational": operational,
        "compliance": compliance,
        "snapshot": snapshot,
        "summary": _trend_sentences(operational, compliance),
        "register_note": register_note,
        "metrics": [
            {"key": "submissions", "group": "operational", "label": "Submissions received",
             "source": "Submission records (upload date)"},
            {"key": "validation_error_rate", "group": "operational", "label": "Validation error rate",
             "source": "Submission validation results — failed ÷ received"},
            {"key": "alerts_raised", "group": "operational", "label": "AI alerts raised", "source": "AI alerts (this module)"},
            {"key": "incidents_raised", "group": "operational", "label": "Incidents raised",
             "source": "Incident / issue register (created date)"},
            {"key": "reporting_coverage_pct", "group": "compliance", "label": "Reporting coverage",
             "source": "Participants with ≥1 submission in the month ÷ participants expected to report monthly"},
            {"key": "on_time_rate", "group": "compliance", "label": "On-time submission rate",
             "source": "Compliance Register — requirements due in the month submitted by their due date"},
            {"key": "overdue_items", "group": "compliance", "label": "Overdue items",
             "source": "Compliance Register — requirements due in the month not submitted by their due date"},
            {"key": "document_expiries", "group": "compliance", "label": "Document expiries",
             "source": "Compliance documents (expiry date)"},
        ],
        "methodology": (
            "Calendar-month totals across all participants. The current month is partial (to date). Rates are "
            "omitted for months with no underlying records rather than shown as zero."
        ),
    }


def _trend_sentences(operational: list[dict], compliance: list[dict]) -> list[str]:
    if len(operational) < 2:
        return []
    first, last = operational[0], operational[-1]
    out = [
        f"{sum(m['submissions'] for m in operational)} submissions received over the period "
        f"({first['submissions']} in {first['label']}, {last['submissions']} in {last['label']} to date).",
        f"{sum(m['alerts_raised'] for m in operational)} AI alerts and {sum(m['incidents_raised'] for m in operational)} "
        "incidents raised in the period.",
    ]
    rates = [m for m in operational if m["validation_error_rate"] is not None]
    if len(rates) >= 2:
        a, b = rates[0], rates[-1]
        trend = "rose" if b["validation_error_rate"] > a["validation_error_rate"] else "fell" if b["validation_error_rate"] < a["validation_error_rate"] else "was unchanged"
        out.append(f"Validation error rate {trend} from {a['validation_error_rate']}% ({a['label']}) to "
                   f"{b['validation_error_rate']}% ({b['label']}).")
    cover = [m for m in compliance if m["reporting_coverage_pct"] is not None]
    if cover:
        out.append(f"Reporting coverage was {cover[-1]['reporting_coverage_pct']}% in {cover[-1]['label']}"
                   + (f" (vs {cover[0]['reporting_coverage_pct']}% in {cover[0]['label']})." if len(cover) > 1 else "."))
    return out
