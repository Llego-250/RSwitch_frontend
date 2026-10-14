"""Participant risk assessment (SRS REQ-P360-009..012, §11.5, §18
ParticipantRiskScore). This is the contract every other module reads risk
through — Participant 360, the AI priority list, Reports (§14.3) and the
Dashboard (§15.2 risk distribution).

Shape of one score (dict):
    participant_id, participant_name, participant_code, participant_type, region
    status        "scored" | "insufficient_data"   (REQ-P360-012: < 3 months)
    message       None, or "Insufficient data — score pending."
    composite     float 0–100 (higher = riskier) or None when insufficient
    band          "Low" | "Medium" | "High" or None
    categories    {"compliance"|"operational"|"technical": {"score": float|None,
                   "weight": float, "label", "applied_weight", "measured",
                   "indicators": {name: {"value", "unit", "score", "label",
                   "measured", "enabled", "weight", "applied_weight",
                   "contribution", "detail", "inputs"}}}}  ({} when insufficient)
    components    the four §11.5 components as 0–100 risk: {"integration",
                  "compliance", "incidents", "overdue"} (None when unmeasured)
    top_factor    indicator name contributing most to the score, or None
    top_factor_label
    months_of_history, first_submission_at, eligible_from (ISO date),
    computed_at (ISO datetime), trigger, run_id

How it works
------------
Nine indicators in three categories (P360-010) are measured from stored
records and each mapped linearly onto 0–100 between a "good" value (0) and a
"bad" value (100). A category score is the weighted mean of its indicators;
the composite is the weighted mean of the categories. Weights, the good/bad
thresholds, which indicators are enabled, severity points, band cut-offs and
the look-back window are Settings → "risk" (P360-011). The defaults reproduce
§11.5 exactly (see settings_store.DEFAULTS["risk"]).

An indicator that can't be measured (e.g. no compliance deadline fell due in
the window) is left out and the remaining weights in its category are scaled
up; a category with nothing measurable is left out of the composite the same
way. The breakdown says which (applied_weight, measured).

Scores are recalculated nightly (§11.5, scheduler → run_nightly_if_due) and on
demand after a methodology change; each run is kept in ParticipantRiskScore
(history) and the composite mirrored on Participant.risk_score (§10.1).
Everything is institution-level — no customer-level data (REQ-P360-013)."""

import hashlib
import json
import logging
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import uuid4

import sqlalchemy as sa
from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.core.errors import problem
from app.models.admin import SystemSetting
from app.models.compliance import ComplianceCycle, ComplianceRequirement
from app.models.document import ComplianceDocument
from app.models.enums import ComplianceStatus, IntegrationStatus, SubmissionResult
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.pipeline import PipelineJob, PipelineJobStatus
from app.models.risk import IntegrationStatusChange, ParticipantRiskScore
from app.models.submission import Submission
from app.services.settings_store import DEFAULTS

log = logging.getLogger("rdip.risk")

SETTING_KEY = "risk"
LEGACY_SETTING_KEY = "risk_weights"  # pre-P360 flat §11.5 weights
MIN_HISTORY_MONTHS = 3  # REQ-P360-012 — fixed by the SRS, not configurable
DAYS_PER_MONTH = 30.44  # the month length the AI engine uses for history (§8.3)
TECHNICAL_WINDOW_DAYS = 30  # REQ-P360-007
NIGHTLY_HOUR = 2  # §11.5 nightly: from 02:00 in the organisation's timezone
INSUFFICIENT_MESSAGE = "Insufficient data — score pending."
SCORED, INSUFFICIENT = "scored", "insufficient_data"
TRIGGERS = ("Nightly", "Settings change", "On demand", "Initial")

CATEGORIES: dict[str, dict] = {
    "compliance": {"label": "Compliance Risk",
                   "description": "How reliably the institution meets its regulatory reporting obligations."},
    "operational": {"label": "Operational Risk",
                    "description": "How often incidents occur, how serious they are and how fast they are resolved."},
    "technical": {"label": "Technical Risk",
                  "description": "How reliably the institution's data reaches RDIP (last 30 days)."},
}

# Static definitions; weights and thresholds live in Settings. `bounds` limit
# the good/bad thresholds an admin can set; `component` is the §11.5 name.
INDICATORS: dict[str, dict] = {
    "submission_adherence_rate": {
        "category": "compliance", "label": "Submission adherence rate", "unit": "%", "window": "lookback",
        "bounds": (0, 100), "component": "compliance",
        "definition": "Of the compliance deadlines that fell due in the window, the share met: approved with the "
                      "file received by the due date (the Compliance module's adherence rate). Lower is riskier.",
        "source": "Compliance Register cycles",
    },
    "overdue_deadlines": {
        "category": "compliance", "label": "Overdue deadlines", "unit": "%", "window": "lookback",
        "bounds": (0, 100), "component": "overdue",
        "definition": "Of the compliance deadlines that fell due in the window, the share missed — no acceptable "
                      "file by the due date (it went Overdue, or was approved late). The §11.5 overdue submission rate.",
        "source": "Compliance Register cycles",
    },
    "rejection_history": {
        "category": "compliance", "label": "Rejection history", "unit": "%", "window": "lookback",
        "bounds": (0, 100), "component": None,
        "definition": "Share of the data submissions and register documents sent in the window that failed "
                      "validation or were rejected at review (REQ-COMP-008 failure rate).",
        "source": "Submissions and compliance documents",
    },
    "incident_frequency": {
        "category": "operational", "label": "Incident frequency", "unit": "incidents", "window": "lookback",
        "bounds": (0, 1000), "component": "incidents",
        "definition": "Number of incidents that occurred in the window (incident date, or the date raised).",
        "source": "Incident register",
    },
    "incident_severity": {
        "category": "operational", "label": "Incident severity", "unit": "index", "window": "lookback",
        "bounds": (0, 100), "component": None,
        "definition": "Average severity of the incidents in the window plus any still unresolved, using the "
                      "severity points in Settings (0 when there were none).",
        "source": "Incident register",
    },
    "resolution_time": {
        "category": "operational", "label": "Resolution time", "unit": "days", "window": "lookback",
        "bounds": (0, 3650), "component": None,
        "definition": "Average days from an incident being raised to being resolved, over the incidents in the "
                      "window plus any still unresolved (counted at their age so far). 0 when there were none.",
        "source": "Incident register",
    },
    "integration_uptime": {
        "category": "technical", "label": "Integration uptime", "unit": "%", "window": "technical",
        "bounds": (0, 100), "component": "integration",
        "definition": "Share of the last 30 days the participant's data sources were not Failed, from their recorded "
                      "status history (time Paused or Not Configured is left out). The §11.5 integration reliability. "
                      "Lower is riskier.",
        "source": "Data source status history",
    },
    "pipeline_failure_rate": {
        "category": "technical", "label": "Pipeline failure rate", "unit": "%", "window": "technical",
        "bounds": (0, 100), "component": None,
        "definition": "Share of the pipeline jobs that finished in the last 30 days that Failed (jobs stopped by an "
                      "admin are left out).",
        "source": "Pipeline jobs",
    },
    "avg_submission_latency": {
        "category": "technical", "label": "Average submission latency", "unit": "minutes", "window": "technical",
        "bounds": (0, 100000), "component": None,
        "definition": "Average time from a transfer being queued for processing (file uploaded on the institution's "
                      "behalf, or a scheduled/manual API pull) to its data being loaded, for pipeline jobs completed "
                      "in the last 30 days.",
        "source": "Pipeline jobs",
    },
}
COMPONENT_LABELS = {
    "integration": "integration reliability", "compliance": "compliance adherence rate",
    "incidents": "incident frequency", "overdue": "overdue submission rate",
}
SEVERITIES = ("Critical", "High", "Medium", "Low")

# Data-source statuses (§9.1) for uptime. Queued/Running are a transfer in
# flight: the source keeps the state it had. Paused/Not Configured is time
# nobody expects data, so it is neither up nor down.
_DOWN = {IntegrationStatus.failed.value}
_TRANSIENT = {IntegrationStatus.queued.value, IntegrationStatus.running.value}
_EXCLUDED = {IntegrationStatus.paused.value, IntegrationStatus.not_configured.value}


# ---- methodology (Settings → "risk", REQ-P360-011) ---------------------------

def default_config() -> dict:
    return deepcopy(DEFAULTS[SETTING_KEY])


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _merge(base: dict, value: dict) -> dict:
    """value over base; indicators and the small dicts merge key by key, so
    a stored row from before an indicator existed still loads."""
    out = deepcopy(base)
    for key, v in (value or {}).items():
        if key == "indicators" and isinstance(v, dict):
            for name, spec in v.items():
                out["indicators"][name] = {**out["indicators"].get(name, {}), **spec} if isinstance(spec, dict) else spec
        elif isinstance(v, dict) and isinstance(out.get(key), dict):
            out[key] = {**out[key], **v}
        else:
            out[key] = v
    return out


def validate_config(value: dict, current: Optional[dict] = None) -> list[dict]:
    """§20.2 problems for a methodology (merged over `current`, else the
    defaults); empty when valid."""
    cfg = _merge(current or default_config(), value or {})
    problems: list[dict] = []
    unknown = set(cfg) - set(DEFAULTS[SETTING_KEY])
    if unknown:
        problems.append(problem(sorted(unknown)[0], "unknown", "Unknown risk setting."))

    weights = cfg.get("category_weights")
    if not isinstance(weights, dict) or set(weights) != set(CATEGORIES) or not all(_num(v) for v in weights.values()):
        problems.append(problem("category_weights", "type", "Give a weight to each of the three risk categories."))
        weights = None
    elif any(not 0 <= v <= 100 for v in weights.values()):
        problems.append(problem("category_weights", "range", "Each category weight must be between 0 and 100."))
    elif abs(sum(weights.values()) - 100) > 0.01:
        problems.append(problem("category_weights", "sum",
                                f"Category weights must add up to 100 (now {sum(weights.values()):g})."))

    indicators = cfg.get("indicators")
    if not isinstance(indicators, dict):
        problems.append(problem("indicators", "type", "Indicators must be configured per indicator."))
        indicators = {}
    for name in indicators:
        if name not in INDICATORS:
            problems.append(problem(f"indicators.{name}", "unknown", "Unknown risk indicator."))
    for name, spec in INDICATORS.items():
        ind = indicators.get(name)
        field = f"indicators.{name}"
        if not isinstance(ind, dict):
            problems.append(problem(field, "required", f"Configure “{spec['label']}”."))
            continue
        if not isinstance(ind.get("enabled"), bool):
            problems.append(problem(f"{field}.enabled", "type", "Must be on or off."))
        if not _num(ind.get("weight")) or not 0 <= ind["weight"] <= 100:
            problems.append(problem(f"{field}.weight", "range", "Weight must be between 0 and 100."))
        lo, hi = spec["bounds"]
        good, bad = ind.get("good"), ind.get("bad")
        if not (_num(good) and _num(bad)) or not (lo <= good <= hi and lo <= bad <= hi):
            problems.append(problem(f"{field}.thresholds", "range",
                                    f"Thresholds for “{spec['label']}” must be numbers from {lo:g} to {hi:g}."))
        elif good == bad:
            problems.append(problem(f"{field}.thresholds", "distinct",
                                    f"The 0-risk and 100-risk values of “{spec['label']}” must differ."))
    if weights is not None:
        for cat, meta in CATEGORIES.items():
            if weights.get(cat, 0) <= 0:
                continue
            members = [indicators.get(n) for n, s in INDICATORS.items() if s["category"] == cat]
            total = sum(i["weight"] for i in members if isinstance(i, dict) and i.get("enabled") is True and _num(i.get("weight")))
            if abs(total - 100) > 0.01:
                problems.append(problem(f"indicators.{cat}", "sum",
                                        f"{meta['label']} indicator weights (enabled indicators) must add up to 100 "
                                        f"(now {total:g})."))

    points = cfg.get("severity_points")
    if not isinstance(points, dict) or set(points) != set(SEVERITIES) or not all(_num(v) and 0 <= v <= 100 for v in points.values()):
        problems.append(problem("severity_points", "range", "Give each severity (Critical, High, Medium, Low) 0 to 100 points."))

    bands = cfg.get("bands")
    if not isinstance(bands, dict) or not (_num(bands.get("medium")) and _num(bands.get("high"))):
        problems.append(problem("bands", "type", "Set the Medium and High band cut-offs."))
    elif not 0 < bands["medium"] < bands["high"] < 100:
        problems.append(problem("bands", "order", "Cut-offs must satisfy 0 < Medium < High < 100."))

    months = cfg.get("lookback_months")
    if not (isinstance(months, int) and not isinstance(months, bool) and 1 <= months <= 36):
        problems.append(problem("lookback_months", "range", "The look-back window is a whole number of months from 1 to 36."))
    return problems


def _from_legacy(value: dict) -> dict:
    """The pre-P360 flat weights {integration, compliance, incidents, overdue}
    mapped onto the same indicators, so a customised §11.5 split survives."""
    cfg = default_config()
    w = {k: float(value.get(k, d)) if _num(value.get(k, d)) else float(d)
         for k, d in (("integration", 30), ("compliance", 30), ("incidents", 20), ("overdue", 20))}
    compliance = w["compliance"] + w["overdue"]
    cfg["category_weights"] = {"compliance": compliance, "operational": w["incidents"], "technical": w["integration"]}
    if compliance > 0:
        share = round(w["compliance"] / compliance * 100, 4)
        cfg["indicators"]["submission_adherence_rate"]["weight"] = share
        cfg["indicators"]["overdue_deadlines"]["weight"] = round(100 - share, 4)
    return cfg


def load_config(session: Session) -> tuple[dict, str]:
    """(methodology in force, warning). A stored value that no longer
    validates never breaks scoring: the defaults are used and the warning
    says so."""
    row = session.get(SystemSetting, SETTING_KEY)
    if row is not None and row.value:
        cfg = _merge(default_config(), row.value)
        origin = "Settings"
    else:
        legacy = session.get(SystemSetting, LEGACY_SETTING_KEY)
        if legacy is None or not legacy.value:
            return default_config(), ""
        cfg, origin = _from_legacy(legacy.value), "the earlier risk weights setting"
    problems = validate_config(cfg)
    if problems:
        log.warning("Stored risk methodology is invalid (%s); using defaults", problems[0]["message"])
        return default_config(), f"The methodology stored in {origin} is invalid ({problems[0]['message']}); the defaults are in force."
    return cfg, ""


def config(session: Session) -> dict:
    return load_config(session)[0]


def config_hash(cfg: dict) -> str:
    return hashlib.sha1(json.dumps(cfg, sort_keys=True, default=str).encode()).hexdigest()[:16]


# ---- measurement --------------------------------------------------------------

@dataclass
class Window:
    """Everything is measured as of `now` (naive UTC), so a run stamped in the
    past reads only what existed then."""

    now: datetime
    today: date  # organisation's calendar day
    zone: object
    lookback_months: int

    @property
    def lookback_start(self) -> date:
        return self.today - relativedelta(months=self.lookback_months)

    @property
    def lookback_since(self) -> datetime:
        return datetime.combine(self.lookback_start, time.min)

    @property
    def technical_since(self) -> datetime:
        return self.now - timedelta(days=TECHNICAL_WINDOW_DAYS)


def window(session: Session, now: Optional[datetime] = None, cfg: Optional[dict] = None) -> Window:
    from app.services.governance_jobs import org_zone

    now = now or datetime.utcnow()
    zone = org_zone(session)
    today = now.replace(tzinfo=timezone.utc).astimezone(zone).date()
    return Window(now, today, zone, int((cfg or config(session))["lookback_months"]))


def _measure(value, detail: str, inputs: Optional[dict] = None, measured: Optional[bool] = None) -> dict:
    return {"value": None if value is None else round(float(value), 2), "detail": detail, "inputs": inputs or {},
            "measured": value is not None if measured is None else measured}


def _pct(part: int, whole: int) -> Optional[float]:
    return part / whole * 100 if whole else None


def _deadline_missed(cycle: ComplianceCycle, w: Window) -> bool:
    """As of w.now: due date passed without an acceptable file in time —
    the cycle went Overdue, or was approved late. A valid file received in
    time and still awaiting RSwitch's review is not missed (§6.5)."""
    from app.services.compliance import deadline_utc

    if cycle.due_date >= w.today:
        return False
    if cycle.approved_at and cycle.approved_at <= w.now:
        return cycle.on_time is False
    if cycle.overdue_at and cycle.overdue_at <= w.now:
        return True
    in_time = cycle.submitted_at is not None and cycle.submitted_at < deadline_utc(cycle.due_date, w.zone)
    in_review = cycle.stage in (ComplianceStatus.submitted.value, ComplianceStatus.under_review.value,
                                ComplianceStatus.approved.value)
    return not (in_time and in_review)


def measure_compliance(session: Session, pid: int, w: Window) -> dict[str, dict]:
    cycles = session.exec(
        select(ComplianceCycle).join(ComplianceRequirement, ComplianceCycle.requirement_id == ComplianceRequirement.id)
        .where(ComplianceRequirement.participant_id == pid, ComplianceCycle.due_date >= w.lookback_start,
               ComplianceCycle.due_date < w.today, ComplianceCycle.opened_at <= w.now)
    ).all()
    on_time = sum(1 for c in cycles if c.on_time and c.approved_at and c.approved_at <= w.now)
    missed = sum(1 for c in cycles if _deadline_missed(c, w))

    subs = session.exec(select(Submission).where(Submission.participant_id == pid, Submission.uploaded_at >= w.lookback_since,
                                                 Submission.uploaded_at <= w.now)).all()
    docs = session.exec(select(ComplianceDocument).where(ComplianceDocument.participant_id == pid,
                                                         ComplianceDocument.uploaded_at >= w.lookback_since,
                                                         ComplianceDocument.uploaded_at <= w.now,
                                                         ComplianceDocument.review_status != "")).all()

    def rejected(obj, status: str) -> bool:
        return status == ComplianceStatus.rejected.value and obj.reviewed_at is not None and obj.reviewed_at <= w.now

    failed = sum(1 for s in subs if s.result == SubmissionResult.failed)
    refused = sum(1 for s in subs if s.result != SubmissionResult.failed and rejected(s, s.status))
    refused += sum(1 for d in docs if rejected(d, d.review_status))
    sent = len(subs) + len(docs)
    window_text = f"last {w.lookback_months} months"
    return {
        "submission_adherence_rate": _measure(
            _pct(on_time, len(cycles)),
            f"{on_time} of {len(cycles)} deadline(s) met on time ({window_text})" if cycles
            else f"No compliance deadline fell due in the {window_text}",
            {"deadlines_due": len(cycles), "met_on_time": on_time}),
        "overdue_deadlines": _measure(
            _pct(missed, len(cycles)),
            f"{missed} of {len(cycles)} deadline(s) missed ({window_text})" if cycles
            else f"No compliance deadline fell due in the {window_text}",
            {"deadlines_due": len(cycles), "missed": missed}),
        "rejection_history": _measure(
            _pct(failed + refused, sent),
            f"{failed} failed validation and {refused} rejected at review, of {sent} sent ({window_text})" if sent
            else f"Nothing was sent in the {window_text}",
            {"sent": sent, "failed_validation": failed, "rejected": refused}),
    }


def measure_operational(session: Session, pid: int, w: Window, cfg: dict) -> dict[str, dict]:
    incidents = session.exec(select(Issue).where(Issue.participant_id == pid, Issue.created_at <= w.now)).all()

    def occurred(i: Issue) -> date:
        return i.incident_date or i.created_at.date()

    def resolved_by_then(i: Issue) -> Optional[datetime]:
        end = i.resolved_at or i.closed_at
        return end if end is not None and end <= w.now else None

    in_window = [i for i in incidents if occurred(i) >= w.lookback_start]
    exposure = in_window + [i for i in incidents if i not in in_window and resolved_by_then(i) is None]
    points = cfg["severity_points"]
    severity = sum(points.get(i.severity.value, 0) for i in exposure) / len(exposure) if exposure else 0.0
    days = [((resolved_by_then(i) or w.now) - i.created_at).total_seconds() / 86400 for i in exposure]
    unresolved = sum(1 for i in exposure if resolved_by_then(i) is None)
    by_severity = {s: sum(1 for i in exposure if i.severity.value == s) for s in SEVERITIES}
    window_text = f"last {w.lookback_months} months"
    none = "No incidents in the window and none unresolved"
    return {
        "incident_frequency": _measure(len(in_window), f"{len(in_window)} incident(s) in the {window_text}",
                                       {"incidents": len(in_window)}),
        "incident_severity": _measure(
            severity, ", ".join(f"{n} {s}" for s, n in by_severity.items() if n) or none,
            {"incidents_considered": len(exposure), **{s.lower(): n for s, n in by_severity.items()}}),
        "resolution_time": _measure(
            sum(days) / len(days) if days else 0.0,
            (f"Average over {len(days)} incident(s)" + (f", {unresolved} still unresolved" if unresolved else ""))
            if days else none,
            {"incidents_considered": len(days), "unresolved": unresolved}),
    }


def _source_uptime(events: list[tuple[datetime, str]], start: datetime, end: datetime) -> tuple[float, float]:
    """(observed seconds, failed seconds) of one data source in [start, end]."""
    def classify(status: str, previous: Optional[str]) -> Optional[str]:
        if status in _TRANSIENT:
            return previous
        if status in _EXCLUDED:
            return "excluded"
        return "down" if status in _DOWN else "up"

    state: Optional[str] = None
    cursor = start
    observed = down = 0.0
    for at, status in events:
        if at <= start:
            state = classify(status, state)
            continue
        if at >= end:
            break
        span = (at - cursor).total_seconds()
        if state in ("up", "down"):
            observed += span
            down += span if state == "down" else 0
        state, cursor = classify(status, state), at
    span = (end - cursor).total_seconds()
    if state in ("up", "down"):
        observed += span
        down += span if state == "down" else 0
    return observed, down


def _status_events(session: Session, integration: Integration, until: datetime) -> list[tuple[datetime, str]]:
    """Recorded status history up to `until`. Before recording began only
    the current status is known, from its last change (updated_at)."""
    rows = session.exec(
        select(IntegrationStatusChange).where(IntegrationStatusChange.integration_id == integration.id,
                                              IntegrationStatusChange.at <= until)
        .order_by(IntegrationStatusChange.at, IntegrationStatusChange.id)
    ).all()
    if rows:
        return [(r.at, r.status) for r in rows]
    has_later = session.exec(select(IntegrationStatusChange.id).where(IntegrationStatusChange.integration_id == integration.id)).first()
    since = integration.updated_at or integration.created_at
    if has_later is None and since <= until:
        return [(since, IntegrationStatus(integration.status).value)]
    return []


def technical_performance(session: Session, pid: int, now: Optional[datetime] = None) -> dict:
    """REQ-P360-007 Technical Performance over the last 30 days — the same
    measurements the Technical Risk indicators score."""
    now = now or datetime.utcnow()
    start = now - timedelta(days=TECHNICAL_WINDOW_DAYS)
    sources = []
    observed_total = down_total = 0.0
    for i in session.exec(select(Integration).where(Integration.participant_id == pid).order_by(Integration.source_name)).all():
        observed, down = _source_uptime(_status_events(session, i, now), start, now)
        observed_total += observed
        down_total += down
        sources.append({
            "integration_id": i.id, "source_name": i.source_name, "integration_mode": i.integration_mode,
            "status": IntegrationStatus(i.status).value,
            "uptime_pct": round((1 - down / observed) * 100, 1) if observed else None,
            "observed_hours": round(observed / 3600, 1), "failed_hours": round(down / 3600, 1),
        })
    jobs = session.exec(select(PipelineJob).where(PipelineJob.participant_id == pid, PipelineJob.finished_at >= start,
                                                  PipelineJob.finished_at <= now)).all()
    finished = [j for j in jobs if j.status in (PipelineJobStatus.completed.value, PipelineJobStatus.failed.value)]
    failed = [j for j in finished if j.status == PipelineJobStatus.failed.value]
    latencies = [(j.finished_at - j.queued_at).total_seconds() / 60 for j in finished
                 if j.status == PipelineJobStatus.completed.value and j.queued_at and j.finished_at >= j.queued_at]
    subs = session.exec(select(Submission).where(Submission.participant_id == pid, Submission.uploaded_at >= start,
                                                 Submission.uploaded_at <= now)).all()
    rejected = sum(1 for s in subs if s.result == SubmissionResult.failed)
    return {
        "window_days": TECHNICAL_WINDOW_DAYS,
        "window_start": start.isoformat(),
        "window_end": now.isoformat(),
        "uptime_pct": round((1 - down_total / observed_total) * 100, 1) if observed_total else None,
        "observed_hours": round(observed_total / 3600, 1),
        "failed_hours": round(down_total / 3600, 1),
        "sources": sources,
        "pipeline_failure_rate_pct": round(len(failed) / len(finished) * 100, 1) if finished else None,
        "jobs_finished": len(finished),
        "jobs_failed": len(failed),
        "submission_failure_rate_pct": round(rejected / len(subs) * 100, 1) if subs else None,
        "submissions_received": len(subs),
        "submissions_failed_validation": rejected,
        "avg_submission_latency_minutes": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "latency_samples": len(latencies),
        "definitions": {
            "uptime_pct": INDICATORS["integration_uptime"]["definition"],
            "pipeline_failure_rate_pct": INDICATORS["pipeline_failure_rate"]["definition"],
            "submission_failure_rate_pct": "Share of the files and API payloads received in the last 30 days that "
                                           "failed schema validation (nothing loaded).",
            "avg_submission_latency_minutes": INDICATORS["avg_submission_latency"]["definition"],
        },
    }


def measure_technical(session: Session, pid: int, w: Window) -> tuple[dict[str, dict], dict]:
    perf = technical_performance(session, pid, w.now)
    sources = len(perf["sources"])
    return {
        "integration_uptime": _measure(
            perf["uptime_pct"],
            f"{perf['failed_hours']:g} h Failed of {perf['observed_hours']:g} h observed across {sources} data source(s)"
            if perf["uptime_pct"] is not None else
            ("No data source status known in the last 30 days" if sources else "No data source configured"),
            {"observed_hours": perf["observed_hours"], "failed_hours": perf["failed_hours"], "data_sources": sources}),
        "pipeline_failure_rate": _measure(
            perf["pipeline_failure_rate_pct"],
            f"{perf['jobs_failed']} of {perf['jobs_finished']} pipeline job(s) failed" if perf["jobs_finished"]
            else "No pipeline job finished in the last 30 days",
            {"jobs_finished": perf["jobs_finished"], "jobs_failed": perf["jobs_failed"]}),
        "avg_submission_latency": _measure(
            perf["avg_submission_latency_minutes"],
            f"Average over {perf['latency_samples']} completed job(s)" if perf["latency_samples"]
            else "No pipeline job completed in the last 30 days",
            {"completed_jobs": perf["latency_samples"]}),
    }, perf


# ---- scoring --------------------------------------------------------------------

def scale(value: Optional[float], good: float, bad: float) -> Optional[float]:
    """0 at `good`, 100 at `bad`, linear between and clamped — either direction."""
    if value is None:
        return None
    return min(100.0, max(0.0, (value - good) / (bad - good) * 100))


def band_for(composite: Optional[float], cfg: dict) -> Optional[str]:
    if composite is None:
        return None
    bands = cfg["bands"]
    return "High" if composite >= bands["high"] else "Medium" if composite >= bands["medium"] else "Low"


def history_of(session: Session, pid: int, now: datetime) -> tuple[Optional[datetime], float]:
    """REQ-P360-012: history runs from the first submission ever received
    (any outcome), not from registration."""
    first = session.exec(select(sa.func.min(Submission.uploaded_at)).where(Submission.participant_id == pid,
                                                                           Submission.uploaded_at <= now)).first()
    months = (now - first).total_seconds() / 86400 / DAYS_PER_MONTH if first else 0.0
    return first, months


def combine(measures: dict[str, dict], cfg: dict) -> tuple[dict, Optional[float], Optional[str]]:
    """Category scores, composite and top factor from measured indicators."""
    categories: dict[str, dict] = {}
    for cat, meta in CATEGORIES.items():
        rows = {}
        for name, spec in INDICATORS.items():
            if spec["category"] != cat:
                continue
            setting = cfg["indicators"][name]
            m = measures[name]
            enabled = bool(setting["enabled"])
            rows[name] = {
                "label": spec["label"], "value": m["value"], "unit": spec["unit"],
                "score": scale(m["value"], setting["good"], setting["bad"]) if enabled else None,
                "measured": m["measured"], "enabled": enabled,
                "weight": float(setting["weight"]) if enabled else 0.0,
                "detail": m["detail"], "inputs": m["inputs"],
            }
        usable = {n: r for n, r in rows.items() if r["enabled"] and r["weight"] > 0 and r["score"] is not None}
        total = sum(r["weight"] for r in usable.values())
        score = sum(r["weight"] * r["score"] for r in usable.values()) / total if total else None
        for n, r in rows.items():
            r["applied_weight"] = r["weight"] / total * 100 if n in usable else 0.0
        categories[cat] = {"label": meta["label"], "score": score, "weight": float(cfg["category_weights"][cat]),
                           "measured": score is not None, "indicators": rows}

    usable_cats = {c: v for c, v in categories.items() if v["weight"] > 0 and v["score"] is not None}
    total = sum(v["weight"] for v in usable_cats.values())
    composite = sum(v["weight"] * v["score"] for v in usable_cats.values()) / total if total else None
    top, top_points = None, 0.0
    for cat, v in categories.items():
        v["applied_weight"] = v["weight"] / total * 100 if cat in usable_cats else 0.0
        for name, r in v["indicators"].items():
            # Share of the composite this indicator carries, and the points it adds.
            r["applied_weight"] = r["applied_weight"] * v["applied_weight"] / 100
            r["contribution"] = r["applied_weight"] * r["score"] / 100 if r["score"] is not None else 0.0
            if r["contribution"] > top_points:
                top, top_points = name, r["contribution"]
    return categories, composite, top


def _rounded(categories: dict) -> dict:
    out = deepcopy(categories)
    for v in out.values():
        for key in ("score", "weight", "applied_weight"):
            v[key] = None if v[key] is None else round(v[key], 1)
        for r in v["indicators"].values():
            for key in ("score", "weight", "applied_weight", "contribution"):
                r[key] = None if r[key] is None else round(r[key], 2 if key == "contribution" else 1)
    return out


def score_participant(session: Session, participant: Participant, cfg: dict, now: Optional[datetime] = None) -> dict:
    """One participant's score as of `now` (default: now)."""
    w = window(session, now, cfg)
    first, months = history_of(session, participant.id, w.now)
    base = {
        "participant_id": participant.id,
        "participant_name": participant.name,
        "participant_code": participant.code,
        "participant_type": participant.type,
        "region": participant.region,
        "months_of_history": round(months, 1),
        "first_submission_at": first.isoformat() if first else None,
        "eligible_from": (first + timedelta(days=MIN_HISTORY_MONTHS * DAYS_PER_MONTH)).date().isoformat() if first else None,
        "computed_at": w.now.isoformat(),
    }
    empty = {"status": INSUFFICIENT, "message": INSUFFICIENT_MESSAGE, "composite": None, "band": None, "categories": {},
             "components": {k: None for k in COMPONENT_LABELS}, "top_factor": None, "top_factor_label": None}
    if months < MIN_HISTORY_MONTHS:
        return {**base, **empty}

    measures = {**measure_compliance(session, participant.id, w), **measure_operational(session, participant.id, w, cfg)}
    technical, _ = measure_technical(session, participant.id, w)
    measures.update(technical)
    categories, composite, top = combine(measures, cfg)
    if composite is None:  # nothing weighted could be measured
        return {**base, **empty}
    components = {}
    for name, spec in INDICATORS.items():
        if spec["component"]:
            s = categories[spec["category"]]["indicators"][name]["score"]
            components[spec["component"]] = None if s is None else round(s, 1)
    return {
        **base,
        "status": SCORED,
        "message": None,
        "composite": round(composite, 1),
        "band": band_for(round(composite, 1), cfg),
        "categories": _rounded(categories),
        "components": components,
        "top_factor": top,
        "top_factor_label": INDICATORS[top]["label"] if top else None,
    }


# ---- persistence and recalculation (§11.5 nightly, §18) --------------------------

def recompute(session: Session, *, trigger: str = "On demand", now: Optional[datetime] = None,
              participants: Optional[list[Participant]] = None) -> int:
    """Score every participant (or `participants`) as of `now`, store the run
    and mirror each composite onto Participant.risk_score. Returns the count."""
    cfg = config(session)
    digest = config_hash(cfg)
    run_id = uuid4().hex[:12]
    now = now or datetime.utcnow()
    targets = participants if participants is not None else session.exec(select(Participant).order_by(Participant.id)).all()
    latest = _latest_rows(session)
    for p in targets:
        s = score_participant(session, p, cfg, now)
        cats = s["categories"]
        session.add(ParticipantRiskScore(
            participant_id=p.id, run_id=run_id, trigger=trigger, computed_at=now, status=s["status"],
            composite=s["composite"], band=s["band"],
            compliance_score=cats.get("compliance", {}).get("score"),
            operational_score=cats.get("operational", {}).get("score"),
            technical_score=cats.get("technical", {}).get("score"),
            months_of_history=s["months_of_history"], first_submission_at=_parse(s["first_submission_at"]),
            config_hash=digest, breakdown=s,
        ))
        current = latest.get(p.id)
        if current is None or current.computed_at <= now:  # a backdated run never overwrites a newer score
            p.risk_score = s["composite"]
            session.add(p)
    session.commit()
    return len(targets)


def _parse(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _latest_rows(session: Session) -> dict[int, ParticipantRiskScore]:
    """The most recent stored score per participant (by computed_at, then id)."""
    newest = sa.select(ParticipantRiskScore.participant_id, sa.func.max(ParticipantRiskScore.computed_at).label("at")) \
        .group_by(ParticipantRiskScore.participant_id).subquery()
    rows = session.exec(
        select(ParticipantRiskScore).join(newest, sa.and_(ParticipantRiskScore.participant_id == newest.c.participant_id,
                                                          ParticipantRiskScore.computed_at == newest.c.at))
    ).all()
    out: dict[int, ParticipantRiskScore] = {}
    for r in rows:
        if r.participant_id not in out or r.id > out[r.participant_id].id:
            out[r.participant_id] = r
    return out


def _ensure_current(session: Session) -> dict[int, ParticipantRiskScore]:
    """Stored scores, scoring participants that have none yet, and everyone
    when the methodology changed since the last run (any route, e.g. a
    direct PUT /settings/risk)."""
    latest = _latest_rows(session)
    digest = config_hash(config(session))
    if any(r.config_hash != digest for r in latest.values()):
        recompute(session, trigger="Settings change")
        return _latest_rows(session)
    missing = [p for p in session.exec(select(Participant)).all() if p.id not in latest]
    if missing:
        recompute(session, trigger="Initial", participants=missing)
        latest = _latest_rows(session)
    return latest


def _row_out(r: ParticipantRiskScore, participant: Optional[Participant]) -> dict:
    out = dict(r.breakdown or {})
    if participant is not None:  # names and segments as they are now
        out.update({"participant_name": participant.name, "participant_code": participant.code,
                    "participant_type": participant.type, "region": participant.region})
    out.update({"computed_at": r.computed_at.isoformat(), "trigger": r.trigger, "run_id": r.run_id})
    return out


def _sort_key(r: dict):
    return (r["composite"] is None, -(r["composite"] or 0), r.get("participant_name") or "")


def latest_scores(session: Session) -> list[dict]:
    """Current score for every participant, riskiest first (insufficient-data
    participants last)."""
    latest = _ensure_current(session)
    participants = {p.id: p for p in session.exec(select(Participant)).all()}
    rows = [_row_out(r, participants.get(pid)) for pid, r in latest.items() if pid in participants]
    return sorted(rows, key=_sort_key)


def score_history(session: Session, participant_id: int, limit: int = 60) -> list[dict]:
    """Past runs, newest first (§18 history; trend on the profile)."""
    rows = session.exec(
        select(ParticipantRiskScore).where(ParticipantRiskScore.participant_id == participant_id)
        .order_by(ParticipantRiskScore.computed_at.desc(), ParticipantRiskScore.id.desc()).limit(limit)
    ).all()
    return [{"computed_at": r.computed_at.isoformat(), "trigger": r.trigger, "status": r.status,
             "composite": r.composite, "band": r.band, "compliance": r.compliance_score,
             "operational": r.operational_score, "technical": r.technical_score,
             "months_of_history": r.months_of_history} for r in rows]


def methodology(session: Session, cfg: Optional[dict] = None, warning: str = "") -> dict:
    """REQ-P360-009: inputs, weights, thresholds, data sources and how the
    score is built — what the profile and Settings show."""
    if cfg is None:
        cfg, warning = load_config(session)
    weights = cfg["category_weights"]
    indicators = []
    for name, spec in INDICATORS.items():
        setting = cfg["indicators"][name]
        effective = weights[spec["category"]] * (setting["weight"] if setting["enabled"] else 0) / 100
        indicators.append({
            "key": name, "label": spec["label"], "category": spec["category"],
            "category_label": CATEGORIES[spec["category"]]["label"], "unit": spec["unit"],
            "definition": spec["definition"], "data_source": spec["source"],
            "window": f"Last {TECHNICAL_WINDOW_DAYS} days" if spec["window"] == "technical" else f"Last {cfg['lookback_months']} months",
            "enabled": setting["enabled"], "weight": setting["weight"], "effective_weight": round(effective, 2),
            "good": setting["good"], "bad": setting["bad"],
            "scale": f"{setting['good']:g} {spec['unit']} → 0 risk, {setting['bad']:g} {spec['unit']} → 100 risk (linear, clamped)",
            "srs_component": COMPONENT_LABELS.get(spec["component"]) if spec["component"] else None,
        })
    effective = {i["key"]: i["effective_weight"] for i in indicators}
    default = default_config()
    return {
        "summary": ("Composite 0–100 (higher = riskier) = weighted average of the three category scores; each category "
                    "score = weighted average of its indicators, each scored 0–100 between its 0-risk and 100-risk "
                    "values. Indicators that can't be measured are left out and the remaining weights scaled up."),
        "srs_formula": ("§11.5: integration reliability 30%, compliance adherence rate 30%, incident frequency 20%, "
                        "overdue submission rate 20%."),
        "reproduces_srs_formula": all(abs(effective[k] - v) < 0.01 for k, v in
                                      (("integration_uptime", 30), ("submission_adherence_rate", 30),
                                       ("incident_frequency", 20), ("overdue_deadlines", 20))),
        "is_default": cfg == default,
        "categories": [{"key": c, **meta, "weight": weights[c]} for c, meta in CATEGORIES.items()],
        "indicators": indicators,
        "severity_points": cfg["severity_points"],
        "bands": {"Low": f"below {cfg['bands']['medium']:g}",
                  "Medium": f"{cfg['bands']['medium']:g} to below {cfg['bands']['high']:g}",
                  "High": f"{cfg['bands']['high']:g} and above", **cfg["bands"]},
        "lookback_months": cfg["lookback_months"],
        "technical_window_days": TECHNICAL_WINDOW_DAYS,
        "minimum_history": (f"A score is shown only once the participant has {MIN_HISTORY_MONTHS} months of submission "
                            f"history, counted from its first submission; until then: “{INSUFFICIENT_MESSAGE}” "
                            "(REQ-P360-012)."),
        "recalculation": (f"Recalculated nightly from {NIGHTLY_HOUR:02d}:00 (organisation timezone) and whenever the "
                          "methodology changes; every run is kept as history (§11.5, §18)."),
        "data_sources": sorted({spec["source"] for spec in INDICATORS.values()}),
        "scope": "Institution-level indicators only — no customer-level data (REQ-P360-013).",
        "advisory": "Advisory: the score informs RSwitch staff and never changes a participant's status by itself.",
        "config": cfg,
        "defaults": default,  # the §11.5 methodology, for "reset to defaults"
        "config_hash": config_hash(cfg),
        "warning": warning,
    }


def participant_risk(session: Session, participant_id: int) -> Optional[dict]:
    """One participant's score plus "methodology" (inputs, weights, data
    sources — REQ-P360-009) and "history". None if the participant doesn't
    exist."""
    participant = session.get(Participant, participant_id)
    if participant is None:
        return None
    latest = _ensure_current(session).get(participant_id)
    row = _row_out(latest, participant) if latest else score_participant(session, participant, config(session))
    history = score_history(session, participant_id)
    previous = next((h for h in history[1:] if h["composite"] is not None), None)
    row["previous_composite"] = previous["composite"] if previous else None
    row["change"] = (round(row["composite"] - previous["composite"], 1)
                     if previous and row["composite"] is not None else None)
    row["history"] = history
    row["methodology"] = methodology(session)
    return row


def distribution(session: Session) -> dict:
    """§15.2 Participant Risk Overview: {"Low": n, "Medium": n, "High": n,
    "Insufficient data": n}."""
    counts = {"Low": 0, "Medium": 0, "High": 0, "Insufficient data": 0}
    for r in latest_scores(session):
        counts[r["band"] or "Insufficient data"] += 1
    return counts


def save_config(session: Session, value: dict) -> tuple[dict, list[dict]]:
    """Validate and store a methodology (merged over the one in force);
    returns (saved, problems). Callers recalculate after a successful save."""
    from app.services.settings_store import put_setting

    current = config(session)
    problems = validate_config(value, current)
    if problems:
        return current, problems
    cfg = _merge(current, value)
    put_setting(session, SETTING_KEY, cfg)
    return cfg, []


# ---- nightly job and status history -----------------------------------------------

def run_nightly_if_due(session: Session, now: Optional[datetime] = None) -> Optional[int]:
    """§11.5: once per night from 02:00 organisation time. Checked hourly, so
    a night missed while the server was down is caught up. Returns the number
    scored, or None when tonight's run already happened."""
    from app.services.governance_jobs import org_zone

    now = now or datetime.utcnow()
    zone = org_zone(session)
    local = now.replace(tzinfo=timezone.utc).astimezone(zone)
    night = local.date() if local.hour >= NIGHTLY_HOUR else local.date() - timedelta(days=1)
    since = datetime.combine(night, time(NIGHTLY_HOUR), tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
    done = session.exec(select(ParticipantRiskScore.id).where(ParticipantRiskScore.trigger == "Nightly",
                                                              ParticipantRiskScore.computed_at >= since,
                                                              ParticipantRiskScore.computed_at < since + timedelta(days=1))).first()
    if done is not None:
        return None
    return recompute(session, trigger="Nightly", now=now)


def record_status_change(session: Session, integration: Integration, *, previous, since: Optional[datetime]) -> None:
    """Hook for pipeline_runner.set_integration_status (uptime history). The
    first change recorded for a source also records the status it is
    leaving, known since its last change. Adds rows; the caller commits."""
    if integration.id is None:
        return
    first = session.exec(select(IntegrationStatusChange.id).where(IntegrationStatusChange.integration_id == integration.id)).first()
    now = datetime.utcnow()
    if first is None and previous is not None:
        session.add(IntegrationStatusChange(
            integration_id=integration.id, participant_id=integration.participant_id, status=IntegrationStatus(previous).value,
            at=min(since or integration.created_at, now), source="Known before history recording",
            note="Status held before status history recording began"))
    source = getattr(integration.source, "value", integration.source) or ""
    session.add(IntegrationStatusChange(
        integration_id=integration.id, participant_id=integration.participant_id,
        status=IntegrationStatus(integration.status).value, at=now, source=str(source), note=(integration.note or "")[:300]))
