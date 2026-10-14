"""Participant 360 profile (SRS §5.6 REQ-P360-001..008, §8.1, §19.2): one
view of everything RSwitch knows about an institution, assembled from the
modules that own each part — integrations, submissions, the Compliance
Register, incidents, governance action items, AI alerts and the risk score
(app.services.risk). Institution-level only: nothing here carries
customer-level data (REQ-P360-013, §2.7)."""

from datetime import date, datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from app.core.permissions import has_cap
from app.models.alert import AnomalyAlert
from app.models.enums import IntegrationStatus, IssueSeverity, SubmissionResult
from app.models.governance import ActionItem
from app.models.integration import Integration
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import risk

NO_DATA_MESSAGE = "No data submitted yet"  # §8.1 exception
SCOPE_NOTICE = "Institution-level data only — no individual customer data is held or shown (REQ-P360-013)."
RSWITCH, INSTITUTION = "RSwitch", "Institution"


def _iso(value) -> Optional[str]:
    return value.isoformat() if isinstance(value, (date, datetime)) else value


# ---- submissions (REQ-P360-004, §8.1 exception) ------------------------------

def expected_due(session: Session, participant: Participant, compliance: dict, now: Optional[datetime] = None) -> Optional[dict]:
    """When the institution's next data is expected: its earliest open data
    return deadline in the Compliance Register, else its data sources'
    expected schedule, else its expected reporting frequency (§10.1) from
    registration. {date, basis}."""
    from app.services.pipeline_jobs import next_runs
    from app.services.settings_store import get_setting

    now = now or datetime.utcnow()
    returns = [r for r in compliance["requirements"] if r["kind"] == "Data Return" and r["submission_status"] != "Approved"]
    if returns:
        r = min(returns, key=lambda x: x["due_date"])
        period = (r.get("cycle") or {}).get("period")
        return {"date": _iso(r["due_date"]), "basis": f"Compliance Register — {r['requirement_name']}" + (f" ({period})" if period else "")}
    tz = get_setting(session, "organization").get("timezone") or "Africa/Kigali"
    scheduled = []
    for i in session.exec(select(Integration).where(Integration.participant_id == participant.id)).all():
        if i.schedule_cron and not i.paused:
            try:
                scheduled += [(run, i) for run in next_runs(i.schedule_cron, now, 1, tz)]
            except ValueError:
                continue
    if scheduled:
        run, i = min(scheduled, key=lambda x: x[0])
        return {"date": run.date().isoformat(), "basis": f"Data source schedule — {i.source_name} ({i.schedule_cron})"}
    start = participant.registration_date or participant.created_at.date()
    if participant.expected_frequency_days:
        due = start + timedelta(days=participant.expected_frequency_days)
        return {"date": due.isoformat(),
                "basis": f"Expected reporting frequency — every {participant.expected_frequency_days} day(s) from registration"}
    return None


def submission_summary(session: Session, participant: Participant, compliance: dict) -> dict:
    subs = session.exec(select(Submission).where(Submission.participant_id == participant.id)).all()
    passed = [s for s in subs if s.result == SubmissionResult.passed]
    first, months = risk.history_of(session, participant.id, datetime.utcnow())
    return {
        "total": len(subs),
        "passed": len(passed),
        "failed_validation": len(subs) - len(passed),
        "records_received": sum(s.records_received for s in subs),
        "error_count": sum(s.error_count for s in subs),
        "first_submission_at": _iso(first),
        "last_submission_at": _iso(max((s.uploaded_at for s in subs), default=None)),
        "months_of_history": round(months, 1),
        "no_data": not subs,
        "message": NO_DATA_MESSAGE if not subs else None,
        "expected_due": expected_due(session, participant, compliance),
    }


# ---- outstanding actions (REQ-P360-008) ---------------------------------------

def _item(kind: str, ref: str, title: str, *, assigned_to: str, owner: str, status: str, due: Optional[date],
          today: date, link: str, detail: str = "", overdue: Optional[bool] = None) -> dict:
    days = (due - today).days if due else None
    return {"kind": kind, "ref": ref, "title": title, "detail": detail, "status": status, "assigned_to": assigned_to,
            "owner": owner, "due_date": _iso(due), "days_until_due": days,
            "overdue": overdue if overdue is not None else bool(days is not None and days < 0), "link": link}


def outstanding_actions(session: Session, participant_id: int, compliance: Optional[dict] = None) -> dict:
    """Pending items assigned to RSwitch or to the institution: compliance
    deadlines the institution owes (or RSwitch must review), documents to
    provide or renew, incidents and remediation actions, governance action
    items the institution owns, and AI alerts still being worked."""
    from app.services import compliance as comp
    from app.services.governance_jobs import effective_status
    from app.services.incidents import action_status, incident_ref

    today = comp.today_for(session)
    compliance = compliance or comp.participant_compliance(session, participant_id)
    participant = session.get(Participant, participant_id)
    institution = participant.name if participant else INSTITUTION
    names = {u.id: (u.full_name or u.email) for u in session.exec(select(User)).all()}
    items: list[dict] = []

    for r in compliance["requirements"]:
        status = r["submission_status"]
        if status == "Approved":
            continue
        period = (r.get("cycle") or {}).get("period") or ""
        label = f"{r['requirement_name']}" + (f" ({period})" if period else "")
        reviewing = r["stage"] in ("Submitted", "Under Review")
        due = r["due_date"] if isinstance(r["due_date"], date) else date.fromisoformat(str(r["due_date"]))
        if reviewing:
            items.append(_item("compliance_review", f"REQ-{r['id']}", f"Review {label}", assigned_to=RSWITCH,
                               owner="Compliance", status=status, due=due, today=today, overdue=status == "Overdue",
                               detail="A file is in hand and awaits RSwitch's decision", link="/compliance?tab=review"))
        else:
            verb = "Send a corrected file for" if status in ("Validation Failed", "Rejected", "Pending Correction") else "Submit"
            if r["kind"] == "Document":
                verb = "Provide"
            items.append(_item("compliance_submission", f"REQ-{r['id']}", f"{verb} {label}", assigned_to=INSTITUTION,
                               owner=institution, status=status, due=due, today=today, overdue=status == "Overdue",
                               detail=r.get("regulatory_reference") or "", link="/compliance?tab=register"))
    for d in compliance["documents"]:
        if d["requirement"] is None and d["expiry_status"] in ("Missing", "Expired", "Expiring Soon"):
            expiry = d["expiry_date"] if isinstance(d["expiry_date"], date) or d["expiry_date"] is None else date.fromisoformat(str(d["expiry_date"]))
            verb = "Provide" if d["expiry_status"] == "Missing" else "Renew"
            items.append(_item("document", f"DOCTYPE-{d['doc_type_id']}", f"{verb} {d['doc_type']}", assigned_to=INSTITUTION,
                               owner=institution, status=d["expiry_status"], due=expiry, today=today,
                               overdue=d["expiry_status"] == "Expired", link="/compliance?tab=documents"))

    incidents = session.exec(select(Issue).where(Issue.participant_id == participant_id)).all()
    open_actions: dict[int, list[RemediationAction]] = {}
    ids = [i.id for i in incidents]
    if ids:
        for a in session.exec(select(RemediationAction).where(RemediationAction.incident_id.in_(ids))).all():
            if action_status(a, today) != "Completed":
                open_actions.setdefault(a.incident_id, []).append(a)
    for inc in incidents:
        ref, status = incident_ref(inc), inc.status.value
        owner = names.get(inc.owner_id, inc.assignee or "Unassigned")
        step = {"Open": "Acknowledge", "Under Investigation": "Investigate", "Resolved": "Close"}.get(status)
        if step and not (status == "Under Investigation" and open_actions.get(inc.id)):
            items.append(_item("incident", ref, f"{step} {ref} — {inc.description[:80]}", assigned_to=RSWITCH,
                               owner=owner if status != "Resolved" else "Compliance", status=status, due=None,
                               today=today, detail=f"{inc.severity.value} severity", link="/compliance?tab=incidents"))
        for a in open_actions.get(inc.id, []):
            items.append(_item("remediation", ref, a.description, assigned_to=RSWITCH, owner=names.get(a.owner_id, "—"),
                               status=action_status(a, today), due=a.due_date, today=today,
                               detail=f"Remediation for {ref}", link="/compliance?tab=incidents"))

    for g in session.exec(select(ActionItem).where(ActionItem.owner_participant_id == participant_id)).all():
        status = effective_status(g, today)
        if status == "Completed":
            continue
        items.append(_item("governance", f"ACT-{g.id}", g.description, assigned_to=INSTITUTION, owner=g.owner or institution,
                           status=status, due=g.due_date, today=today, overdue=status == "Overdue",
                           detail=g.committee or "", link="/governance"))

    for a in session.exec(select(AnomalyAlert).where(AnomalyAlert.participant_id == participant_id,
                                                     AnomalyAlert.status != "Closed")).all():
        step = {"Generated": "Acknowledge", "Acknowledged": "Investigate", "Under Investigation": "Investigate",
                "Escalated": "Senior review of", "Resolved": "Close"}.get(a.status, "Review")
        items.append(_item("ai_alert", f"ALT-{a.id}", f"{step} ALT-{a.id}: {a.indicator}", assigned_to=RSWITCH,
                           owner=a.assignee_name or "Business / Compliance", status=a.status, due=None, today=today,
                           detail=f"{a.severity} — {a.recommended_area}", link="/ai"))

    items.sort(key=lambda i: (not i["overdue"], i["due_date"] is None, i["due_date"] or "", i["kind"], i["ref"]))
    return {
        "items": items,
        "total": len(items),
        "counts": {
            RSWITCH: sum(1 for i in items if i["assigned_to"] == RSWITCH),
            INSTITUTION: sum(1 for i in items if i["assigned_to"] == INSTITUTION),
            "overdue": sum(1 for i in items if i["overdue"]),
            "by_kind": {k: sum(1 for i in items if i["kind"] == k) for k in sorted({i["kind"] for i in items})},
        },
    }


# ---- the profile (§19.2 GET /participants/:id) -----------------------------------

def incidents(session: Session, participant_id: int, viewer: Optional[User]) -> dict:
    """REQ-P360-006: open and resolved incidents, newest first."""
    from app.services.incidents import incident_out

    rows = session.exec(select(Issue).where(Issue.participant_id == participant_id)
                        .order_by(Issue.created_at.desc(), Issue.id.desc())).all()
    out = [incident_out(session, i, viewer) for i in rows]
    return {"open": [i for i in out if i["is_open"]], "resolved": [i for i in out if not i["is_open"]]}


def _overall(participant: Participant, integrations: list[dict], compliance: dict, incident_rows: dict,
             risk_row: Optional[dict], open_alerts: int) -> dict:
    """REQ-P360-002 current overall status: the registered status (§10.1)
    and, alongside it, the facts that need attention — never a made-up
    label without its reasons."""
    reasons = []
    failed = [i["source_name"] for i in integrations if i["status"] == IntegrationStatus.failed]
    if failed:
        reasons.append(f"{len(failed)} data source(s) Failed: {', '.join(failed)}")
    if compliance["summary"]["overdue"]:
        reasons.append(f"{compliance['summary']['overdue']} compliance deadline(s) overdue")
    serious = [i for i in incident_rows["open"] if i["severity"] in (IssueSeverity.critical, IssueSeverity.high)]
    if incident_rows["open"]:
        reasons.append(f"{len(incident_rows['open'])} unresolved incident(s)" + (f", {len(serious)} High/Critical" if serious else ""))
    if open_alerts:
        reasons.append(f"{open_alerts} open AI alert(s)")
    if risk_row and risk_row.get("band") == "High":
        reasons.append(f"High risk score ({risk_row['composite']:g})")
    return {"status": participant.status, "is_active": participant.is_active,
            "health": "Attention needed" if reasons else "No open issues", "attention": reasons}


def profile(session: Session, participant: Participant, viewer: User) -> dict:
    from app.routers.integrations import integration_out
    from app.services import compliance as comp

    compliance = comp.participant_compliance(session, participant.id)
    perf = risk.technical_performance(session, participant.id)
    uptime = {s["integration_id"]: s for s in perf["sources"]}
    integrations = []
    for i in session.exec(select(Integration).where(Integration.participant_id == participant.id).order_by(Integration.source_name)).all():
        row = integration_out(session, i, participant)
        row["uptime_pct_30d"] = uptime.get(i.id, {}).get("uptime_pct")
        integrations.append(row)
    incident_rows = incidents(session, participant.id, viewer)
    risk_row = risk.participant_risk(session, participant.id)
    if risk_row is not None and not has_cap(viewer, "participant360.risk_methodology"):
        risk_row.pop("methodology", None)
    open_alerts = len(session.exec(select(AnomalyAlert.id).where(AnomalyAlert.participant_id == participant.id,
                                                                  AnomalyAlert.status.not_in(("Resolved", "Closed")))).all())
    return {
        **participant.model_dump(),
        "assigned_contact": {"name": participant.primary_contact_name, "email": participant.primary_contact_email},
        "overall": _overall(participant, integrations, compliance, incident_rows, risk_row, open_alerts),
        "integrations": integrations,
        "submissions": submission_summary(session, participant, compliance),
        "compliance": compliance,
        "incidents": incident_rows,
        "technical_performance": perf,
        "outstanding_actions": outstanding_actions(session, participant.id, compliance),
        "risk": risk_row,
        "scope_notice": SCOPE_NOTICE,
    }

