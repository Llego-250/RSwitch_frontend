"""Role-aware dashboard (SRS §5.2 REQ-DASH-001..010, §15).

Each role gets exactly its §15 widgets (ROLE_WIDGETS) plus the sections
§5.2 asks of every dashboard that its §15 list doesn't already include: the
Attention Queue (DASH-003), integration health counts (DASH-004), upcoming
deadlines (DASH-005) and recent activity (DASH-008).

Filters (DASH-009) select a set of participants — institution, participant
type, region, participant status, risk category — and an optional date
range; every widget that is about participants is computed for that set.
Each widget also has its own period and scope (DASH-010): the period is the
time window it covers, the scope is "filtered" (the dashboard filters) or
"all", or "mine" vs "all" for widgets about things people own. A dashboard
date range, when set, replaces every widget's own period.

Everything is read from the owning modules' services: compliance (§15.1),
risk, inclusion, reporting, pipelines/integrations/mapping, AI alerts and
the audit log."""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models.admin import AuditEvent
from app.models.alert import AnomalyAlert
from app.models.enums import (
    REGIONS,
    UNRESOLVED_INCIDENT_STATUSES,
    InstitutionType,
    IntegrationStatus,
    IssueSeverity,
    ParticipantStatus,
    UserRole,
)
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.pipeline import PipelineJob, PipelineJobStatus
from app.models.user import User

# ---- layout ---------------------------------------------------------------------

ROLE_WIDGETS: dict[UserRole, list[str]] = {
    # §15.1
    UserRole.compliance: ["overdue_submissions", "upcoming_deadlines", "open_incidents", "compliance_rate",
                          "overdue_action_items", "recent_activity"],
    # §15.2
    UserRole.business: ["integration_health", "ai_alerts", "inclusion_snapshot", "risk_overview", "recent_reports",
                        "compliance_overview"],
    # §15.3
    UserRole.technical: ["active_pipelines", "failed_integrations", "data_freshness", "system_health",
                         "pending_mappings", "recent_pipeline_runs"],
}
# DASH-003/004/005/008 — shown to every role.
COMMON_SECTIONS = ["attention_queue", "integration_health", "upcoming_deadlines", "recent_activity"]

RISK_CATEGORIES = ("Low", "Medium", "High", "Insufficient data")
SEVERITY_RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}

ALL = ("all", "All participants")
FILTERED = ("filtered", "Dashboard filters")
MINE = ("mine", "Mine")
EVERYONE = ("all", "Everyone")


@dataclass(frozen=True)
class Choice:
    default: object
    choices: tuple  # ((value, label), ...)


def _days(*values: int, default: int, all_label: str = "All time") -> Choice:
    labels = {1: "Today", 7: "7 days", 14: "14 days", 30: "30 days", 60: "60 days", 90: "90 days", 365: "12 months"}
    return Choice(default, tuple((v, all_label if v == 0 else labels.get(v, f"{v} days")) for v in values))


@dataclass(frozen=True)
class Widget:
    title: str
    description: str  # the §15 / §5.2 wording
    link: str = ""
    period: Optional[Choice] = None
    scope: Optional[Choice] = None
    note: str = ""


PARTICIPANT_SCOPE = Choice("filtered", (FILTERED, ALL))
OWNER_SCOPE = Choice("all", (EVERYONE, MINE))

WIDGETS: dict[str, Widget] = {
    "overdue_submissions": Widget("Overdue Submissions", "Count of compliance submissions past due date",
                                  "/compliance?tab=calendar", _days(30, 90, 365, 0, default=0, all_label="Any due date"),
                                  PARTICIPANT_SCOPE),
    "upcoming_deadlines": Widget("Upcoming Deadlines", "Deadlines in the next 30 days (REQ-DASH-005)",
                                 "/compliance?tab=calendar", _days(7, 14, 30, 60, 90, default=30), PARTICIPANT_SCOPE),
    "open_incidents": Widget("Open Incidents", "Count by severity (Critical / High / Medium / Low)",
                             "/compliance?tab=incidents", _days(30, 90, 365, 0, default=0, all_label="Any raise date"),
                             Choice("all", (("all", "All incidents"), ("mine", "Owned by me")))),
    "compliance_rate": Widget("Compliance Rate", "% of submissions approved on time across all participants",
                              "/compliance?tab=rates", _days(7, 30, 90, 365, default=30), PARTICIPANT_SCOPE),
    "overdue_action_items": Widget("Overdue Action Items", "Count of governance and incident action items past due",
                                   "/governance", _days(30, 90, 365, 0, default=0, all_label="Any due date"),
                                   Choice("all", (("all", "All owners"), ("mine", "Owned by me"))),
                                   "Institution filters count governance items owned by those institutions."),
    "recent_activity": Widget("Recent Activity", "Last 10 system events relevant to your role (REQ-DASH-008)",
                              "", _days(1, 7, 30, 90, default=30), None),
    "integration_health": Widget("Integration Health Summary", "Count of Healthy / Warning / Failed integrations",
                                 "/integrations", None, PARTICIPANT_SCOPE),
    "ai_alerts": Widget("AI Alerts (Unacknowledged)", "Count of pending AI alerts", "/ai",
                        _days(7, 30, 90, 0, default=0, all_label="Any date"), PARTICIPANT_SCOPE),
    "inclusion_snapshot": Widget("Financial Inclusion Snapshot", "Key inclusion metrics for current period", "/inclusion",
                                 Choice(1, ((1, "Latest month"), (3, "Last 3 months"), (6, "Last 6 months"), (12, "Last 12 months"))),
                                 PARTICIPANT_SCOPE,
                                 "Aggregated by institution type and region (§2.7): institution, status and risk filters don't apply."),
    "risk_overview": Widget("Participant Risk Overview", "Distribution of participant risk scores", "/participant-360",
                            None, PARTICIPANT_SCOPE),
    "recent_reports": Widget("Recent Reports", "Last 5 generated reports with download links", "/reports",
                             _days(7, 30, 90, 0, default=0, all_label="Any date"),
                             Choice("all", (("all", "All I can view"), ("mine", "Generated by me")))),
    "compliance_overview": Widget("Compliance Overview", "Aggregate compliance rate across all participants",
                                  "/compliance", _days(30, 90, 365, default=30), PARTICIPANT_SCOPE),
    "active_pipelines": Widget("Active Pipelines", "Count running + count failed today", "/pipelines",
                               _days(1, 7, 30, default=1), PARTICIPANT_SCOPE),
    "failed_integrations": Widget("Failed Integrations", "List of integrations currently in Failed state",
                                  "/integrations", None, PARTICIPANT_SCOPE),
    "data_freshness": Widget("Data Freshness", "Last sync time per data source", "/integrations", None, PARTICIPANT_SCOPE),
    "system_health": Widget("System Health", "Uptime, error rate, queue depth", "/pipelines",
                            Choice(60, ((15, "15 minutes"), (60, "1 hour"), (1440, "24 hours"))), None,
                            "Uptime and error rate are for this API instance since it started; queue depth is system-wide."),
    "pending_mappings": Widget("Pending Mappings", "Count of mappings in Draft status", "/mapping", None,
                               Choice("all", (("all", "All mappings"), ("mine", "Created by me")))),
    "recent_pipeline_runs": Widget("Recent Pipeline Runs", "Last 10 pipeline jobs with status", "/pipelines",
                                   _days(1, 7, 30, 0, default=0, all_label="Any date"), PARTICIPANT_SCOPE),
    "attention_queue": Widget("Attention Queue", "Top unresolved items across compliance, integrations, incidents and AI "
                              "alerts, most severe and oldest first (REQ-DASH-003)", "", None, PARTICIPANT_SCOPE),
}

# DASH-008: which audit actions matter to each role (prefix match). Sign-in
# noise (LOGIN, MFA, ...) is relevant to nobody's dashboard.
ACTIVITY_RELEVANCE: dict[UserRole, tuple[str, ...]] = {
    UserRole.compliance: ("COMPLIANCE_", "SUBMISSION_", "DOCUMENT_", "INCIDENT_", "REMEDIATION_", "GOV_", "ALERT_",
                          "REPORT_", "PARTICIPANT_NOTE"),
    UserRole.business: ("ALERT_", "ANOMALY_", "REPORT_", "INCLUSION_", "GOV_MEETING_", "GOV_ACTION_ITEM_", "GOV_DOCUMENT_UPLOAD",
                        "PARTICIPANT_CREATE", "PARTICIPANT_UPDATE", "SETTINGS_UPDATE"),
    UserRole.technical: ("INTEGRATION_", "PIPELINE_", "MAPPING_", "TEMPLATE_", "SUBMISSION_UPLOAD", "PARTICIPANT_CREATE",
                         "PARTICIPANT_UPDATE", "USER_", "API_KEY_", "SETTINGS_UPDATE", "ACCOUNT_LOCKED", "AUDIT_EXPORT",
                         "REPORT_SCHEDULED_RUN"),
}


# ---- filters and options (DASH-009/010) ----------------------------------------------

class DashboardError(ValueError):
    def __init__(self, field_name: str, message: str):
        super().__init__(message)
        self.field = field_name
        self.message = message


def clean_filters(session: Session, raw: dict) -> dict:
    out: dict = {}
    for name, value in raw.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        if name == "participant_id":
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise DashboardError(name, "Institution must be an id.")
            if session.get(Participant, value) is None:
                raise DashboardError(name, "Unknown institution.")
        elif name in ("date_from", "date_to"):
            try:
                value = date.fromisoformat(str(value)[:10])
            except ValueError:
                raise DashboardError(name, "Use a date like 2026-10-31.")
        else:
            allowed = {"institution_type": [t.value for t in InstitutionType], "region": REGIONS,
                       "status": [s.value for s in ParticipantStatus], "risk": list(RISK_CATEGORIES)}.get(name)
            if allowed is None:
                raise DashboardError(name, "Not a dashboard filter.")
            if value not in allowed:
                raise DashboardError(name, f"Must be one of: {', '.join(allowed)}.")
        out[name] = value
    if out.get("date_from") and out.get("date_to") and out["date_from"] > out["date_to"]:
        raise DashboardError("date_from", "The start date must not be after the end date.")
    return out


def clean_options(raw: dict) -> dict[str, dict]:
    """Per-widget {period, scope}, each checked against the widget's choices."""
    out: dict[str, dict] = {}
    for key, opts in (raw or {}).items():
        widget = WIDGETS.get(key)
        if widget is None or not isinstance(opts, dict):
            raise DashboardError(f"widgets.{key}", "Unknown widget.")
        clean = {}
        for name in ("period", "scope"):
            if opts.get(name) in (None, ""):
                continue
            choice: Optional[Choice] = getattr(widget, name)
            value = opts[name]
            if choice is None:
                raise DashboardError(f"widgets.{key}.{name}", f"{widget.title} has no {name} setting.")
            if isinstance(choice.default, int):
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    pass
            if value not in [v for v, _ in choice.choices]:
                raise DashboardError(f"widgets.{key}.{name}", f"Not a {name} of {widget.title}.")
            clean[name] = value
        out[key] = clean
    return out


# ---- context --------------------------------------------------------------------------

@dataclass
class Ctx:
    session: Session
    user: User
    filters: dict
    options: dict
    today: date = None  # type: ignore[assignment]
    zone: object = None
    _scores: Optional[list] = None
    _participants: dict = field(default_factory=dict)
    _scope: object = "unset"

    def __post_init__(self):
        from app.services.governance_jobs import org_today, org_zone

        self.today = org_today(self.session)
        self.zone = org_zone(self.session)
        self._participants = {p.id: p for p in self.session.exec(select(Participant)).all()}

    @property
    def scores(self) -> list[dict]:
        if self._scores is None:
            from app.services import risk

            self._scores = risk.latest_scores(self.session)
        return self._scores

    def name(self, pid: Optional[int]) -> str:
        p = self._participants.get(pid) if pid else None
        return p.name if p else (f"Participant #{pid}" if pid else "")

    def opt(self, key: str, name: str):
        widget = WIDGETS[key]
        choice = getattr(widget, name)
        return self.options.get(key, {}).get(name, choice.default if choice else None)

    def filtered_scope(self) -> Optional[set[int]]:
        """Participant ids the dashboard filters select; None = no filter."""
        if self._scope != "unset":
            return self._scope  # type: ignore[return-value]
        f = self.filters
        if not any(f.get(k) for k in ("participant_id", "institution_type", "region", "status", "risk")):
            self._scope = None
            return None
        ids = {p.id for p in self._participants.values()
               if (not f.get("participant_id") or p.id == f["participant_id"])
               and (not f.get("institution_type") or p.type == f["institution_type"])
               and (not f.get("region") or p.region == f["region"])
               and (not f.get("status") or p.status == f["status"])}
        if f.get("risk"):
            bands = {r["participant_id"]: r.get("band") or "Insufficient data" for r in self.scores}
            ids = {i for i in ids if bands.get(i, "Insufficient data") == f["risk"]}
        self._scope = ids
        return ids

    def scope(self, key: str) -> Optional[set[int]]:
        """The participant set for a widget with a participant scope."""
        return self.filtered_scope() if self.opt(key, "scope") == "filtered" else None

    def window(self, key: str) -> tuple[Optional[date], Optional[date], str]:
        """(start, end, label) of a widget's period: the dashboard date range
        when one is set, else the last N days (None = unbounded)."""
        f = self.filters
        if f.get("date_from") or f.get("date_to"):
            label = f"{f.get('date_from') or 'earliest'} to {f.get('date_to') or 'latest'}"
            return f.get("date_from"), f.get("date_to"), label
        days = self.opt(key, "period")
        if not days:
            return None, None, dict(WIDGETS[key].period.choices).get(0, "All time")
        return self.today - timedelta(days=days - 1), self.today, dict(WIDGETS[key].period.choices)[days]

    def utc(self, day: date, end: bool = False) -> datetime:
        """Start (or end) of an organisation-local day, as naive UTC."""
        local = datetime.combine(day + timedelta(days=1) if end else day, time.min, tzinfo=self.zone)
        return local.astimezone(timezone.utc).replace(tzinfo=None)

    def in_window(self, value: Optional[datetime], start: Optional[date], end: Optional[date]) -> bool:
        if value is None:
            return start is None and end is None
        return (start is None or value >= self.utc(start)) and (end is None or value < self.utc(end, end=True))


def _within(pid: Optional[int], scope: Optional[set[int]]) -> bool:
    return scope is None or pid in scope


# ---- §15.1 compliance widgets ------------------------------------------------------------

def overdue_submissions(ctx: Ctx) -> dict:
    from app.services import compliance

    scope, (start, end, label) = ctx.scope("overdue_submissions"), ctx.window("overdue_submissions")
    rows = [r for r in compliance.overdue_rows(ctx.session) if _within(r["participant_id"], scope)
            and (start is None or r["due_date"] >= start) and (end is None or r["due_date"] <= end)]
    return {"count": len(rows), "period_label": label, "items": [
        {"participant_id": r["participant_id"], "participant_name": r["participant_name"], "requirement_name": r["requirement_name"],
         "period": r["period"], "due_date": r["due_date"], "days_overdue": -r["days_until_due"]} for r in rows[:5]]}


def upcoming_deadlines(ctx: Ctx) -> dict:
    """DASH-005 / §15.1: deadlines still to be met (not approved, not yet
    overdue), soonest first."""
    from app.services import compliance

    f = ctx.filters
    if f.get("date_from") or f.get("date_to"):
        start, end = f.get("date_from") or ctx.today, f.get("date_to") or ctx.today + timedelta(days=90)
        label = f"{start} to {end}"
    else:
        days = ctx.opt("upcoming_deadlines", "period")
        start, end, label = ctx.today, ctx.today + timedelta(days=days), f"Next {days} days"
    scope = ctx.scope("upcoming_deadlines")
    rows = [d for d in compliance.deadlines(ctx.session, start, end)
            if d["status"] not in (compliance.APPROVED, compliance.OVERDUE) and _within(d["participant_id"], scope)]
    return {"count": len(rows), "period_label": label, "items": [
        {"key": d["key"], "participant_id": d["participant_id"], "participant_name": d["participant_name"],
         "requirement_name": d["requirement_name"], "period": d["period"], "due_date": d["due_date"],
         "days_until_due": d["days_until_due"], "status": d["status"], "projected": d["projected"]} for d in rows[:25]]}


def open_incidents(ctx: Ctx) -> dict:
    start, end, label = ctx.window("open_incidents")
    mine = ctx.opt("open_incidents", "scope") == "mine"
    scope = ctx.filtered_scope()
    rows = [i for i in ctx.session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all()
            if _within(i.participant_id, scope) and ctx.in_window(i.created_at, start, end)
            and (not mine or i.owner_id == ctx.user.id)]
    counts = {s.value: sum(1 for i in rows if i.severity == s) for s in IssueSeverity}
    return {**counts, "total": len(rows), "period_label": label}


def _adherence(ctx: Ctx, scope: Optional[set[int]], start: date, end: date) -> dict:
    """§15.1 compliance rate: of the cycles of active requirements due in
    [start, end) the share approved with a file received on time — as
    compliance.dashboard_summary computes it, for a participant set."""
    from app.models.compliance import ComplianceCycle, ComplianceRequirement
    from app.services.compliance import APPROVED

    cycles = ctx.session.exec(select(ComplianceCycle, ComplianceRequirement).where(
        ComplianceCycle.requirement_id == ComplianceRequirement.id, ComplianceRequirement.active == True,  # noqa: E712
        ComplianceCycle.due_date >= start, ComplianceCycle.due_date < end)).all()
    mine = [c for c, r in cycles if _within(r.participant_id, scope)]
    on_time = sum(1 for c in mine if c.stage == APPROVED and c.on_time)
    return {"rate_pct": round(on_time / len(mine) * 100, 1) if mine else None, "on_time": on_time, "total": len(mine),
            "window_start": start, "window_end": end}


def compliance_rate(ctx: Ctx, key: str = "compliance_rate") -> dict:
    f = ctx.filters
    if f.get("date_from") or f.get("date_to"):
        start = f.get("date_from") or ctx.today - timedelta(days=365)
        end = min((f.get("date_to") or ctx.today) + timedelta(days=1), ctx.today)
        label = f"Due {start} to {end - timedelta(days=1)}"
    else:
        days = ctx.opt(key, "period")
        start, end, label = ctx.today - timedelta(days=days), ctx.today, f"Last {days} days"
    return {**_adherence(ctx, ctx.scope(key), start, end), "period_label": label}


def overdue_action_items(ctx: Ctx) -> dict:
    from app.models.governance import ActionItem
    from app.services.compliance import overdue_remediation
    from app.services.governance_jobs import effective_status

    start, end, label = ctx.window("overdue_action_items")
    mine = ctx.opt("overdue_action_items", "scope") == "mine"
    scope = ctx.filtered_scope()

    def due_ok(d: date) -> bool:
        return (start is None or d >= start) and (end is None or d <= end)

    gov = [i for i in ctx.session.exec(select(ActionItem).where(ActionItem.status != "Completed")).all()
           if effective_status(i, ctx.today) == "Overdue" and due_ok(i.due_date)
           and (not mine or i.owner_user_id == ctx.user.id)
           and (scope is None or i.owner_participant_id in scope)]
    actions = overdue_remediation(ctx.session, ctx.today)
    incidents = {i.id: i for i in ctx.session.exec(select(Issue).where(Issue.id.in_([a.incident_id for a in actions] or [0]))).all()}
    rem = [a for a in actions if due_ok(a.due_date) and (not mine or a.owner_id == ctx.user.id)
           and incidents.get(a.incident_id) and _within(incidents[a.incident_id].participant_id, scope)]
    items = [{"kind": "Governance", "description": i.description, "owner": i.owner, "due_date": i.due_date,
              "days_overdue": (ctx.today - i.due_date).days, "link": "/governance"} for i in gov]
    from app.services.incidents import incident_ref

    for a in rem:
        owner = ctx.session.get(User, a.owner_id)
        items.append({"kind": f"Incident {incident_ref(incidents[a.incident_id])}", "description": a.description,
                      "owner": (owner.full_name or owner.email) if owner else "", "due_date": a.due_date,
                      "days_overdue": (ctx.today - a.due_date).days, "link": "/compliance?tab=incidents"})
    items.sort(key=lambda x: -x["days_overdue"])
    return {"governance": len(gov), "incident_remediation": len(rem), "total": len(gov) + len(rem),
            "period_label": label, "items": items[:5]}


def compliance_events(ctx: Ctx) -> dict:
    """§15.1 Recent Activity for Compliance: the last 10 compliance events
    (submissions and their review, correction requests, missed deadlines,
    incidents and remediation) — what compliance.history() reports."""
    from app.services import compliance

    start, end, label = ctx.window("recent_activity")
    since = ctx.utc(start) if start else None
    events = compliance._events(ctx.session, register_only=True, since=since)  # same feed as dashboard_summary
    scope = ctx.filtered_scope()
    events = [e for e in events if _within(e["participant_id"], scope) and (end is None or e["at"] < ctx.utc(end, end=True))]
    out = []
    for e in reversed(events[-10:]):
        link = "/compliance?tab=incidents" if e.get("incident_id") else "/compliance?tab=register"
        out.append({"at": e["at"], "title": e["title"], "detail": e["detail"], "status": e["status"], "kind": e["type"],
                    "participant_name": e["participant_name"], "actor": "", "link": link})
    return {"source": "compliance", "period_label": label, "items": out}


# ---- §15.2 business widgets -----------------------------------------------------------------

def integration_health(ctx: Ctx) -> dict:
    """DASH-004 / §15.2: data sources by §9.1 status."""
    scope = ctx.scope("integration_health")
    rows = [i for i in ctx.session.exec(select(Integration)).all() if _within(i.participant_id, scope)]
    counts = {s: 0 for s in dict.fromkeys(s.value for s in IntegrationStatus)}
    for i in rows:
        counts[i.status.value] = counts.get(i.status.value, 0) + 1
    return {"healthy": counts["Healthy"], "warning": counts["Warning"], "failed": counts["Failed"],
            "by_status": counts, "total": len(rows)}


def ai_alerts(ctx: Ctx) -> dict:
    from app.services import anomaly

    start, end, label = ctx.window("ai_alerts")
    scope = ctx.scope("ai_alerts")
    rows = [a for a in ctx.session.exec(select(AnomalyAlert).where(AnomalyAlert.status.in_((anomaly.GENERATED, anomaly.ESCALATED)))).all()
            if _within(a.participant_id, scope) and ctx.in_window(a.created_at, start, end)]
    pending = [a for a in rows if a.status == anomaly.GENERATED]
    by_severity = {s: sum(1 for a in pending if a.severity.upper() == s) for s in ("CRITICAL", "HIGH", "MEDIUM", "LOW")}
    pending.sort(key=lambda a: (SEVERITY_RANK.get(a.severity.title(), 9), a.created_at))
    return {"unacknowledged": len(pending), "escalated": sum(1 for a in rows if a.status == anomaly.ESCALATED),
            "by_severity": by_severity, "period_label": label, "items": [
                {"id": a.id, "ref": f"ALT-{a.id}", "participant_name": ctx.name(a.participant_id), "indicator": a.indicator,
                 "severity": a.severity, "created_at": a.created_at, "link": f"/ai?alert={a.id}"} for a in pending[:5]]}


def inclusion_snapshot(ctx: Ctx) -> dict:
    """§15.2: the inclusion metrics for the latest reported month(s); the
    type and region filters apply (the metrics are aggregates)."""
    from app.services import inclusion

    use_filters = ctx.opt("inclusion_snapshot", "scope") == "filtered"
    f = ctx.filters if use_filters else {}
    months = ctx.opt("inclusion_snapshot", "period")
    if f.get("date_from") or f.get("date_to"):
        period_from = f["date_from"].strftime("%Y-%m") if f.get("date_from") else None
        period_to = f["date_to"].strftime("%Y-%m") if f.get("date_to") else None
    else:
        periods = inclusion.dashboard(ctx.session, f.get("institution_type"), f.get("region"))["options"]["periods"]
        period_to = periods[-1] if periods else None
        period_from = periods[-months] if len(periods) >= months else (periods[0] if periods else None)
    dash = inclusion.public(inclusion.dashboard(ctx.session, f.get("institution_type"), f.get("region"), period_from, period_to))
    label = (inclusion.period_label(period_from) if period_from == period_to and period_from
             else f"{inclusion.period_label(period_from)} – {inclusion.period_label(period_to)}" if period_from and period_to
             else "All periods")
    return {"period_label": label, "period_from": period_from, "period_to": period_to,
            "indicative_label": dash["indicative_label"], "coverage": dash["coverage"],
            "filters": {"institution_type": f.get("institution_type"), "region": f.get("region")},
            "metrics": [{k: m[k] for k in ("key", "label", "unit", "value", "available", "status", "data_source", "last_updated")}
                        for m in dash["metrics"]]}


def risk_overview(ctx: Ctx) -> dict:
    from app.services import risk

    scope = ctx.scope("risk_overview")
    if scope is None:
        counts = risk.distribution(ctx.session)
    else:
        counts = {c: 0 for c in RISK_CATEGORIES}
        for r in ctx.scores:
            if r["participant_id"] in scope:
                counts[r.get("band") or "Insufficient data"] += 1
    top = [r for r in ctx.scores if r.get("composite") is not None and _within(r["participant_id"], scope)][:3]
    return {"distribution": counts, "total": sum(counts.values()), "riskiest": [
        {"participant_id": r["participant_id"], "participant_name": r["participant_name"], "score": r["composite"],
         "band": r["band"], "top_factor": r.get("top_factor"), "link": f"/participant?id={r['participant_id']}"} for r in top]}


def recent_reports(ctx: Ctx) -> dict:
    from app.services import reporting

    start, end, label = ctx.window("recent_reports")
    runs = reporting.visible_runs(ctx.session, ctx.user, mine=ctx.opt("recent_reports", "scope") == "mine",
                                  since=ctx.utc(start) if start else None, until=ctx.utc(end, end=True) if end else None,
                                  limit=5)
    return {"period_label": label, "items": [reporting.run_out(ctx.session, r, ctx.user) for r in runs]}


def compliance_overview(ctx: Ctx) -> dict:
    """§15.2: the aggregate compliance rate, with where each participant's
    current obligations stand."""
    from app.services import compliance

    rate = compliance_rate(ctx, "compliance_overview")
    scope = ctx.scope("compliance_overview")
    statuses: dict[str, int] = {}
    for r in compliance.summary_rows(ctx.session):
        if _within(r["participant_id"], scope):
            statuses[r["status"]] = statuses.get(r["status"], 0) + 1
    return {**rate, "current_status": statuses}


# ---- §15.3 technical widgets ------------------------------------------------------------------

def active_pipelines(ctx: Ctx) -> dict:
    scope = ctx.scope("active_pipelines")
    start, end, label = ctx.window("active_pipelines")
    jobs = ctx.session.exec(select(PipelineJob).where(
        (PipelineJob.status.in_((PipelineJobStatus.running.value, PipelineJobStatus.queued.value)))
        | (PipelineJob.finished_at >= ctx.utc(start or ctx.today)))).all()
    jobs = [j for j in jobs if _within(j.participant_id, scope)]
    finished = [j for j in jobs if j.finished_at and ctx.in_window(j.finished_at, start or ctx.today, end)]
    return {"running": sum(1 for j in jobs if j.status == PipelineJobStatus.running.value),
            "queued": sum(1 for j in jobs if j.status == PipelineJobStatus.queued.value),
            "failed": sum(1 for j in finished if j.status == PipelineJobStatus.failed.value),
            "completed": sum(1 for j in finished if j.status == PipelineJobStatus.completed.value),
            "period_label": label}


def failed_integrations(ctx: Ctx) -> dict:
    scope = ctx.scope("failed_integrations")
    rows = [i for i in ctx.session.exec(select(Integration).where(Integration.status == IntegrationStatus.failed)).all()
            if _within(i.participant_id, scope)]
    rows.sort(key=lambda i: i.updated_at)
    return {"count": len(rows), "items": [
        {"integration_id": i.id, "participant_id": i.participant_id, "participant_name": ctx.name(i.participant_id),
         "source_name": i.source_name, "mode": i.integration_mode, "note": i.note, "since": i.updated_at,
         "last_success_at": i.last_submission_at, "link": "/integrations"} for i in rows]}


def data_freshness(ctx: Ctx) -> dict:
    """§15.3 last sync per data source, stalest first; stale = no sync
    within the participant's expected frequency (§10.1)."""
    scope = ctx.scope("data_freshness")
    now = datetime.utcnow()
    rows = []
    for i in ctx.session.exec(select(Integration)).all():
        if not _within(i.participant_id, scope):
            continue
        p = ctx._participants.get(i.participant_id)
        expected = p.expected_frequency_days if p else 30
        hours = round((now - i.last_sync_at).total_seconds() / 3600, 1) if i.last_sync_at else None
        rows.append({"integration_id": i.id, "participant_name": ctx.name(i.participant_id), "source_name": i.source_name,
                     "status": i.status.value, "last_sync_at": i.last_sync_at, "last_success_at": i.last_submission_at,
                     "hours_since_sync": hours, "expected_days": expected,
                     "stale": hours is None or hours > expected * 24})
    rows.sort(key=lambda r: (r["last_sync_at"] is not None, r["last_sync_at"] or datetime.min))
    return {"count": len(rows), "stale": sum(1 for r in rows if r["stale"]), "items": rows}


def system_health(ctx: Ctx) -> dict:
    from app.core import metrics
    from app.models.admin import ReportRun

    minutes = ctx.opt("system_health", "period")
    queued = ctx.session.exec(select(PipelineJob.id).where(PipelineJob.status == PipelineJobStatus.queued.value)).all()
    running = ctx.session.exec(select(PipelineJob.id).where(PipelineJob.status == PipelineJobStatus.running.value)).all()
    reports = ctx.session.exec(select(ReportRun.id).where(ReportRun.status.in_(("Queued", "Running")))).all()
    return {"started_at": metrics.STARTED_AT, "uptime_seconds": metrics.uptime_seconds(),
            **metrics.metrics.snapshot(minutes * 60),
            "queue_depth": len(queued), "running_jobs": len(running), "report_queue": len(reports),
            "period_label": dict(WIDGETS["system_health"].period.choices)[minutes]}


def pending_mappings(ctx: Ctx) -> dict:
    from app.models.template import FieldMapping
    from app.services.mapping import status_of

    mine = ctx.opt("pending_mappings", "scope") == "mine"
    me = {ctx.user.full_name, ctx.user.email} - {""}
    drafts = [m for m in ctx.session.exec(select(FieldMapping).order_by(FieldMapping.created_at)).all()
              if status_of(ctx.session, m) == "Draft" and (not mine or m.created_by in me)]
    return {"count": len(drafts), "items": [
        {"id": m.id, "code": m.code, "name": m.name, "source_system": m.source_system, "created_by": m.created_by,
         "created_at": m.created_at, "link": "/mapping"} for m in drafts[:5]]}


def recent_pipeline_runs(ctx: Ctx) -> dict:
    from app.routers.pipelines import job_out

    scope = ctx.scope("recent_pipeline_runs")
    start, end, label = ctx.window("recent_pipeline_runs")
    query = select(PipelineJob).order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
    if start:
        query = query.where(PipelineJob.queued_at >= ctx.utc(start))
    if end:
        query = query.where(PipelineJob.queued_at < ctx.utc(end, end=True))
    if scope is not None:
        query = query.where(PipelineJob.participant_id.in_(scope or [0]))
    return {"period_label": label, "items": [job_out(ctx.session, j) for j in ctx.session.exec(query.limit(10)).all()]}


# ---- every role -------------------------------------------------------------------------------

def _humanize(action: str) -> str:
    return action.replace("GOV_", "Governance ").replace("_", " ").capitalize()


def audit_activity(ctx: Ctx) -> dict:
    """DASH-008 for Business and Technical/Admin: the last 10 audit events
    whose action is relevant to the role (ACTIVITY_RELEVANCE)."""
    from sqlalchemy import or_

    start, end, label = ctx.window("recent_activity")
    prefixes = ACTIVITY_RELEVANCE.get(ctx.user.role, ())
    query = select(AuditEvent).where(or_(*[AuditEvent.action.startswith(p, autoescape=True) for p in prefixes]))
    if start:
        query = query.where(AuditEvent.timestamp >= ctx.utc(start))
    if end:
        query = query.where(AuditEvent.timestamp < ctx.utc(end, end=True))
    events = ctx.session.exec(query.order_by(AuditEvent.timestamp.desc(), AuditEvent.id.desc()).limit(10)).all()
    return {"source": "audit", "period_label": label, "items": [
        {"at": e.timestamp, "title": _humanize(e.action), "detail": e.resource, "status": e.status, "kind": e.action,
         "participant_name": "", "actor": e.actor_name or e.actor_email, "link": ""} for e in events]}


def recent_activity(ctx: Ctx) -> dict:
    return compliance_events(ctx) if ctx.user.role == UserRole.compliance else audit_activity(ctx)


def attention_queue(ctx: Ctx) -> dict:
    """DASH-003: unresolved items across compliance (overdue and rejected
    cycles), integrations (Failed / Warning), incidents (open, by severity)
    and AI alerts (unacknowledged / escalated) — most severe first, then
    oldest. Ids are stable per item and state, so a dismissed item
    (DASH-007) comes back only if it changes."""
    from app.services import anomaly, compliance
    from app.services.incidents import incident_ref

    scope = ctx.scope("attention_queue")
    now = datetime.utcnow()
    items = []

    def add(id_, kind, severity, title, detail, pid, since, link):
        if not _within(pid, scope):
            return
        if isinstance(since, date) and not isinstance(since, datetime):
            since = datetime.combine(since, time.min)
        items.append({"id": id_, "kind": kind, "severity": severity, "title": title, "detail": detail,
                      "participant_id": pid, "participant_name": ctx.name(pid), "since": since,
                      "age_days": max(0, (now - since).days) if since else 0, "link": link})

    for r in compliance.overdue_rows(ctx.session):
        add(f"cycle:{r['cycle_id']}:Overdue", "Compliance", "High", f"Overdue: {r['requirement_name']} ({r['period']})",
            f"Due {r['due_date']}", r["participant_id"], r["due_date"] + timedelta(days=1), "/compliance?tab=calendar")
    for r in compliance.summary_rows(ctx.session):
        if r["status"] == compliance.REJECTED:
            add(f"cycle:{r['cycle_id']}:Rejected", "Compliance", "Medium", f"Rejected: {r['requirement_name']} ({r['period']})",
                r["rejection_reason"] or "A corrected file is needed.", r["participant_id"],
                r["submission_date"] or r["due_date"], "/compliance?tab=review")
    for i in ctx.session.exec(select(Integration).where(Integration.status.in_((IntegrationStatus.failed, IntegrationStatus.warning)))).all():
        add(f"integration:{i.id}:{i.status.value}", "Integration", "High" if i.status == IntegrationStatus.failed else "Medium",
            f"{i.source_name} {i.status.value.lower()}", i.note, i.participant_id, i.updated_at, "/integrations")
    for inc in ctx.session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all():
        add(f"incident:{inc.id}:{inc.status.value}", "Incident", inc.severity.value,
            f"{incident_ref(inc)} {inc.status.value}: {inc.description[:90]}", f"Owner: {inc.assignee or '—'}",
            inc.participant_id, inc.created_at, "/compliance?tab=incidents")
    for a in ctx.session.exec(select(AnomalyAlert).where(AnomalyAlert.status.in_((anomaly.GENERATED, anomaly.ESCALATED)))).all():
        add(f"alert:{a.id}:{a.status}", "AI alert", a.severity.title(),
            f"ALT-{a.id} {a.status}: {a.indicator}", f"{a.observed_value} vs baseline {a.baseline_value}",
            a.participant_id, a.created_at, f"/ai?alert={a.id}")
    items.sort(key=lambda x: (SEVERITY_RANK.get(x["severity"], 9), -(now - x["since"]).total_seconds() if x["since"] else 0, x["title"]))
    counts: dict[str, int] = {}
    for it in items:
        counts[it["kind"]] = counts.get(it["kind"], 0) + 1
    return {"total": len(items), "by_kind": counts, "items": items[:50]}


BUILDERS = {
    "overdue_submissions": overdue_submissions,
    "upcoming_deadlines": upcoming_deadlines,
    "open_incidents": open_incidents,
    "compliance_rate": compliance_rate,
    "overdue_action_items": overdue_action_items,
    "recent_activity": recent_activity,
    "integration_health": integration_health,
    "ai_alerts": ai_alerts,
    "inclusion_snapshot": inclusion_snapshot,
    "risk_overview": risk_overview,
    "recent_reports": recent_reports,
    "compliance_overview": compliance_overview,
    "active_pipelines": active_pipelines,
    "failed_integrations": failed_integrations,
    "data_freshness": data_freshness,
    "system_health": system_health,
    "pending_mappings": pending_mappings,
    "recent_pipeline_runs": recent_pipeline_runs,
    "attention_queue": attention_queue,
}


def role_of(user: User) -> UserRole:
    return user.role if user.role in ROLE_WIDGETS else UserRole.technical


def widget_meta(key: str, ctx: Ctx) -> dict:
    w = WIDGETS[key]

    def opt(name):
        choice: Optional[Choice] = getattr(w, name)
        if choice is None:
            return None
        return {"value": ctx.opt(key, name), "default": choice.default,
                "choices": [{"value": v, "label": label} for v, label in choice.choices]}

    period = opt("period")
    if period and (ctx.filters.get("date_from") or ctx.filters.get("date_to")):
        period["overridden"] = True  # the dashboard date range wins
    return {"key": key, "title": w.title, "description": w.description, "link": w.link, "note": w.note,
            "period": period, "scope": opt("scope")}


def build(session: Session, user: User, filters: dict, options: dict, only: Optional[str] = None) -> dict:
    """The role's dashboard: its §15 widgets, the common sections it doesn't
    already have, each with its data (or just one widget with `only`)."""
    role = role_of(user)
    ctx = Ctx(session, user, filters, options)
    widgets = ROLE_WIDGETS[role]
    sections = [k for k in COMMON_SECTIONS if k not in widgets]
    keys = [only] if only else widgets + sections
    data = {k: {**widget_meta(k, ctx), "data": BUILDERS[k](ctx)} for k in keys}
    scope = ctx.filtered_scope()
    return {
        "role": role.value, "as_of": ctx.today, "generated_at": datetime.utcnow(),
        "widgets": widgets, "sections": sections,
        "filters": {k: v for k, v in filters.items()},
        "participants_in_scope": len(scope) if scope is not None else len(ctx._participants),
        "participants_total": len(ctx._participants),
        "data": data,
    }


def filter_options(session: Session) -> dict:
    participants = session.exec(select(Participant).order_by(Participant.name)).all()
    return {
        "participants": [{"id": p.id, "name": p.name, "code": p.code, "type": p.type, "region": p.region, "status": p.status}
                         for p in participants],
        "institution_types": [t.value for t in InstitutionType],
        "regions": REGIONS,
        "statuses": [s.value for s in ParticipantStatus],
        "risk_categories": list(RISK_CATEGORIES),
    }
