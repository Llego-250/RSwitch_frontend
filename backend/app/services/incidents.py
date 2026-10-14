"""Incident workflow (SRS §6.2, §9.4, REQ-COMP-006/007/010/011, §13).

  Open                    raised by a Compliance user; the assigned owner is
                          notified (incident_created, email + in-app).
  Under Investigation     the assigned owner — any staff role — acknowledged it.
  Remediation In Progress Compliance added remediation action items (owner,
                          due date); each owner marks their own Completed.
  Resolved                Compliance reviewed the remediation (every action
                          item Completed) and recorded a resolution summary.
                          Adding another action item reopens it.
  Closed                  formally closed by Compliance; read-only.

An action item still open after its due date escalates to senior Compliance
users (incident_remediation_overdue, REQ-COMP-011)."""

from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import FORBIDDEN, has_cap
from app.models.enums import IssueSeverity, IssueStatus, UNRESOLVED_INCIDENT_STATUSES, UserRole
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.user import User
from app.services.compliance import Lookups, overdue_remediation, send_each, today_for

OPEN = IssueStatus.open
UNDER_INVESTIGATION = IssueStatus.under_investigation
REMEDIATION = IssueStatus.remediation_in_progress
RESOLVED = IssueStatus.resolved
CLOSED = IssueStatus.closed
STATUSES = [OPEN, UNDER_INVESTIGATION, REMEDIATION, RESOLVED, CLOSED]
SEVERITIES = [IssueSeverity.critical, IssueSeverity.high, IssueSeverity.medium, IssueSeverity.low]
ACTION_OPEN, ACTION_COMPLETED, ACTION_OVERDUE = "Open", "Completed", "Overdue"


def incident_ref(incident: Issue) -> str:
    return f"INC-{incident.id:04d}"


def _name(user: Optional[User]) -> str:
    return (user.full_name or user.email) if user else ""


def can_manage(user: User) -> bool:
    return has_cap(user, "compliance.manage")


def _owner(session: Session, owner_id: Optional[int], field: str = "owner_id") -> Optional[User]:
    if owner_id in (None, "", 0):
        return None
    owner = session.get(User, owner_id)
    if owner is None or not owner.is_active:
        raise validation_error([problem(field, "exists", "Choose an active RSwitch staff member.")])
    return owner


def _severity(value) -> IssueSeverity:
    try:
        return IssueSeverity(value)
    except ValueError:
        raise validation_error([problem("severity", "allowed_values", "Severity must be Low, Medium, High or Critical.")])


def _parse_date(value, field: str) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise validation_error([problem(field, "format", "Use a date like 2026-10-14.")])


def _require_manager(user: User) -> None:
    if not can_manage(user):
        raise HTTPException(status_code=403, detail=FORBIDDEN)


def _not_closed(incident: Issue) -> None:
    if incident.status == CLOSED:
        raise HTTPException(status_code=409, detail=f"{incident_ref(incident)} is Closed; closed incidents are read-only.")


# ---- incidents --------------------------------------------------------------

def create(session: Session, user: User, *, participant_id, description: str, severity, incident_date=None,
           owner_id=None, notes: str = "") -> Issue:
    """§6.2 step 1: logged as Open; the assigned owner is notified."""
    _require_manager(user)
    problems = []
    if not participant_id or session.get(Participant, participant_id) is None:
        problems.append(problem("participant_id", "exists", "Choose the participant institution."))
    if not (description or "").strip():
        problems.append(problem("description", "required", "Describe the incident."))
    when = _parse_date(incident_date, "incident_date")
    if when is None:
        problems.append(problem("incident_date", "required", "Give the date the incident happened."))
    elif when > today_for(session):
        problems.append(problem("incident_date", "past", "The incident date can't be in the future."))
    if problems:
        raise validation_error(problems)
    owner = _owner(session, owner_id)
    incident = Issue(participant_id=participant_id, description=description.strip(), severity=_severity(severity),
                     incident_date=when, status=OPEN, raised_by_id=user.id, owner_id=owner.id if owner else None,
                     assignee=_name(owner), notes=(notes or "").strip())
    session.add(incident)
    session.commit()
    session.refresh(incident)
    if owner:
        notify_owner(session, incident, owner)
    return incident


def update(session: Session, incident: Issue, user: User, data: dict) -> Issue:
    """§19.3 PUT /compliance/incidents/{id}: field edits and status changes.
    Compliance edits, resolves and closes; only the assigned owner
    acknowledges (Open → Under Investigation)."""
    _not_closed(incident)
    data = {k: v for k, v in data.items() if v is not None or k in ("owner_id", "incident_date")}
    target = data.pop("status", None)
    edits = {k: v for k, v in data.items() if k in ("description", "severity", "incident_date", "owner_id", "notes", "resolution_summary")}
    if edits:
        _require_manager(user)
    new_owner = None
    if "description" in edits:
        if not str(edits["description"]).strip():
            raise validation_error([problem("description", "required", "Describe the incident.")])
        incident.description = str(edits["description"]).strip()
    if "severity" in edits:
        incident.severity = _severity(edits["severity"])
    if "incident_date" in edits:
        when = _parse_date(edits["incident_date"], "incident_date")
        if when is None:
            raise validation_error([problem("incident_date", "required", "Give the date the incident happened.")])
        if when > today_for(session):
            raise validation_error([problem("incident_date", "past", "The incident date can't be in the future.")])
        incident.incident_date = when
    if "notes" in edits:
        incident.notes = str(edits["notes"] or "").strip()
    if "resolution_summary" in edits:
        incident.resolution_summary = str(edits["resolution_summary"] or "").strip()
    if "owner_id" in edits and edits["owner_id"] != incident.owner_id:
        owner = _owner(session, edits["owner_id"])
        if owner is None and incident.status != OPEN:
            raise validation_error([problem("owner_id", "required", "An incident under investigation needs an owner.")])
        incident.owner_id = owner.id if owner else None
        incident.assignee = _name(owner)
        new_owner = owner

    if target is not None:
        try:
            target = IssueStatus(target)
        except ValueError:
            raise validation_error([problem("status", "allowed_values",
                                            "Status must be Open, Under Investigation, Remediation In Progress, Resolved or Closed.")])
        if target != incident.status:
            _transition(session, incident, target, user)
    incident.updated_at = datetime.utcnow()
    session.add(incident)
    session.commit()
    session.refresh(incident)
    if new_owner:
        notify_owner(session, incident, new_owner)
    return incident


def _transition(session: Session, incident: Issue, target: IssueStatus, user: User) -> None:
    current = incident.status
    ref = incident_ref(incident)
    now = datetime.utcnow()
    actions = session.exec(select(RemediationAction).where(RemediationAction.incident_id == incident.id)).all()
    if target == UNDER_INVESTIGATION:
        if current != OPEN:
            raise HTTPException(status_code=409, detail=f"{ref} is {current.value}; only an Open incident can be acknowledged.")
        if not incident.owner_id:
            raise HTTPException(status_code=409, detail=f"{ref} has no assigned owner yet; Compliance must assign one first.")
        if user.id != incident.owner_id:
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        incident.acknowledged_at = now
    elif target == REMEDIATION:
        _require_manager(user)
        if current not in (UNDER_INVESTIGATION, RESOLVED) or not any(a.status == ACTION_OPEN for a in actions):
            raise HTTPException(status_code=409, detail=f"{ref} moves to Remediation In Progress when Compliance adds a remediation "
                                                        "action item to an acknowledged incident.")
        incident.resolved_at = None
    elif target == RESOLVED:
        _require_manager(user)
        if current not in (UNDER_INVESTIGATION, REMEDIATION):
            raise HTTPException(status_code=409, detail=f"{ref} is {current.value}; only an incident under investigation or "
                                                        "remediation can be resolved.")
        if any(a.status != ACTION_COMPLETED for a in actions):
            raise HTTPException(status_code=409, detail=f"{ref} still has open remediation action items; their owners must "
                                                        "complete them first.")
        if not incident.resolution_summary.strip():
            raise validation_error([problem("resolution_summary", "required", "Summarise how the incident was resolved.")])
        incident.resolved_at = now
    elif target == CLOSED:
        _require_manager(user)
        if current != RESOLVED:
            raise HTTPException(status_code=409, detail=f"{ref} is {current.value}; resolve it before closing.")
        incident.closed_at = now
    else:  # back to Open
        raise HTTPException(status_code=409, detail=f"{ref} can't go back to Open.")
    incident.status = target


# ---- remediation action items (REQ-COMP-010) --------------------------------

def _action_fields(session: Session, description, owner_id, due_date, *, partial: bool = False) -> dict:
    problems, out = [], {}
    if not partial or description is not None:
        if not str(description or "").strip():
            problems.append(problem("description", "required", "Describe the remediation action."))
        else:
            out["description"] = str(description).strip()
    if not partial or owner_id is not None:
        if not owner_id:
            problems.append(problem("owner_id", "required", "Choose who owns this action."))
        else:
            out["owner"] = _owner(session, owner_id)
    if not partial or due_date is not None:
        when = _parse_date(due_date, "due_date")
        if when is None:
            problems.append(problem("due_date", "required", "Choose a due date."))
        elif when < today_for(session):
            problems.append(problem("due_date", "past", "The due date can't be in the past."))
        else:
            out["due_date"] = when
    if problems:
        raise validation_error(problems)
    return out


def add_action(session: Session, incident: Issue, user: User, *, description, owner_id, due_date) -> RemediationAction:
    """§6.2 step 3. The incident moves to Remediation In Progress (a
    Resolved one is reopened)."""
    _require_manager(user)
    _not_closed(incident)
    if incident.status == OPEN:
        raise HTTPException(status_code=409, detail=f"{incident_ref(incident)} is Open; its assigned owner must acknowledge it "
                                                    "before remediation actions are added.")
    fields = _action_fields(session, description, owner_id, due_date)
    action = RemediationAction(incident_id=incident.id, description=fields["description"], owner_id=fields["owner"].id,
                               due_date=fields["due_date"], created_by=_name(user))
    session.add(action)
    incident.status = REMEDIATION
    incident.resolved_at = None
    incident.updated_at = datetime.utcnow()
    session.add(incident)
    session.commit()
    session.refresh(action)
    return action


def update_action(session: Session, incident: Issue, action: RemediationAction, user: User, data: dict) -> RemediationAction:
    _require_manager(user)
    _not_closed(incident)
    if action.status == ACTION_COMPLETED:
        raise HTTPException(status_code=409, detail="This action item is already Completed.")
    fields = _action_fields(session, data.get("description"), data.get("owner_id"), data.get("due_date"), partial=True)
    if "description" in fields:
        action.description = fields["description"]
    if "owner" in fields:
        action.owner_id = fields["owner"].id
    if "due_date" in fields:
        action.due_date = fields["due_date"]
    session.add(action)
    session.commit()
    session.refresh(action)
    return action


def complete_action(session: Session, incident: Issue, action: RemediationAction, user: User, note: str = "") -> RemediationAction:
    """§6.2 step 4: an action's owner marks it Completed."""
    _not_closed(incident)
    if user.id != action.owner_id:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    if action.status == ACTION_COMPLETED:
        raise HTTPException(status_code=409, detail="This action item is already Completed.")
    action.status = ACTION_COMPLETED
    action.completed_at = datetime.utcnow()
    action.completed_by = _name(user)
    action.completion_note = (note or "").strip()
    session.add(action)
    session.commit()
    session.refresh(action)
    return action


# ---- read models ------------------------------------------------------------

def action_status(action: RemediationAction, today: date) -> str:
    if action.status == ACTION_COMPLETED:
        return ACTION_COMPLETED
    return ACTION_OVERDUE if action.due_date < today else ACTION_OPEN


def _user_ref(user: Optional[User]) -> Optional[dict]:
    if user is None:
        return None
    return {"id": user.id, "name": _name(user), "email": user.email, "role": user.role.value}


def action_out(action: RemediationAction, viewer: Optional[User], lk: Lookups, incident: Issue) -> dict:
    out = action.model_dump()
    out["status"] = action_status(action, lk.today)
    out["days_until_due"] = (action.due_date - lk.today).days
    out["owner"] = _user_ref(lk.user(action.owner_id))
    out["can_complete"] = bool(viewer and viewer.id == action.owner_id and action.status != ACTION_COMPLETED
                               and incident.status != CLOSED)
    return out


def incident_out(session: Session, incident: Issue, viewer: Optional[User], lk: Optional[Lookups] = None) -> dict:
    """The /issues fields (kept for older consumers) plus §10.4 / §14.5
    fields, remediation actions and what the viewer may do next."""
    lk = lk or Lookups(session)
    participant = lk.participant(incident.participant_id)
    actions = session.exec(select(RemediationAction).where(RemediationAction.incident_id == incident.id)
                           .order_by(RemediationAction.due_date, RemediationAction.id)).all()
    rows = [action_out(a, viewer, lk, incident) for a in actions]
    manager = bool(viewer and can_manage(viewer))
    status = incident.status
    out = incident.model_dump()
    out.update({
        "ref": incident_ref(incident),
        "participant_name": participant.name if participant else f"Participant #{incident.participant_id}",
        "participant_code": participant.code if participant else "",
        "raised_at": incident.created_at,
        "raised_by": _user_ref(lk.user(incident.raised_by_id)),
        "owner": _user_ref(lk.user(incident.owner_id)),
        "is_open": status in UNRESOLVED_INCIDENT_STATUSES,
        "actions": rows,
        "action_counts": {
            "total": len(rows),
            "open": sum(1 for r in rows if r["status"] != ACTION_COMPLETED),
            "completed": sum(1 for r in rows if r["status"] == ACTION_COMPLETED),
            "overdue": sum(1 for r in rows if r["status"] == ACTION_OVERDUE),
        },
        "next_action_due": min((r["due_date"] for r in rows if r["status"] != ACTION_COMPLETED), default=None),
        "permissions": {
            "can_edit": manager and status != CLOSED,
            "can_acknowledge": bool(viewer and status == OPEN and incident.owner_id == viewer.id),
            "can_add_actions": manager and status in (UNDER_INVESTIGATION, REMEDIATION, RESOLVED),
            "can_resolve": manager and status in (UNDER_INVESTIGATION, REMEDIATION) and all(r["status"] == ACTION_COMPLETED for r in rows),
            "can_close": manager and status == RESOLVED,
        },
    })
    return out


# ---- notifications ----------------------------------------------------------

def notify_owner(session: Session, incident: Issue, owner: User) -> int:
    """§13 Incident created → assigned owner, email + in-app (also sent when
    an incident is reassigned to a new owner)."""
    participant = session.get(Participant, incident.participant_id)
    pname = participant.name if participant else f"Participant #{incident.participant_id}"
    ref = incident_ref(incident)
    return send_each(
        session, "incident_created", [owner],
        title=f"{ref} assigned to you — {pname} ({incident.severity.value})",
        message=f"{incident.description} Acknowledge it in RDIP to start the investigation.",
        link="/compliance", severity="alert" if incident.severity in (IssueSeverity.critical, IssueSeverity.high) else "warning",
        dedupe_key=f"incident_created:{incident.id}:{owner.id}",
    )


def notify_overdue_remediation(session: Session, today: Optional[date] = None) -> int:
    """§6.2 step 5a / REQ-COMP-011: a remediation action item past its due
    date on an unresolved incident escalates to senior Compliance users,
    once per action and due date."""
    from app.services import notify

    today = today or today_for(session)
    seniors = notify.senior_users(session, UserRole.compliance)
    sent = 0
    for action in overdue_remediation(session, today):
        incident = session.get(Issue, action.incident_id)
        participant = session.get(Participant, incident.participant_id)
        owner = session.get(User, action.owner_id)
        days = (today - action.due_date).days
        sent += send_each(
            session, "incident_remediation_overdue", seniors,
            title=f"Escalation: remediation overdue on {incident_ref(incident)} — {participant.name if participant else ''}".rstrip(" —"),
            message=f"{incident_ref(incident)} ({incident.severity.value}, {incident.status.value}): the action “{action.description}” "
                    f"owned by {_name(owner) or 'an unassigned owner'} was due {action.due_date.isoformat()} and is "
                    f"{days} day{'s' if days != 1 else ''} overdue.",
            link="/compliance", severity="alert",
            dedupe_key=f"incident_remediation_overdue:{action.id}:{action.due_date.isoformat()}",
        )
    return sent
