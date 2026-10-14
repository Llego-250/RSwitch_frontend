"""Reports (SRS §5.11 REQ-RPT-001..006, §14, §17.3, §19.6).

Six report types, each with its §14 columns and filters, rendered to PDF,
Excel or CSV and kept as a ReportRun — the report history (REQ-RPT-004).
Rows come from the owning modules' read models (compliance §14.1/§14.5,
risk + compliance §14.3, inclusion §14.4, governance action items), so a
report always agrees with the page it summarises.

Permissions follow each report's §14 "Permissions" row, which is more
specific than the §12.1 module row and wins where they differ: §14.2 lets
Technical/Admin generate Integration Health although §12.1 has Reports —
Generate ✗ for Technical. "View" means seeing a report's runs in history and
downloading them; whoever may generate a report may also view it.

Generation is queued (§17.3): a run is created Queued and rendered off the
request; scheduled runs (REQ-RPT-005) are rendered by the scheduler tick and
emailed to the requesting user with the file attached (§13)."""

import csv
import io
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum
from typing import Callable, Optional

import pandas as pd
from dateutil.relativedelta import relativedelta
from fpdf import FPDF
from fpdf.fonts import FontFace
from openpyxl.utils import get_column_letter
from sqlmodel import Session, select

from app.db import engine
from app.models.admin import ReportRun, ReportSchedule
from app.models.enums import (
    REGIONS,
    UNRESOLVED_INCIDENT_STATUSES,
    InstitutionType,
    IntegrationStatus,
    IssueSeverity,
    IssueStatus,
    ParticipantStatus,
    SubmissionResult,
    UserRole,
)
from app.models.integration import Integration, IntegrationMode
from app.models.participant import Participant
from app.models.pipeline import PipelineJob, PipelineJobStatus
from app.models.user import User
from app.storage import get_file, put_file

log = logging.getLogger("rdip.reports")

C, B, T = UserRole.compliance, UserRole.business, UserRole.technical

MEDIA = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
}
FORMATS = list(MEDIA)
RUN_STATUSES = ("Queued", "Running", "Completed", "Failed")
FREQUENCIES = ("Daily", "Weekly", "Monthly")
FREQUENCY_STEP = {"Daily": relativedelta(days=1), "Weekly": relativedelta(weeks=1), "Monthly": relativedelta(months=1)}
DELIVERY_HOUR = 6  # scheduled reports go out at 06:00 organisation time
RISK_LEVELS = ("Low", "Medium", "High", "Insufficient data")
INTEGRATION_STATUSES = list(dict.fromkeys(s.value for s in IntegrationStatus))  # §9.1 words, aliases folded
INCIDENT_STATUSES = list(dict.fromkeys(s.value for s in IssueStatus))
PDF_CELL_LIMIT = 700  # a table row can't span pages; very long text is cut


# ---- definitions ---------------------------------------------------------------

@dataclass(frozen=True)
class Column:
    key: str
    header: str
    width: float = 1.0  # relative PDF column width
    kind: str = "text"  # text | int | pct | score | date | datetime


@dataclass
class Table:
    title: str
    columns: list[Column]
    rows: list[dict]


@dataclass
class Result:
    rows: list[dict]
    notes: list[str] = field(default_factory=list)
    extra: list[Table] = field(default_factory=list)
    native: Optional[dict] = None  # inclusion's own dashboard, for its renderer


@dataclass(frozen=True)
class ReportType:
    key: str
    name: str
    section: str
    purpose: str
    generate: frozenset
    view: frozenset
    filters: tuple
    columns: tuple
    status_label: str = "Status"
    status_options: tuple = ()
    date_basis: str = ""
    note: str = ""


FILTER_LABELS = {
    "participant_id": "Institution",
    "institution_type": "Participant type",
    "region": "Region",
    "status": "Status",
    "date_from": "From",
    "date_to": "To",
    "risk_level": "Risk level",
    "integration_type": "Integration type",
    "severity": "Severity",
    "committee_id": "Committee",
    "owner": "Owner",
}
# REQ-RPT-006: every report filters on these (where the data has them).
COMMON_FILTERS = ("participant_id", "institution_type", "region", "status", "date_from", "date_to", "risk_level")


def _cols(*spec) -> tuple:
    return tuple(Column(*s) for s in spec)


REPORT_TYPES: dict[str, ReportType] = {
    rt.key: rt for rt in (
        ReportType(
            "compliance_summary", "Compliance Summary", "§14.1",
            "Overview of compliance status across all or selected participants.",
            generate=frozenset({C}), view=frozenset({B}),
            filters=COMMON_FILTERS,
            columns=_cols(("participant", "Participant name", 1.5), ("requirement", "Requirement name", 1.7),
                          ("due_date", "Due date", 0.8, "date"), ("submission_date", "Submission date", 1.0, "datetime"),
                          ("status", "Status", 0.9), ("reviewer", "Reviewer", 1.0), ("rejection_reason", "Rejection reason", 2.0)),
            status_label="Compliance status (§9.2)",
            status_options=("Pending", "Overdue", "Approved", "Rejected", "Submitted", "Under Review",
                            "Validation Failed", "Pending Correction"),
            date_basis="Due date. Without a date range, each active requirement's current cycle is listed.",
        ),
        ReportType(
            "integration_health", "Integration Health", "§14.2",
            "Summary of all integration statuses and recent pipeline runs.",
            generate=frozenset({T}), view=frozenset({C, B}),
            filters=("participant_id", "institution_type", "region", "integration_type", "status", "date_from", "date_to",
                     "risk_level"),
            columns=_cols(("participant", "Participant", 1.5), ("source", "Source", 1.3), ("status", "Status", 0.9),
                          ("last_sync", "Last sync date", 1.0, "datetime"), ("records", "Records transferred", 0.9, "int"),
                          ("errors", "Error count", 0.7, "int"), ("uptime", "Uptime %", 0.7, "pct")),
            status_label="Integration status (§9.1)",
            status_options=tuple(INTEGRATION_STATUSES),
            date_basis="Pipeline runs in the period (default: the last 30 days) give records transferred, error "
                       "count, uptime % and the recent-runs table.",
            note="§12.1 lists Reports — Generate as ✗ for Technical/Admin; §14.2 grants it for this report and is "
                 "applied as the more specific rule.",
        ),
        ReportType(
            "participant_performance", "Participant Performance", "§14.3",
            "Ranked view of all participants by operational performance.",
            generate=frozenset({C, B}), view=frozenset(),
            filters=COMMON_FILTERS,
            columns=_cols(("participant", "Participant", 1.8), ("risk_score", "Risk score", 0.9, "score"),
                          ("compliance_rate", "Compliance rate", 0.9, "pct"), ("failure_rate", "Failure rate", 0.9, "pct"),
                          ("open_incidents", "Open incidents", 0.8, "int"),
                          ("overdue_submissions", "Overdue submissions", 0.9, "int")),
            status_label="Participant status",
            status_options=tuple(s.value for s in ParticipantStatus),
            date_basis="Window for compliance rate and failure rate (default: the last 12 months). Risk score, open "
                       "incidents and overdue submissions are current.",
        ),
        ReportType(
            "inclusion", "Financial Inclusion", "§14.4",
            "Aggregated inclusion metrics by institution type and region.",
            generate=frozenset({B}), view=frozenset({C}),
            filters=("institution_type", "region", "date_from", "date_to"),
            columns=_cols(("Institution type", "Institution type", 1.2), ("Region", "Region", 1.1),
                          ("Metric", "Metric", 1.6), ("Value", "Value", 0.9), ("Data source", "Data source", 2.6),
                          ("Last updated", "Last updated", 0.8)),
            date_basis="Reporting period: the months the range covers.",
            note="Aggregated institution-level metrics: institution, status and risk-level filters do not apply "
                 "(SRS §2.7, §14.4).",
        ),
        ReportType(
            "incidents", "Incident Report", "§14.5",
            "List of all incidents within a period.",
            generate=frozenset({C}), view=frozenset(),
            filters=("participant_id", "institution_type", "region", "severity", "status", "date_from", "date_to",
                     "risk_level"),
            columns=_cols(("incident_id", "Incident ID", 0.7), ("participant", "Participant", 1.3),
                          ("severity", "Severity", 0.6), ("description", "Description", 2.4),
                          ("raised_date", "Raised date", 0.9, "datetime"), ("status", "Status", 0.9),
                          ("resolved_date", "Resolved date", 0.9, "datetime"),
                          ("resolution_summary", "Resolution summary", 2.0)),
            status_label="Incident status (§9.4)",
            status_options=tuple(INCIDENT_STATUSES),
            date_basis="Raised date.",
        ),
        ReportType(
            "governance_action_items", "Governance Action Items", "§5.11",
            "Action items from governance meetings with their owners, due dates and status (REQ-GOV-006/007).",
            generate=frozenset({C}), view=frozenset({B, T}),
            filters=("committee_id", "owner", "status", "date_from", "date_to", "participant_id", "institution_type",
                     "region", "risk_level"),
            columns=_cols(("committee", "Committee", 1.2), ("action_item", "Action item", 2.4), ("owner", "Owner", 1.2),
                          ("due_date", "Due date", 0.8, "date"), ("status", "Status", 0.8),
                          ("meeting", "Meeting", 1.6), ("days_overdue", "Days overdue", 0.7, "int")),
            status_label="Action item status (§9.4)",
            status_options=("Open", "In Progress", "Completed", "Overdue"),
            date_basis="Due date.",
            note="No §14 sheet exists for this report: Compliance (governance manager, REQ-GOV-011) generates, the "
                 "other roles view. Institution filters match action items owned by an institution.",
        ),
    )
}
REPORTS = {k: rt.name for k, rt in REPORT_TYPES.items()}

# Runs recorded before the §14 catalogue, mapped to the type that now covers
# them (for the name shown and who may see them).
LEGACY = {"compliance_status": "compliance_summary", "submission_history": "compliance_summary",
          "integration_status": "integration_health", "issues": "incidents"}


def report_type(key: str) -> Optional[ReportType]:
    return REPORT_TYPES.get(LEGACY.get(key, key))


def can_generate(user: User, key: str) -> bool:
    rt = report_type(key)
    return bool(rt) and key in REPORT_TYPES and user.role in rt.generate


def can_view(user: User, key: str) -> bool:
    rt = report_type(key)
    return bool(rt) and user.role in (rt.generate | rt.view)


def viewable_keys(user: User) -> list[str]:
    keys = [k for k in REPORT_TYPES if can_view(user, k)]
    return keys + [old for old, new in LEGACY.items() if new in keys]


# ---- filters (REQ-RPT-002, REQ-RPT-006) --------------------------------------------

class FilterError(ValueError):
    def __init__(self, field_name: str, message: str):
        super().__init__(message)
        self.field = field_name
        self.message = message


def _iso(value, name: str) -> str:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        raise FilterError(name, "Use a date like 2026-10-31.")


def clean_filters(session: Session, key: str, raw: Optional[dict]) -> dict:
    """Validated, normalised filters for one report type (empty values
    dropped). Raises FilterError naming the offending field (§20.2)."""
    from app.models.governance import GovernanceCommittee

    rt = REPORT_TYPES[key]
    out: dict = {}
    for name, value in (raw or {}).items():
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        if name not in rt.filters:
            raise FilterError(name, f"{FILTER_LABELS.get(name, name)} is not a filter of the {rt.name} report.")
        if name in ("participant_id", "committee_id"):
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise FilterError(name, f"{FILTER_LABELS[name]} must be an id.")
            model = Participant if name == "participant_id" else GovernanceCommittee
            if session.get(model, value) is None:
                raise FilterError(name, f"Unknown {FILTER_LABELS[name].lower()}.")
        elif name in ("date_from", "date_to"):
            value = _iso(value, name)
        else:
            value = str(value).strip()
            allowed = {
                "institution_type": [t.value for t in InstitutionType],
                "region": REGIONS,
                "status": list(rt.status_options),
                "risk_level": list(RISK_LEVELS),
                "integration_type": [m.value for m in IntegrationMode],
                "severity": [s.value for s in IssueSeverity],
            }.get(name)
            if allowed is not None and value not in allowed:
                raise FilterError(name, f"{FILTER_LABELS[name]} must be one of: {', '.join(allowed)}.")
            if name == "owner":
                value = value[:120]
        out[name] = value
    if out.get("date_from") and out.get("date_to") and out["date_from"] > out["date_to"]:
        raise FilterError("date_from", "The start date must not be after the end date.")
    return out


def describe_filters(session: Session, key: str, filters: dict) -> list[str]:
    """Human-readable filter lines for report headers and emails."""
    from app.models.governance import GovernanceCommittee

    rt = report_type(key)
    lines = []
    for name in (rt.filters if rt else filters):
        value = filters.get(name)
        if value in (None, "") or name in ("date_from", "date_to"):
            continue
        if name == "participant_id":
            p = session.get(Participant, value)
            value = p.name if p else f"#{value}"
        elif name == "committee_id":
            c = session.get(GovernanceCommittee, value)
            value = c.name if c else f"#{value}"
        label = rt.status_label if (name == "status" and rt) else FILTER_LABELS.get(name, name)
        lines.append(f"{label}: {value}")
    if filters.get("date_from") or filters.get("date_to"):
        lines.append(f"Date range: {filters.get('date_from') or 'earliest'} to {filters.get('date_to') or 'latest'}"
                     + (f" ({rt.date_basis.split('.')[0].lower()})" if rt and rt.date_basis else ""))
    return lines


def _d(value: Optional[str]) -> Optional[date]:
    return date.fromisoformat(value) if value else None


# ---- shared context -------------------------------------------------------------------

class Context:
    """Per-run lookups: organisation time, risk bands and the participant
    scope the institution/type/region/risk filters select."""

    def __init__(self, session: Session, filters: dict):
        from app.services.governance_jobs import org_today, org_zone

        self.session = session
        self.filters = filters
        self.zone = org_zone(session)
        self.today = org_today(session)
        self._scores: Optional[list[dict]] = None
        self.participants = {p.id: p for p in session.exec(select(Participant)).all()}

    def local(self, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc).astimezone(self.zone).replace(tzinfo=None)

    def local_now(self) -> datetime:
        return self.local(datetime.utcnow())

    @property
    def scores(self) -> list[dict]:
        if self._scores is None:
            from app.services import risk

            self._scores = risk.latest_scores(self.session)
        return self._scores

    def band(self, participant_id: int) -> str:
        row = next((r for r in self.scores if r["participant_id"] == participant_id), None)
        return (row or {}).get("band") or "Insufficient data"

    def scope(self, *, participant_status: Optional[str] = None) -> Optional[set[int]]:
        """Participant ids the participant-level filters allow, or None when
        none is set."""
        f = self.filters
        if not any(f.get(k) for k in ("participant_id", "institution_type", "region", "risk_level")) and not participant_status:
            return None
        ids = set()
        for p in self.participants.values():
            if f.get("participant_id") and p.id != f["participant_id"]:
                continue
            if f.get("institution_type") and p.type != f["institution_type"]:
                continue
            if f.get("region") and p.region != f["region"]:
                continue
            if participant_status and p.status != participant_status:
                continue
            ids.add(p.id)
        if f.get("risk_level"):
            ids = {i for i in ids if self.band(i) == f["risk_level"]}
        return ids

    def name(self, participant_id: Optional[int]) -> str:
        p = self.participants.get(participant_id) if participant_id else None
        return p.name if p else (f"Participant #{participant_id}" if participant_id else "")


# ---- builders (one per report type) --------------------------------------------------

def _compliance_summary(ctx: Context) -> Result:
    """§14.1 from compliance.summary_rows."""
    from app.services import compliance

    f = ctx.filters
    rows = compliance.summary_rows(ctx.session, {
        "participant_id": f.get("participant_id"), "institution_type": f.get("institution_type"),
        "status": f.get("status"), "date_from": _d(f.get("date_from")), "date_to": _d(f.get("date_to")),
    })
    scope = ctx.scope()
    out = [{"participant": r["participant_name"], "requirement": r["requirement_name"], "due_date": r["due_date"],
            "submission_date": ctx.local(r["submission_date"]), "status": r["status"], "reviewer": r["reviewer"],
            "rejection_reason": r["rejection_reason"]}
           for r in rows if scope is None or r["participant_id"] in scope]
    note = ("Every cycle due in the date range is listed." if f.get("date_from") or f.get("date_to")
            else "Each active requirement's current cycle is listed.")
    return Result(out, notes=[note + " Status is the §9.2 compliance status as of today."])


def _window(ctx: Context, default_days: Optional[int] = None, default_months: Optional[int] = None) -> tuple[date, date]:
    f = ctx.filters
    end = _d(f.get("date_to")) or ctx.today
    start = _d(f.get("date_from"))
    if start is None:
        start = end - (timedelta(days=default_days - 1) if default_days else relativedelta(months=default_months))
    return start, end


def _utc_bounds(ctx: Context, start: date, end: date) -> tuple[datetime, datetime]:
    """[start 00:00, end+1 00:00) in organisation time, as naive UTC."""
    lo = datetime.combine(start, time.min, tzinfo=ctx.zone).astimezone(timezone.utc).replace(tzinfo=None)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=ctx.zone).astimezone(timezone.utc).replace(tzinfo=None)
    return lo, hi


def _integration_health(ctx: Context) -> Result:
    """§14.2: each data source's status and last sync, with its pipeline runs
    over the period."""
    f = ctx.filters
    start, end = _window(ctx, default_days=30)
    lo, hi = _utc_bounds(ctx, start, end)
    scope = ctx.scope()
    query = select(Integration)
    if f.get("integration_type"):
        query = query.where(Integration.integration_mode == f["integration_type"])
    integrations = [i for i in ctx.session.exec(query).all()
                    if (scope is None or i.participant_id in scope) and (not f.get("status") or i.status.value == f["status"])]
    integrations.sort(key=lambda i: (ctx.name(i.participant_id), i.source_name))
    by_id = {i.id: i for i in integrations}
    jobs = ctx.session.exec(
        select(PipelineJob).where(PipelineJob.queued_at >= lo, PipelineJob.queued_at < hi)
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
    ).all() if by_id else []
    jobs = [j for j in jobs if j.integration_id in by_id]
    done, failed = PipelineJobStatus.completed.value, PipelineJobStatus.failed.value
    rows = []
    for i in integrations:
        mine = [j for j in jobs if j.integration_id == i.id]
        ok = [j for j in mine if j.status == done]
        finished = [j for j in mine if j.status in (done, failed)]
        rows.append({
            "participant": ctx.name(i.participant_id), "source": i.source_name, "status": i.status.value,
            "last_sync": ctx.local(i.last_sync_at),
            "records": sum(j.records_processed for j in ok),
            "errors": sum(j.error_count for j in finished),
            "uptime": round(len(ok) / len(finished) * 100, 1) if finished else None,
        })
    runs = Table("Recent pipeline runs", list(_cols(
        ("job", "Job", 0.6), ("participant", "Participant", 1.4), ("source", "Source", 1.2), ("trigger", "Trigger", 0.8),
        ("status", "Status", 0.8), ("queued", "Queued", 1.0, "datetime"), ("finished", "Finished", 1.0, "datetime"),
        ("records", "Records", 0.7, "int"), ("errors", "Errors", 0.6, "int"))), [
        {"job": f"JOB-{j.id}", "participant": ctx.name(j.participant_id), "source": by_id[j.integration_id].source_name,
         "trigger": j.trigger, "status": j.status, "queued": ctx.local(j.queued_at), "finished": ctx.local(j.finished_at),
         "records": j.records_processed, "errors": j.error_count}
        for j in jobs[:100]])
    return Result(rows, extra=[runs], notes=[
        f"Records transferred, error count and uptime % cover pipeline runs queued {start} to {end}.",
        "Uptime % = completed runs ÷ finished runs (completed + failed) of the data source in that period; "
        "blank when none finished. Status and last sync date are current.",
    ])


def _rates(ctx: Context, ids: set[int], start: date, end: date) -> dict[int, dict]:
    """REQ-COMP-008 failure rate and deadline adherence (the compliance
    rate) per participant over [start, end] — the definitions of
    compliance.failure_rate / adherence_rate, for an arbitrary window."""
    from app.models.compliance import ComplianceCycle, ComplianceRequirement
    from app.models.document import ComplianceDocument
    from app.models.submission import Submission
    from app.services.compliance import APPROVED, REJECTED

    lo = datetime.combine(start, time.min)
    hi = datetime.combine(end + timedelta(days=1), time.min)
    out = {i: {"total": 0, "bad": 0, "due": 0, "on_time": 0} for i in ids}
    for s in ctx.session.exec(select(Submission).where(Submission.uploaded_at >= lo, Submission.uploaded_at < hi)).all():
        if s.participant_id in out:
            out[s.participant_id]["total"] += 1
            out[s.participant_id]["bad"] += s.result == SubmissionResult.failed or s.status == REJECTED
    for d in ctx.session.exec(select(ComplianceDocument).where(
            ComplianceDocument.uploaded_at >= lo, ComplianceDocument.uploaded_at < hi, ComplianceDocument.review_status != "")).all():
        if d.participant_id in out:
            out[d.participant_id]["total"] += 1
            out[d.participant_id]["bad"] += d.review_status == REJECTED
    last_due = min(end, ctx.today - timedelta(days=1))
    for cycle, req in ctx.session.exec(select(ComplianceCycle, ComplianceRequirement).where(
            ComplianceCycle.requirement_id == ComplianceRequirement.id,
            ComplianceCycle.due_date >= start, ComplianceCycle.due_date <= last_due)).all():
        if req.participant_id in out:
            out[req.participant_id]["due"] += 1
            out[req.participant_id]["on_time"] += cycle.stage == APPROVED and bool(cycle.on_time)
    return {i: {"failure_rate": round(v["bad"] / v["total"] * 100, 1) if v["total"] else None,
                "compliance_rate": round(v["on_time"] / v["due"] * 100, 1) if v["due"] else None}
            for i, v in out.items()}


def _participant_performance(ctx: Context) -> Result:
    """§14.3: risk (services.risk) with compliance and incident figures,
    best performer first."""
    from app.models.issue import Issue
    from app.services import compliance

    f = ctx.filters
    scope = ctx.scope(participant_status=f.get("status"))
    ids = set(ctx.participants) if scope is None else scope
    start, end = _window(ctx, default_months=12)
    if start > end:
        start = end
    rates = _rates(ctx, ids, start, end)
    scores = {r["participant_id"]: r for r in ctx.scores}
    incidents: dict[int, int] = {}
    for inc in ctx.session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all():
        incidents[inc.participant_id] = incidents.get(inc.participant_id, 0) + 1
    overdue: dict[int, int] = {}
    for r in compliance.overdue_rows(ctx.session):
        overdue[r["participant_id"]] = overdue.get(r["participant_id"], 0) + 1
    rows = []
    for pid in ids:
        score = scores.get(pid) or {}
        rows.append({"participant": ctx.name(pid), "risk_score": score.get("composite"), "band": score.get("band"),
                     **rates[pid], "open_incidents": incidents.get(pid, 0), "overdue_submissions": overdue.get(pid, 0)})

    def rank(r):
        cr, fr = r["compliance_rate"], r["failure_rate"]
        return (r["risk_score"] is None, r["risk_score"] or 0, -(cr if cr is not None else -1),
                fr if fr is not None else 101, r["open_incidents"] + r["overdue_submissions"], r["participant"])

    rows.sort(key=rank)
    return Result(rows, notes=[
        "Ranked best first: lowest current risk score (0-100, higher = riskier), then highest compliance rate, "
        "lowest failure rate and fewest open items. Participants with under 3 months of history have no risk "
        "score yet (REQ-P360-012) and rank after scored ones.",
        f"Compliance rate = deadlines due {start} to {end} met with an approved, on-time file. Failure rate "
        f"(REQ-COMP-008) = submissions in that period that failed validation or were rejected. Risk score, open "
        f"incidents and overdue submissions are as of today.",
    ])


def _inclusion(ctx: Context) -> Result:
    """§14.4 straight from the inclusion service (its columns and renderer)."""
    from app.services import inclusion

    f = ctx.filters
    try:
        rows, _, dash = inclusion.report_rows(
            ctx.session, f.get("institution_type"), f.get("region"),
            f["date_from"][:7] if f.get("date_from") else None, f["date_to"][:7] if f.get("date_to") else None)
    except inclusion.FilterError as exc:
        raise FilterError(exc.field, exc.message)
    return Result(rows, native=dash, notes=[inclusion.INDICATIVE_LABEL])


def _incidents(ctx: Context) -> Result:
    """§14.5 from compliance.incident_rows."""
    from app.services import compliance

    f = ctx.filters
    rows = compliance.incident_rows(ctx.session, {
        "participant_id": f.get("participant_id"), "severity": f.get("severity"), "status": f.get("status"),
        "date_from": _d(f.get("date_from")), "date_to": _d(f.get("date_to")),
    })
    scope = ctx.scope()
    return Result([
        {"incident_id": r["ref"], "participant": r["participant_name"], "severity": r["severity"],
         "description": r["description"], "raised_date": ctx.local(r["raised_at"]), "status": r["status"],
         "resolved_date": ctx.local(r["resolved_at"]), "resolution_summary": r["resolution_summary"]}
        for r in rows if scope is None or r["participant_id"] in scope
    ])


def _governance_action_items(ctx: Context) -> Result:
    """Governance action items with their §9.4 status as of today."""
    from app.models.governance import ActionItem, GovernanceCommittee, Meeting
    from app.services.governance_jobs import effective_status

    f = ctx.filters
    query = select(ActionItem).order_by(ActionItem.due_date, ActionItem.id)
    if f.get("committee_id"):
        query = query.where(ActionItem.committee_id == f["committee_id"])
    if f.get("date_from"):
        query = query.where(ActionItem.due_date >= _d(f["date_from"]))
    if f.get("date_to"):
        query = query.where(ActionItem.due_date <= _d(f["date_to"]))
    committees = {c.id: c.name for c in ctx.session.exec(select(GovernanceCommittee)).all()}
    meetings = {m.id: m for m in ctx.session.exec(select(Meeting)).all()}
    scope = ctx.scope()
    owner = (f.get("owner") or "").lower()
    rows = []
    for item in ctx.session.exec(query).all():
        status = effective_status(item, ctx.today)
        if f.get("status") and status != f["status"]:
            continue
        if owner and owner not in (item.owner or "").lower():
            continue
        if scope is not None and item.owner_participant_id not in scope:
            continue
        meeting = meetings.get(item.meeting_id)
        local = ctx.local(meeting.scheduled_at) if meeting else None
        rows.append({
            "committee": committees.get(item.committee_id, item.committee), "action_item": item.description,
            "owner": item.owner, "due_date": item.due_date, "status": status,
            "meeting": f"{meeting.title} ({local:%Y-%m-%d})" if meeting else "",
            "days_overdue": (ctx.today - item.due_date).days if status == "Overdue" else None,
        })
    return Result(rows, notes=["Status is derived as of today: an item past its due date and not completed is Overdue."])


BUILDERS: dict[str, Callable[[Context], Result]] = {
    "compliance_summary": _compliance_summary,
    "integration_health": _integration_health,
    "participant_performance": _participant_performance,
    "inclusion": _inclusion,
    "incidents": _incidents,
    "governance_action_items": _governance_action_items,
}


def build(session: Session, key: str, filters: dict) -> tuple[ReportType, Result, Context]:
    ctx = Context(session, filters)
    return REPORT_TYPES[key], BUILDERS[key](ctx), ctx


def report_rows(session: Session, report: str, participant_id=None, date_from=None, date_to=None):
    """(rows keyed by column header, headers) — the plain-table view of a
    report, e.g. for checks. Accepts the legacy keys."""
    key = LEGACY.get(report, report)
    filters = {k: v for k, v in {"participant_id": participant_id, "date_from": date_from, "date_to": date_to}.items()
               if v and k in REPORT_TYPES[key].filters}
    rt, result, _ = build(session, key, clean_filters(session, key, filters))
    if result.native is not None:
        from app.services.inclusion import REPORT_COLUMNS

        return result.rows, REPORT_COLUMNS
    headers = [c.header for c in rt.columns]
    return [{c.header: r.get(c.key) for c in rt.columns} for r in result.rows], headers


# ---- rendering (REQ-RPT-003) ---------------------------------------------------------------

def _latin1(text: str) -> str:
    """Core PDF fonts are latin-1 only."""
    for a, b in (("—", "-"), ("–", "-"), ("≥", ">="), ("≤", "<="), ("→", "->"), ("÷", "/"), ("’", "'"), ("“", '"'),
                 ("”", '"'), ("✗", "x"), ("✓", "v")):
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def _text(value, kind: str = "text", empty: str = "") -> str:
    if value is None or value == "":
        return empty
    if isinstance(value, Enum):
        value = value.value
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.isoformat()
    if kind == "pct" and isinstance(value, (int, float)):
        return f"{value:.1f}%"
    if kind == "score" and isinstance(value, (int, float)):
        return f"{value:.1f}"
    if isinstance(value, float):
        return f"{value:,.1f}" if value % 1 else f"{value:,.0f}"
    if isinstance(value, int):
        return f"{value:,}" if kind == "int" else str(value)
    return str(value)


def _cell_value(row: dict, col: Column):
    value = row.get(col.key)
    if col.key == "risk_score" and value is None:
        return "Insufficient data"
    return value.value if isinstance(value, Enum) else value


@dataclass
class Meta:
    title: str
    subtitle: str
    generated_by: str
    generated_at: datetime  # organisation local time
    zone_name: str
    filters: list[str]
    notes: list[str]


class _PDF(FPDF):
    def __init__(self, meta: Meta):
        super().__init__(orientation="L", format="A4")
        self.meta = meta
        self.set_auto_page_break(True, margin=14)
        self.set_margins(12, 12, 12)

    def footer(self):
        self.set_y(-10)
        self.set_font("Helvetica", size=7)
        self.set_text_color(110, 120, 135)
        self.cell(0, 5, _latin1(f"RDIP - {self.meta.title} - generated {self.meta.generated_at:%Y-%m-%d %H:%M} "
                                f"({self.meta.zone_name})"), align="L")
        self.set_x(-40)
        self.cell(28, 5, f"Page {self.page_no()} of {{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def _pdf_table(pdf: _PDF, columns: list[Column], rows: list[dict]) -> None:
    if not rows:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(110, 120, 135)
        pdf.cell(0, 7, "No records match these filters.", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        return
    pdf.set_font("Helvetica", size=7.5)
    heading = FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=(15, 111, 131))
    with pdf.table(col_widths=tuple(c.width for c in columns), text_align="LEFT", line_height=4.2,
                   headings_style=heading, cell_fill_color=(242, 246, 248), cell_fill_mode="ROWS",
                   padding=1.2, repeat_headings=1) as table:
        header = table.row()
        for c in columns:
            header.cell(_latin1(c.header))
        for r in rows:
            row = table.row()
            for c in columns:
                text = _text(_cell_value(r, c), c.kind, "-")
                if len(text) > PDF_CELL_LIMIT:
                    text = text[:PDF_CELL_LIMIT - 1] + "..."
                row.cell(_latin1(text))


def render_pdf(meta: Meta, columns: list[Column], rows: list[dict], extra: list[Table]) -> bytes:
    pdf = _PDF(meta)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(23, 32, 51)
    pdf.cell(0, 8, _latin1(meta.title), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=8.5)
    pdf.set_text_color(82, 97, 116)
    pdf.multi_cell(0, 4.5, _latin1(meta.subtitle), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(23, 32, 51)
    pdf.cell(0, 4.5, _latin1(f"Generated by {meta.generated_by} on {meta.generated_at:%Y-%m-%d %H:%M} "
                             f"({meta.zone_name}) - {len(rows)} record(s)"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=8.5)
    pdf.multi_cell(0, 4.5, _latin1("Filters applied: " + ("; ".join(meta.filters) if meta.filters else "none (all records)")),
                   new_x="LMARGIN", new_y="NEXT")
    if meta.notes:
        pdf.set_text_color(82, 97, 116)
        pdf.set_font("Helvetica", "I", 7.5)
        for note in meta.notes:
            pdf.multi_cell(0, 4, _latin1(note), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)
    _pdf_table(pdf, columns, rows)
    for t in extra:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, _latin1(f"{t.title} ({len(t.rows)})"), new_x="LMARGIN", new_y="NEXT")
        _pdf_table(pdf, t.columns, t.rows)
    return bytes(pdf.output())


def _xlsx_sheet(writer, name: str, columns: list[Column], rows: list[dict]) -> None:
    df = pd.DataFrame([[_cell_value(r, c) for c in columns] for r in rows], columns=[c.header for c in columns])
    df.to_excel(writer, sheet_name=name, index=False)
    ws = writer.sheets[name]
    ws.freeze_panes = "A2"
    for i, c in enumerate(columns, start=1):
        letter = get_column_letter(i)
        longest = max([len(c.header)] + [len(_text(_cell_value(r, c), c.kind)) for r in rows[:500]])
        ws.column_dimensions[letter].width = min(60, max(10, longest + 2))
        fmt = {"pct": '0.0"%"', "score": "0.0", "int": "#,##0", "date": "yyyy-mm-dd", "datetime": "yyyy-mm-dd hh:mm"}.get(c.kind)
        if fmt:
            for cell in ws[letter][1:]:
                if isinstance(cell.value, (int, float, datetime, date)):
                    cell.number_format = fmt


def render_xlsx(meta: Meta, columns: list[Column], rows: list[dict], extra: list[Table]) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        _xlsx_sheet(writer, "Report", columns, rows)
        for t in extra:
            _xlsx_sheet(writer, t.title[:31], t.columns, t.rows)
        about = [("Report", meta.title), ("About", meta.subtitle),
                 ("Generated", f"{meta.generated_at:%Y-%m-%d %H:%M} ({meta.zone_name}) by {meta.generated_by}"),
                 ("Records", len(rows)), ("Filters", "; ".join(meta.filters) or "none (all records)")]
        about += [("Note", n) for n in meta.notes]
        pd.DataFrame(about, columns=["Item", "Detail"]).to_excel(writer, sheet_name="About", index=False)
        writer.sheets["About"].column_dimensions["A"].width = 12
        writer.sheets["About"].column_dimensions["B"].width = 120
    return buffer.getvalue()


def render_csv(columns: list[Column], rows: list[dict]) -> bytes:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([c.header for c in columns])
    for r in rows:
        writer.writerow([_text(_cell_value(r, c), c.kind) for c in columns])
    return ("﻿" + out.getvalue()).encode("utf-8")  # BOM so Excel reads UTF-8


def render(session: Session, key: str, fmt: str, filters: dict, generated_by: str) -> tuple[bytes, int]:
    """The report file and its row count."""
    from app.services import inclusion

    rt, result, ctx = build(session, key, filters)
    columns = list(rt.columns)
    if result.native is not None and fmt in ("pdf", "xlsx"):
        # §14.4 keeps the inclusion module's own layout (indicative label,
        # metric definitions) so both exports of the report are identical.
        return inclusion.render(result.rows, inclusion.REPORT_COLUMNS, result.native, fmt, generated_by), len(result.rows)
    if fmt == "csv":
        return render_csv(columns, result.rows), len(result.rows)
    meta = Meta(
        title=f"{rt.name} Report", subtitle=f"{rt.purpose} (SRS {rt.section})", generated_by=generated_by,
        generated_at=ctx.local_now(), zone_name=getattr(ctx.zone, "key", "UTC"),
        filters=describe_filters(session, key, filters), notes=result.notes,
    )
    renderer = render_pdf if fmt == "pdf" else render_xlsx
    return renderer(meta, columns, result.rows, result.extra), len(result.rows)


# ---- runs: queue, execution, history ---------------------------------------------------------

def default_name(session: Session, key: str, filters: dict) -> str:
    rt = REPORT_TYPES[key]
    parts = [line.split(": ", 1)[1] for line in describe_filters(session, key, filters)]
    name = rt.name + (f" — {', '.join(parts)}" if parts else "")
    return name[:160]


def create_run(session: Session, key: str, fmt: str, filters: dict, user: Optional[User], *, name: str = "",
               generated_by: str = "", schedule_id: Optional[int] = None, dedupe_key: str = "") -> ReportRun:
    """A Queued run (the caller hands it to execute())."""
    run = ReportRun(
        report=key, name=(name.strip() or default_name(session, key, filters))[:160], format=fmt, filters=filters,
        participant_id=filters.get("participant_id"), date_from=filters.get("date_from"), date_to=filters.get("date_to"),
        status="Queued", generated_by=generated_by or ((user.full_name or user.email) if user else "System"),
        generated_by_id=user.id if user else None, schedule_id=schedule_id, dedupe_key=dedupe_key,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def _filename(run: ReportRun, stamp: datetime) -> str:
    return f"{run.report}_{stamp:%Y%m%d-%H%M}_RPT{run.id}.{run.format}"


def execute_in(session: Session, run: ReportRun) -> Optional[bytes]:
    """Render a queued run and store its file. Returns the file, or None if
    generation failed (the run is then Failed with a user-facing reason)."""
    from app.services.governance_jobs import org_zone

    run.status = "Running"
    session.add(run)
    session.commit()
    try:
        data, count = render(session, run.report, run.format, run.filters or {}, run.generated_by)
    except FilterError as exc:
        run.status, run.error = "Failed", exc.message
        data = None
    except Exception:  # noqa: BLE001 — the run must not stay Running
        log.exception("Report run %s failed", run.id)
        run.status, run.error = "Failed", "The report could not be generated. The technical team has been notified."
        data = None
    if data is not None:
        stamp = datetime.utcnow().replace(tzinfo=timezone.utc).astimezone(org_zone(session)).replace(tzinfo=None)
        run.filename = _filename(run, stamp)
        run.storage_key = f"reports/{run.id}-{run.filename}"
        put_file(run.storage_key, data, MEDIA[run.format])
        run.size_bytes, run.row_count, run.status, run.error = len(data), count, "Completed", ""
    run.finished_at = datetime.utcnow()
    session.add(run)
    session.commit()
    session.refresh(run)
    return data


def execute(run_id: int) -> None:
    """Background entry point (FastAPI BackgroundTasks / scheduler)."""
    with Session(engine) as session:
        run = session.get(ReportRun, run_id)
        if run is not None and run.status == "Queued":
            execute_in(session, run)


def recover_stale_runs(session: Session, now: Optional[datetime] = None) -> int:
    """Runs orphaned by a restart: still Queued after 2 minutes → run them
    now; Running for over 30 minutes → Failed."""
    now = now or datetime.utcnow()
    count = 0
    for run in session.exec(select(ReportRun).where(ReportRun.status.in_(("Queued", "Running")))).all():
        if run.status == "Queued" and run.generated_at <= now - timedelta(minutes=2):
            execute_in(session, run)
            count += 1
        elif run.status == "Running" and run.generated_at <= now - timedelta(minutes=30):
            run.status, run.error, run.finished_at = "Failed", "Generation was interrupted. Please generate the report again.", now
            session.add(run)
            session.commit()
            count += 1
    return count


def file_of(run: ReportRun) -> bytes:
    return get_file(run.storage_key)


def run_out(session: Session, run: ReportRun, user: Optional[User] = None) -> dict:
    rt = report_type(run.report)
    filters = dict(run.filters or {})
    for k in ("participant_id", "date_from", "date_to"):  # runs from before filters were stored
        if not filters.get(k) and getattr(run, k):
            filters[k] = getattr(run, k)
    return {
        "id": run.id, "ref": f"RPT-{run.id:04d}", "name": run.name or (rt.name if rt else run.report),
        "report": run.report, "report_type": LEGACY.get(run.report, run.report), "report_name": rt.name if rt else run.report,
        "format": run.format, "status": run.status, "error": run.error, "filters": filters,
        "filters_text": describe_filters(session, LEGACY.get(run.report, run.report), filters) if rt else [],
        "row_count": run.row_count, "filename": run.filename, "size_bytes": run.size_bytes,
        "generated_by": run.generated_by, "generated_by_id": run.generated_by_id, "generated_at": run.generated_at,
        "finished_at": run.finished_at, "schedule_id": run.schedule_id,
        "download_url": f"/reports/{run.id}/download" if run.status == "Completed" else None,
        "mine": bool(user and run.generated_by_id == user.id),
    }


def visible_runs(session: Session, user: User, *, report: Optional[str] = None, mine: bool = False,
                 since: Optional[datetime] = None, until: Optional[datetime] = None, limit: int = 200) -> list[ReportRun]:
    keys = viewable_keys(user)
    if report:
        keys = [k for k in keys if LEGACY.get(k, k) == report]
    if not keys:
        return []
    query = select(ReportRun).where(ReportRun.report.in_(keys))
    if mine:
        query = query.where(ReportRun.generated_by_id == user.id)
    if since:
        query = query.where(ReportRun.generated_at >= since)
    if until:
        query = query.where(ReportRun.generated_at < until)
    return list(session.exec(query.order_by(ReportRun.generated_at.desc(), ReportRun.id.desc()).limit(limit)).all())


# ---- schedules (REQ-RPT-005) -------------------------------------------------------------------

def first_slot(session: Session, start: Optional[date] = None) -> datetime:
    """DELIVERY_HOUR organisation time on `start` (default: the next one), as
    naive UTC."""
    from app.services.governance_jobs import org_zone

    zone = org_zone(session)
    now_local = datetime.now(zone)
    if start is None:
        start = now_local.date() if now_local.hour < DELIVERY_HOUR else now_local.date() + timedelta(days=1)
    local = datetime.combine(start, time(DELIVERY_HOUR), tzinfo=zone)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def slot_after(start: datetime, frequency: str, after: datetime) -> datetime:
    """The first slot start + k·frequency (k ≥ 0) strictly after `after` —
    anchored on the start, so monthly slots keep their day of month."""
    step = FREQUENCY_STEP[frequency]
    k = 0
    if after >= start and frequency != "Monthly":
        days = 1 if frequency == "Daily" else 7
        k = max(0, (after - start).days // days - 1)
    while True:
        slot = start + step * k
        if slot > after:
            return slot
        k += 1


def schedule_out(session: Session, schedule: ReportSchedule) -> dict:
    rt = report_type(schedule.report)
    return {
        "id": schedule.id, "name": schedule.name, "report": schedule.report, "report_name": rt.name if rt else schedule.report,
        "format": schedule.format, "frequency": schedule.frequency, "filters": schedule.filters or {},
        "filters_text": describe_filters(session, schedule.report, schedule.filters or {}) if rt else [],
        "active": schedule.active, "created_by": schedule.created_by, "created_by_id": schedule.created_by_id,
        "created_at": schedule.created_at, "next_run_at": schedule.next_run_at if schedule.active else None,
        "last_run_at": schedule.last_run_at, "last_run_id": schedule.last_run_id,
        "cancelled_at": schedule.cancelled_at, "cancelled_by": schedule.cancelled_by,
    }


def _requester(session: Session, schedule: ReportSchedule) -> Optional[User]:
    from app.services.notify import user_by_name_or_email

    if schedule.created_by_id:
        return session.get(User, schedule.created_by_id)
    return user_by_name_or_email(session, schedule.created_by)


def run_schedule(session: Session, schedule: ReportSchedule, slot: datetime) -> Optional[ReportRun]:
    """Generate one slot of a schedule and email it to the requester with the
    file attached. A slot is generated once (dedupe key on the run and the
    email); a requester who may no longer run the report ends the schedule."""
    from app.core.permissions import has_cap
    from app.services import audit, notify
    from app.services.governance_jobs import org_time

    key = f"schedule:{schedule.id}:{slot:%Y%m%dT%H%M}"
    if session.exec(select(ReportRun.id).where(ReportRun.dedupe_key == key)).first() is not None:
        return None
    requester = _requester(session, schedule)
    if requester is None or not requester.is_active or not has_cap(requester, "reports.schedule") \
            or not can_generate(requester, schedule.report):
        schedule.active, schedule.cancelled_at = False, datetime.utcnow()
        schedule.cancelled_by = "System — the requesting user can no longer generate this report"
        session.add(schedule)
        session.commit()
        audit.record(session, "REPORT_SCHEDULE_CANCEL", f"{schedule.name} (requester no longer permitted)", status="WARNING")
        return None
    filters = schedule.filters or {}
    run = create_run(session, schedule.report, schedule.format, filters, requester, name=schedule.name,
                     generated_by=f"{requester.full_name or requester.email} (scheduled)", schedule_id=schedule.id,
                     dedupe_key=key)
    data = execute_in(session, run)
    schedule.last_run_at, schedule.last_run_id = datetime.utcnow(), run.id
    session.add(schedule)
    session.commit()
    audit.record(session, "REPORT_SCHEDULED_RUN", f"RPT-{run.id:04d} {schedule.name} ({schedule.frequency}) — {run.status}",
                 status="SUCCESS" if data is not None else "FAILED", actor_email="scheduler")
    rt = REPORT_TYPES.get(schedule.report)
    when = org_time(session, run.finished_at or datetime.utcnow())
    filters_text = "; ".join(describe_filters(session, schedule.report, filters)) or "none (all records)"
    if data is not None:
        body = (f"Your scheduled report \"{schedule.name}\" ({rt.name if rt else schedule.report}, {schedule.frequency.lower()}) "
                f"was generated on {when}.\n\nFilters: {filters_text}\nRecords: {run.row_count}\n\n"
                f"The {run.format.upper()} file is attached. It is also kept in RDIP under Reports → History (RPT-{run.id:04d}).")
        notify.dispatch(session, "scheduled_report_generated", [requester], f"Scheduled report: {schedule.name}",
                        f"{schedule.name} ({run.row_count} records) is attached.", link="/reports", dedupe_key=key,
                        email_subject=f"[RDIP] Scheduled report: {schedule.name}", email_body=body,
                        attachments=[(run.filename, data, MEDIA[run.format])])
    return run


def run_due_schedules(session: Session, now: Optional[datetime] = None) -> int:
    """Scheduler tick: every active schedule whose slot has come is generated
    once and its next slot set; orphaned queued runs are picked up too.
    Returns the number of scheduled runs made."""
    now = now or datetime.utcnow()
    recover_stale_runs(session, now)
    count = 0
    for schedule in session.exec(select(ReportSchedule).where(ReportSchedule.active == True)).all():  # noqa: E712
        if schedule.frequency not in FREQUENCY_STEP or schedule.report not in REPORT_TYPES:
            continue
        if schedule.next_run_at is None:  # rows from before slots were stored
            base = schedule.last_run_at or schedule.created_at
            schedule.next_run_at = base + FREQUENCY_STEP[schedule.frequency] if schedule.last_run_at else base
        if schedule.next_run_at > now:
            continue
        slot = schedule.next_run_at
        if run_schedule(session, schedule, slot) is not None:
            count += 1
        if schedule.active:
            schedule.next_run_at = slot_after(schedule.start_at or slot, schedule.frequency, now)
        session.add(schedule)
        session.commit()
    return count
