"""Scheduled governance checks (SRS §6.3 steps 4-5, REQ-GOV-009/010, §13).
run() is called on every scheduler tick (15 min) and is idempotent: status
changes are only made when needed and every notification carries a stable
dedupe key, so a tick never repeats a reminder or an escalation.

The helpers here (org_today, effective_status, owner_recipients, ...) are
shared with routers/governance.py so the API and the scheduler agree on what
"overdue" means."""

from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.governance import ActionItem, GovDocument, GovernanceCommittee, Meeting, WorkingGroup
from app.models.participant import Participant
from app.models.user import User
from app.services import audit, notify
from app.services.settings_store import get_setting

# Names the pre-committee screens used for the same bodies.
_ALIASES = {"board": "Board of Directors", "operations working group": "Operational Working Group"}


def org_zone(session: Session) -> tzinfo:
    """Settings → organization.timezone (Africa/Kigali by default)."""
    name = get_setting(session, "organization").get("timezone") or "UTC"
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def org_today(session: Session) -> date:
    """Due dates are calendar days in the organisation's timezone, not the
    server's."""
    return datetime.now(org_zone(session)).date()


def org_time(session: Session, utc: datetime) -> str:
    """A stored (naive UTC) time as the organisation reads it, for messages."""
    zone = org_zone(session)
    local = utc.replace(tzinfo=timezone.utc).astimezone(zone)
    return f"{local.strftime('%a %d %b %Y, %H:%M')} ({getattr(zone, 'key', 'UTC')})"


def effective_status(item: ActionItem, today: date) -> str:
    """§9.4: Overdue = due date passed without completion. Derived here as
    well as stored by run(), so reads are right between scheduler ticks."""
    if item.status == "Completed":
        return "Completed"
    if item.due_date < today:
        return "Overdue"
    if item.status == "Overdue":  # due date was moved out
        return "In Progress" if item.started_at else "Open"
    return item.status


def reminder_leads(session: Session) -> list[int]:
    """Days-before-due for owner reminders (Settings → reminders), largest first."""
    raw = get_setting(session, "reminders").get("action_item_days_before") or [7, 1]
    return sorted({int(d) for d in raw if int(d) > 0}, reverse=True)


def owner_recipients(session: Session, item: ActionItem) -> list[notify.Recipient]:
    """An RSwitch owner gets in-app + email; an institution owner is emailed
    at its primary contact address (participants never log in)."""
    if item.owner_user_id:
        user = session.get(User, item.owner_user_id)
        return [user] if user else []
    if item.owner_participant_id:
        participant = session.get(Participant, item.owner_participant_id)
        return [participant.primary_contact_email] if participant and participant.primary_contact_email else []
    user = notify.user_by_name_or_email(session, item.owner)
    return [user] if user else []


def dispatch_each(session: Session, event: str, recipients: list[notify.Recipient], **kwargs) -> int:
    """notify.dispatch, one recipient per call. Equivalent (dedupe is per
    recipient and key), but dispatch keeps one user's in-app row pending
    while the next user's email is written through another session, which
    SQLite (one writer at a time) rejects as "database is locked"."""
    delivered, seen = 0, set()
    for recipient in recipients:
        address = recipient.email if isinstance(recipient, User) else str(recipient).strip().lower()
        if address and address not in seen:
            seen.add(address)
            delivered += notify.dispatch(session, event, [recipient], **kwargs)
    return delivered


def committee_chair(session: Session, committee_id: Optional[int]) -> Optional[User]:
    committee = session.get(GovernanceCommittee, committee_id) if committee_id else None
    return session.get(User, committee.chair_id) if committee and committee.chair_id else None


def run(session: Session) -> None:
    backfill_legacy(session)
    today = org_today(session)
    leads = reminder_leads(session)
    for item in session.exec(select(ActionItem).where(ActionItem.status != "Completed")).all():
        if item.due_date < today:
            _escalate_overdue(session, item, today)
        else:
            if item.status == "Overdue":  # due date extended since it went overdue
                item.status = effective_status(item, today)
                session.add(item)
                session.commit()
            _remind_owner(session, item, today, leads)


def _remind_owner(session: Session, item: ActionItem, today: date, leads: list[int]) -> None:
    """REQ-GOV-009: remind the owner N days before the due date. Each lead
    time is sent once; a tick that missed the exact day still sends it while
    the item is inside that window, but an item created after a mark (e.g.
    added 3 days before its due date) skips that mark rather than receiving a
    late "due in 7 days" notice."""
    days_left = (item.due_date - today).days
    windows = [d for d in leads if days_left <= d]
    if not windows:
        return
    lead = min(windows)
    if item.created_at and item.created_at.date() > item.due_date - timedelta(days=lead):
        return
    recipients = owner_recipients(session, item)
    if not recipients:
        return
    when = "today" if days_left == 0 else f"in {days_left} day{'s' if days_left != 1 else ''}"
    committee = _committee_name(session, item)
    dispatch_each(
        session,
        "action_item_due_1d" if lead <= 1 else "action_item_due_7d",
        recipients,
        title=f"Action item due {when}",
        message=f"“{item.description}” ({committee}) is due {when}, on {item.due_date.isoformat()}.",
        link="/governance",
        severity="warning" if lead <= 1 else "info",
        dedupe_key=f"gov-action:{item.id}:due-{lead}d:{item.due_date.isoformat()}",
    )


def _escalate_overdue(session: Session, item: ActionItem, today: date) -> None:
    """§6.3 step 5: status → Overdue, and the committee chair plus the owner
    are notified (§13). Sent once per due date."""
    if item.status != "Overdue":
        item.status = "Overdue"
        item.updated_at = datetime.utcnow()
        session.add(item)
        # Commit before audit/notify write through their own sessions
        # (SQLite allows one writer at a time).
        session.commit()
        audit.record(session, "GOV_ACTION_ITEM_OVERDUE", f"#{item.id} {item.description} (due {item.due_date})")
    chair = committee_chair(session, item.committee_id)
    recipients: list[notify.Recipient] = ([chair] if chair else []) + owner_recipients(session, item)
    if not recipients:
        return
    days = (today - item.due_date).days
    committee = _committee_name(session, item)
    dispatch_each(
        session,
        "action_item_overdue",
        recipients,
        title="Governance action item overdue",
        message=(
            f"“{item.description}” ({committee}), owned by {item.owner}, was due on "
            f"{item.due_date.isoformat()} and is {days} day{'s' if days != 1 else ''} overdue."
        ),
        link="/governance",
        severity="alert",
        dedupe_key=f"gov-action:{item.id}:overdue:{item.due_date.isoformat()}",
    )


def _committee_name(session: Session, item: ActionItem) -> str:
    committee = session.get(GovernanceCommittee, item.committee_id) if item.committee_id else None
    return committee.name if committee else item.committee


# ---- legacy data ---------------------------------------------------------------

def committee_for_name(session: Session, name: str) -> Optional[GovernanceCommittee]:
    """The committee a legacy free-text name refers to, created if missing."""
    name = _ALIASES.get((name or "").strip().lower(), (name or "").strip())
    if not name:
        return None
    committee = session.exec(
        select(GovernanceCommittee).where(func.lower(GovernanceCommittee.name) == name.lower())
    ).first()
    if committee is None:
        committee = GovernanceCommittee(name=name, type=_guess_type(name))
        session.add(committee)
        session.flush()
    return committee


def _guess_type(name: str) -> str:
    lower = name.lower()
    if "board" in lower:
        return "Board"
    if "technical" in lower:
        return "Technical Working Group"
    if "operation" in lower:
        return "Operational Working Group"
    return "Steering Committee"


def backfill_legacy(session: Session) -> None:
    """Link rows written before committees, versions and status existed.
    Idempotent and cheap once done (each query finds nothing)."""
    changed = False
    # The old free-text register becomes committees, once.
    if session.exec(select(GovernanceCommittee.id)).first() is None:
        for group in session.exec(select(WorkingGroup)).all():
            committee = committee_for_name(session, group.name)
            chair = notify.user_by_name_or_email(session, group.chair)
            if chair:
                committee.chair_id = chair.id
            if group.members:
                committee.description = f"Members (legacy register): {group.members}"
            session.add(committee)
            changed = True

    for doc in session.exec(select(GovDocument).where(GovDocument.committee_id == None)).all():  # noqa: E711
        committee = committee_for_name(session, doc.committee)
        doc.committee_id = committee.id if committee else None
        session.add(doc)
        changed = True
    for doc in session.exec(select(GovDocument).where(GovDocument.series_id == None)).all():  # noqa: E711
        doc.series_id = doc.id
        if doc.uploaded_by_id is None:
            uploader = notify.user_by_name_or_email(session, doc.uploaded_by)
            doc.uploaded_by_id = uploader.id if uploader else None
        session.add(doc)
        changed = True

    for meeting in session.exec(select(Meeting).where(Meeting.committee_id == None)).all():  # noqa: E711
        committee = committee_for_name(session, meeting.committee)
        meeting.committee_id = committee.id if committee else None
        if meeting.minutes_document_id:
            minutes = session.get(GovDocument, meeting.minutes_document_id)
            if minutes and minutes.meeting_id is None:
                minutes.meeting_id = meeting.id
                session.add(minutes)
        session.add(meeting)
        changed = True

    for item in session.exec(select(ActionItem).where(ActionItem.committee_id == None)).all():  # noqa: E711
        committee = committee_for_name(session, item.committee)
        item.committee_id = committee.id if committee else None
        if item.owner_user_id is None and item.owner_participant_id is None:
            user = notify.user_by_name_or_email(session, item.owner)
            participant = None if user else session.exec(
                select(Participant).where(func.lower(Participant.name) == item.owner.strip().lower())
            ).first()
            item.owner_user_id = user.id if user else None
            item.owner_participant_id = participant.id if participant else None
        session.add(item)
        changed = True
    for item in session.exec(
        select(ActionItem).where(ActionItem.completed == True, ActionItem.status != "Completed")  # noqa: E712
    ).all():
        item.status = "Completed"
        session.add(item)
        changed = True
    if changed:
        session.commit()
