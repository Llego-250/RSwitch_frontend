"""Compliance Monitoring (SRS §5.8 REQ-COMP-001..009, §6.1, §6.4, §6.5, §8.4,
§9.2, §11.4, §14.1, §15.1, REQ-P360-005).

Lifecycle of a requirement's cycle — `stage` is where the workflow stands,
`status` (§9.2) is what everyone sees:

  Pending            nothing has been sent for this due date yet.
  Submitted          a valid file is in hand (passed validation) and awaits
                     review (§6.1 step 4, §6.4 step 6).
  Under Review       a Compliance user started reviewing it (§6.1 step 6).
  Approved           a submission was accepted (§6.1 step 7). Closes the
                     cycle; a recurring requirement then opens its next cycle
                     with the due date moved on by its frequency (§11.4).
  Validation Failed  the latest attempt failed schema/data-quality checks and
                     nothing valid is in hand (§6.1 4a, §6.4 step 2); the
                     institution has not yet been asked for a fix.
  Rejected           the latest valid attempt was rejected after review (§8.4)
                     and the follow-up hasn't been recorded yet.
  Pending Correction Compliance recorded that it asked the institution
                     (offline, §6.4 step 3 / §13) for a corrected file, and
                     none has arrived. A new upload moves the cycle to
                     Submitted, or back to Validation Failed (§6.4 6a).
  Overdue            the due date has passed and the institution has not
                     delivered an acceptable file in time: nothing valid
                     arrived by the deadline, or what arrived was rejected or
                     failed. It stays Overdue until a submission is approved
                     (§8.4), even while a late file is under review. A valid
                     file received by the deadline is not penalised for
                     RSwitch's review time: that cycle shows Submitted /
                     Under Review until the decision (§6.5 step 4 "deadline
                     passes without submission").

Each submission/document keeps its own status (Submitted, Validation Failed,
Under Review, Approved, Rejected) and earlier attempts are never deleted;
corrections point at the attempt they replace (§6.4)."""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional, Union

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.models.compliance import ComplianceCycle, ComplianceCycleItem, ComplianceRequirement
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import (
    ComplianceFrequency,
    ComplianceKind,
    ComplianceStatus,
    DocumentStatus,
    IssueSeverity,
    SubmissionResult,
    UNRESOLVED_INCIDENT_STATUSES,
    UserRole,
)
from app.models.integration import Integration
from app.models.issue import Issue, RemediationAction
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate
from app.models.user import User

EXPIRING_SOON_WINDOW_DAYS = 60
CALENDAR_DAYS = 90  # REQ-COMP-004
MIN_REJECTION_REASON = 20  # §11.4

PENDING = ComplianceStatus.pending.value
SUBMITTED = ComplianceStatus.submitted.value
VALIDATION_FAILED = ComplianceStatus.validation_failed.value
PENDING_CORRECTION = ComplianceStatus.pending_correction.value
UNDER_REVIEW = ComplianceStatus.under_review.value
APPROVED = ComplianceStatus.approved.value
REJECTED = ComplianceStatus.rejected.value
OVERDUE = ComplianceStatus.overdue.value
STATUSES = [s.value for s in ComplianceStatus]

DATA_RETURN = ComplianceKind.data_return.value
DOCUMENT = ComplianceKind.document.value
KINDS = [k.value for k in ComplianceKind]
FREQUENCIES = [f.value for f in ComplianceFrequency]
FREQUENCY_MONTHS = {"Monthly": 1, "Quarterly": 3, "Annual": 12}  # Ad hoc never recurs

# Stages in which the institution still owes RSwitch a file — the ones
# deadline reminders are about.
OUTSTANDING = (PENDING, VALIDATION_FAILED, REJECTED, PENDING_CORRECTION)
NEEDS_CORRECTION = (VALIDATION_FAILED, REJECTED, PENDING_CORRECTION)
IN_REVIEW = (SUBMITTED, UNDER_REVIEW)


# ---- documents: expiry status (derived, never stored) -----------------------

def document_status(document: ComplianceDocument, today: date | None = None) -> DocumentStatus:
    today = today or date.today()
    if document.expiry_date is None:
        return DocumentStatus.on_file
    days_left = (document.expiry_date - today).days
    if days_left < 0:
        return DocumentStatus.expired
    if days_left <= EXPIRING_SOON_WINDOW_DAYS:
        return DocumentStatus.expiring_soon
    return DocumentStatus.on_file


def roster_status(
    participant_id: int,
    documents: list[ComplianceDocument],
    required_type_ids: list[int],
    today: date | None = None,
) -> list[dict]:
    by_type = {d.doc_type_id: d for d in sorted(documents, key=lambda d: d.uploaded_at) if d.participant_id == participant_id and is_on_file(d)}
    result = []
    for type_id in required_type_ids:
        doc = by_type.get(type_id)
        status = DocumentStatus.missing if doc is None else document_status(doc, today)
        result.append({"doc_type_id": type_id, "document": doc, "status": status})
    return result


def is_on_file(doc: ComplianceDocument) -> bool:
    """Filed outside the register, or approved through it. A document still
    under review or rejected is not on file."""
    return doc.review_status in ("", APPROVED)


# ---- time ------------------------------------------------------------------

def _zone(session: Session):
    from app.services.governance_jobs import org_zone

    return org_zone(session)


def today_for(session: Session) -> date:
    """Due dates are calendar days in the organisation's timezone."""
    from app.services.governance_jobs import org_today

    return org_today(session)


def deadline_utc(due: date, zone) -> datetime:
    """The end of the due day in the organisation's timezone, as naive UTC."""
    local = datetime.combine(due + timedelta(days=1), time.min, tzinfo=zone)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def local_date(value: datetime, zone) -> date:
    return value.replace(tzinfo=timezone.utc).astimezone(zone).date()


# ---- recurrence (§11.4) -----------------------------------------------------

def next_due_date(due: date, frequency: str, anchor_day: Optional[int] = None) -> Optional[date]:
    """The next cycle's due date: the frequency added, landing on the
    anchor day (or the month's last day when shorter). None for Ad hoc."""
    months = FREQUENCY_MONTHS.get(frequency)
    if not months:
        return None
    nxt = due + relativedelta(months=months)
    day = anchor_day or due.day
    return nxt.replace(day=min(day, monthrange(nxt.year, nxt.month)[1]))


def period_label(due: date, frequency: str) -> str:
    """Names a cycle by when it is due: "October 2026", "Q4 2026", "2026",
    or the date itself for Ad hoc."""
    if frequency == "Monthly":
        return due.strftime("%B %Y")
    if frequency == "Quarterly":
        return f"Q{(due.month - 1) // 3 + 1} {due.year}"
    if frequency == "Annual":
        return str(due.year)
    return due.strftime("%d %b %Y").lstrip("0")


# ---- cycle items (submissions and documents alike) --------------------------

ItemObj = Union[Submission, ComplianceDocument]


@dataclass
class Item:
    obj: ItemObj

    @property
    def is_document(self) -> bool:
        return isinstance(self.obj, ComplianceDocument)

    @property
    def status(self) -> str:
        if self.is_document:
            return self.obj.review_status or SUBMITTED
        return self.obj.status

    @property
    def passed(self) -> bool:
        return self.is_document or self.obj.result == SubmissionResult.passed

    @property
    def received_at(self) -> datetime:
        return self.obj.uploaded_at

    @property
    def event_at(self) -> datetime:
        """When the item reached its current state."""
        if self.status in (APPROVED, REJECTED, UNDER_REVIEW) and self.obj.reviewed_at:
            return self.obj.reviewed_at
        return self.obj.uploaded_at

    @property
    def ref(self) -> str:
        return f"{'DOC' if self.is_document else 'SUB'}-{self.obj.id}"


def cycle_items(session: Session, cycle: ComplianceCycle) -> list[Item]:
    links = session.exec(select(ComplianceCycleItem).where(ComplianceCycleItem.cycle_id == cycle.id)).all()
    items: list[Item] = []
    for link in links:
        obj = session.get(Submission, link.submission_id) if link.submission_id else session.get(ComplianceDocument, link.document_id)
        if obj is not None:
            items.append(Item(obj))
    return sorted(items, key=lambda i: (i.received_at, i.obj.id))


def cycle_of(session: Session, obj: ItemObj) -> Optional[ComplianceCycle]:
    column = ComplianceCycleItem.document_id if isinstance(obj, ComplianceDocument) else ComplianceCycleItem.submission_id
    link = session.exec(select(ComplianceCycleItem).where(column == obj.id)).first()
    return session.get(ComplianceCycle, link.cycle_id) if link else None


# ---- cycles -----------------------------------------------------------------

def current_cycle(session: Session, requirement: ComplianceRequirement) -> Optional[ComplianceCycle]:
    return session.exec(
        select(ComplianceCycle).where(ComplianceCycle.requirement_id == requirement.id).order_by(ComplianceCycle.id.desc())
    ).first()


def open_cycle(session: Session, requirement: ComplianceRequirement, due: date) -> ComplianceCycle:
    cycle = ComplianceCycle(requirement_id=requirement.id, due_date=due, period=period_label(due, requirement.frequency))
    session.add(cycle)
    session.flush()
    return cycle


def ensure_cycle(session: Session, requirement: ComplianceRequirement) -> ComplianceCycle:
    """The requirement's current cycle, creating the first one for an entry
    made before cycles existed (adopting any submissions already pointing
    at it)."""
    cycle = current_cycle(session, requirement)
    if cycle is not None:
        return cycle
    cycle = open_cycle(session, requirement, requirement.due_date)
    cycle.opened_at = requirement.created_at
    linked = set(session.exec(select(ComplianceCycleItem.submission_id).where(ComplianceCycleItem.submission_id != None)).all())  # noqa: E711
    for sub in session.exec(select(Submission).where(Submission.requirement_id == requirement.id)).all():
        if sub.id not in linked:
            session.add(ComplianceCycleItem(cycle_id=cycle.id, submission_id=sub.id, linked_at=sub.uploaded_at))
    for doc in session.exec(select(ComplianceDocument).where(ComplianceDocument.requirement_id == requirement.id)).all():
        if cycle_of(session, doc) is None:
            session.add(ComplianceCycleItem(cycle_id=cycle.id, document_id=doc.id, linked_at=doc.uploaded_at))
    session.flush()
    recompute(session, cycle, requirement=requirement)
    return cycle


def status_on(cycle: ComplianceCycle, today: date, zone) -> str:
    """§9.2 status as of `today` from what is stored — right between
    scheduler ticks (the scheduler persists it)."""
    if cycle.stage == APPROVED:
        return APPROVED
    if today <= cycle.due_date:
        return cycle.stage
    if cycle.stage in IN_REVIEW and cycle.submitted_at and cycle.submitted_at < deadline_utc(cycle.due_date, zone):
        return cycle.stage  # received in time; awaiting RSwitch's decision
    return OVERDUE


def recompute(session: Session, cycle: ComplianceCycle, *, today: Optional[date] = None,
              requirement: Optional[ComplianceRequirement] = None) -> str:
    """Derive the cycle's stage and status from its items and mirror it on
    the requirement when it is the current cycle. Doesn't commit."""
    today = today or today_for(session)
    zone = _zone(session)
    items = cycle_items(session, cycle)
    approved = [i for i in items if i.status == APPROVED]
    pending = [i for i in items if i.status in IN_REVIEW and i.passed]
    latest = max(items, key=lambda i: (i.event_at, i.obj.id)) if items else None

    if approved:
        winner = min(approved, key=lambda i: (i.obj.reviewed_at or i.received_at, i.obj.id))
        stage = APPROVED
        cycle.submitted_at = winner.received_at
        cycle.approved_at = winner.obj.reviewed_at or winner.received_at
        cycle.on_time = winner.received_at < deadline_utc(cycle.due_date, zone)
        cycle.approved_submission_id = None if winner.is_document else winner.obj.id
        cycle.approved_document_id = winner.obj.id if winner.is_document else None
        cycle.closed_at = cycle.approved_at
    else:
        cycle.approved_at = cycle.on_time = cycle.closed_at = None
        cycle.approved_submission_id = cycle.approved_document_id = None
        if pending:
            stage = UNDER_REVIEW if any(i.status == UNDER_REVIEW for i in pending) else SUBMITTED
            cycle.submitted_at = min(i.received_at for i in pending)
        else:
            valid = [i for i in items if i.passed]
            cycle.submitted_at = max(i.received_at for i in valid) if valid else None
            if latest is not None and latest.status in (VALIDATION_FAILED, REJECTED):
                asked = cycle.correction_requested_at
                stage = PENDING_CORRECTION if asked and asked >= latest.event_at else latest.status
            else:
                stage = PENDING
    cycle.stage = stage
    rejected_latest = latest is not None and latest.status == REJECTED and stage in (REJECTED, PENDING_CORRECTION)
    cycle.rejection_reason = latest.obj.rejection_reason if rejected_latest else ""
    reviewed = [i for i in items if i.obj.reviewed_at]
    if reviewed:
        last = max(reviewed, key=lambda i: i.obj.reviewed_at)
        cycle.reviewed_by = last.obj.reviewed_by
        cycle.reviewed_by_id = last.obj.reviewed_by_id if last.is_document else _user_id(session, last.obj.reviewed_by)
        cycle.reviewed_at = last.obj.reviewed_at
    cycle.status = status_on(cycle, today, zone)
    if cycle.status == OVERDUE and cycle.overdue_at is None:
        cycle.overdue_at = datetime.utcnow()
    elif today <= cycle.due_date:
        cycle.overdue_at = None  # deadline moved out
    session.add(cycle)

    requirement = requirement or session.get(ComplianceRequirement, cycle.requirement_id)
    current = current_cycle(session, requirement)
    if current is not None and current.id == cycle.id:
        mirror(requirement, cycle)
        session.add(requirement)
    return cycle.status


def _user_id(session: Session, name: str) -> Optional[int]:
    if not name:
        return None
    user = session.exec(select(User).where((User.full_name == name) | (User.email == name))).first()
    return user.id if user else None


def mirror(requirement: ComplianceRequirement, cycle: ComplianceCycle) -> None:
    """§10.3: the requirement row carries its current cycle's state."""
    requirement.due_date = cycle.due_date
    requirement.submission_status = cycle.status
    requirement.submitted_at = cycle.submitted_at
    requirement.reviewed_by = cycle.reviewed_by
    requirement.reviewed_by_id = cycle.reviewed_by_id
    requirement.approved_at = cycle.approved_at
    requirement.rejection_reason = cycle.rejection_reason


def roll_next(session: Session, requirement: ComplianceRequirement, cycle: ComplianceCycle) -> Optional[ComplianceCycle]:
    """§11.4: after the current cycle of a recurring, active requirement is
    approved, open the next one. Idempotent."""
    current = current_cycle(session, requirement)
    if cycle.stage != APPROVED or not requirement.active or current is None or current.id != cycle.id:
        return None
    due = next_due_date(cycle.due_date, requirement.frequency, requirement.anchor_day)
    if due is None:
        return None
    nxt = open_cycle(session, requirement, due)
    recompute(session, nxt, requirement=requirement)
    return nxt


def _cycle_for_new_item(session: Session, requirement: ComplianceRequirement, replaced_cycle: Optional[ComplianceCycle]) -> ComplianceCycle:
    """A correction joins the cycle of the attempt it corrects; anything else
    the current cycle. A delivery for a closed Ad hoc obligation opens a new
    cycle due the day it arrives."""
    if replaced_cycle is not None and replaced_cycle.stage != APPROVED:
        return replaced_cycle
    cycle = ensure_cycle(session, requirement)
    if cycle.stage != APPROVED:
        return cycle
    return roll_next(session, requirement, cycle) or open_cycle(session, requirement, today_for(session))


# ---- the ingestion hook (§6.1 steps 3-4a, §6.4, §6.5 step 3) -----------------

def link_submission(session: Session, submission: Submission) -> Optional[ComplianceCycle]:
    """Attach a newly recorded submission (manual upload, corrected
    re-upload, reprocessed file or automated pull) to its requirement's
    cycle and move the cycle on. Commits."""
    if not submission.requirement_id:
        return None
    cycle = cycle_of(session, submission)
    if cycle is None:
        requirement = session.get(ComplianceRequirement, submission.requirement_id)
        if requirement is None:
            return None
        replaced = session.get(Submission, submission.replaces_submission_id) if submission.replaces_submission_id else None
        cycle = _cycle_for_new_item(session, requirement, cycle_of(session, replaced) if replaced else None)
        adopted = cycle_of(session, submission)  # a first cycle adopts submissions already pointing at it
        if adopted is not None:
            cycle = adopted
        else:
            session.add(ComplianceCycleItem(cycle_id=cycle.id, submission_id=submission.id))
            session.flush()
    recompute(session, cycle)
    session.commit()
    return cycle


def link_document(session: Session, document: ComplianceDocument) -> Optional[ComplianceCycle]:
    """Same as link_submission for a document sent for a Document
    requirement; it then awaits review. Commits."""
    if not document.requirement_id:
        return None
    if not document.review_status:
        document.review_status = SUBMITTED
        session.add(document)
    cycle = cycle_of(session, document)
    if cycle is None:
        requirement = session.get(ComplianceRequirement, document.requirement_id)
        if requirement is None:
            return None
        replaced = session.get(ComplianceDocument, document.replaces_document_id) if document.replaces_document_id else None
        cycle = _cycle_for_new_item(session, requirement, cycle_of(session, replaced) if replaced else None)
        adopted = cycle_of(session, document)
        if adopted is not None:
            cycle = adopted
        else:
            session.add(ComplianceCycleItem(cycle_id=cycle.id, document_id=document.id))
            session.flush()
    recompute(session, cycle)
    session.commit()
    return cycle


def document_requirement(session: Session, participant_id: int, doc_type_id: int) -> Optional[ComplianceRequirement]:
    return session.exec(
        select(ComplianceRequirement).where(
            ComplianceRequirement.participant_id == participant_id,
            ComplianceRequirement.kind == DOCUMENT,
            ComplianceRequirement.doc_type_id == doc_type_id,
            ComplianceRequirement.active == True,  # noqa: E712
        ).order_by(ComplianceRequirement.id)
    ).first()


# ---- review (§6.1 steps 6-7, §8.4, §11.4) ------------------------------------

REVIEW_DECISIONS = (UNDER_REVIEW, APPROVED, REJECTED)


def review(session: Session, obj: ItemObj, decision: str, user: User, *, notes: str = "",
           rejection_reason: str = "") -> Optional[ComplianceCycle]:
    """Start a review (Submitted → Under Review), then approve or reject it
    (Under Review → Approved | Rejected). Only a valid (passed) submission
    can be reviewed; a rejection needs a reason of at least 20 characters.
    Approving closes the cycle and opens the next one of a recurring
    requirement. Notifies Compliance users per §13. Commits."""
    item = Item(obj)
    if decision not in REVIEW_DECISIONS:
        raise validation_error([problem("decision", "allowed_values", "Decision must be Under Review, Approved or Rejected.")])
    if not item.passed:
        raise validation_error([problem("decision", "status", "Only submissions that passed validation can be reviewed. "
                                        "Ask the institution for a corrected file instead.")])
    current = item.status
    if decision == UNDER_REVIEW and current != SUBMITTED:
        raise HTTPException(status_code=409, detail=f"{item.ref} is {current}; only a Submitted file can be taken into review.")
    if decision in (APPROVED, REJECTED) and current != UNDER_REVIEW:
        hint = " Start the review first." if current == SUBMITTED else ""
        raise HTTPException(status_code=409, detail=f"{item.ref} is {current}; only a file Under Review can be approved or rejected.{hint}")
    reason = (rejection_reason or "").strip()
    if decision == REJECTED and len(reason) < MIN_REJECTION_REASON:
        raise validation_error([problem("rejection_reason", "min_length",
                                        f"Give a rejection reason of at least {MIN_REJECTION_REASON} characters.")])

    now = datetime.utcnow()
    name = user.full_name or user.email
    if item.is_document:
        obj.review_status = decision
        obj.reviewed_by_id = user.id
    else:
        obj.status = decision
        obj.review_status = {UNDER_REVIEW: "Pending Review", APPROVED: "Approved", REJECTED: "Rejected"}[decision]
    if notes.strip() or decision != UNDER_REVIEW:
        obj.review_note = notes.strip()
    obj.rejection_reason = reason if decision == REJECTED else ""
    obj.reviewed_by = name
    obj.reviewed_at = now
    session.add(obj)
    session.flush()

    cycle = cycle_of(session, obj)
    if cycle is not None:
        was_open = cycle.stage != APPROVED
        recompute(session, cycle)
        if was_open and cycle.stage == APPROVED:
            requirement = session.get(ComplianceRequirement, cycle.requirement_id)
            roll_next(session, requirement, cycle)
    session.commit()
    if decision in (APPROVED, REJECTED):
        _notify_decision(session, obj, decision, cycle, user)
    return cycle


def _notify_decision(session: Session, obj: ItemObj, decision: str, cycle: Optional[ComplianceCycle], reviewer: User) -> None:
    """§13: approvals and rejections go to Compliance users in-app; on a
    rejection they follow up with the institution offline (participants
    are never emailed about it)."""
    from app.services import notify

    item = Item(obj)
    participant = session.get(Participant, obj.participant_id)
    requirement = session.get(ComplianceRequirement, cycle.requirement_id) if cycle else None
    what = f"{requirement.requirement_name} ({cycle.period})" if requirement and cycle else (getattr(obj, "period", "") or obj.filename)
    pname = participant.name if participant else f"Participant #{obj.participant_id}"
    by = reviewer.full_name or reviewer.email
    if decision == APPROVED:
        late = cycle is not None and cycle.on_time is False
        send_each(session, "submission_approved", notify.users_with_roles(session, UserRole.compliance),
                  title=f"Submission approved — {pname}",
                  message=f"{by} approved {item.ref} for {what}." + (" It was received after the due date." if late else ""),
                  link="/compliance", severity="info", dedupe_key=f"submission_approved:{item.ref}")
    else:
        send_each(session, "submission_rejected", notify.users_with_roles(session, UserRole.compliance),
                  title=f"Submission rejected — follow up with {pname}",
                  message=f"{by} rejected {item.ref} for {what}: {obj.rejection_reason} "
                          "Contact the institution offline for a corrected file.",
                  link="/compliance", severity="warning",
                  dedupe_key=f"submission_rejected:{item.ref}:{obj.reviewed_at:%Y%m%d%H%M%S}")


def request_correction(session: Session, cycle: ComplianceCycle, user: User, note: str = "") -> ComplianceCycle:
    """§6.4 step 3: record that the institution was asked (offline) for a
    corrected file → Pending Correction. Commits."""
    if cycle.stage not in (VALIDATION_FAILED, REJECTED):
        raise HTTPException(status_code=409, detail=f"This cycle is {cycle.stage}; a correction can only be requested "
                                                    "after a file failed validation or was rejected.")
    cycle.correction_requested_at = datetime.utcnow()
    cycle.correction_requested_by = user.full_name or user.email
    cycle.correction_note = note.strip()
    recompute(session, cycle)
    session.commit()
    return cycle


def send_each(session: Session, event: str, recipients: Iterable, **kwargs) -> int:
    """notify.dispatch one recipient at a time (SQLite allows one writer;
    see governance_jobs.dispatch_each)."""
    from app.services import notify

    delivered, seen = 0, set()
    for recipient in recipients:
        address = recipient.email if isinstance(recipient, User) else str(recipient).strip().lower()
        if address and address not in seen:
            seen.add(address)
            delivered += notify.dispatch(session, event, [recipient], **kwargs)
    return delivered


# ---- register maintenance (§11.4) -------------------------------------------

def check_due_date(due: Optional[date], today: date, field: str = "due_date") -> list[dict]:
    if due is None:
        return [problem(field, "required", "Choose a due date.")]
    if due <= today:
        return [problem(field, "future", "The due date must be in the future.")]
    return []


def set_due_date(session: Session, requirement: ComplianceRequirement, due: date) -> ComplianceCycle:
    """Move the current cycle's deadline; on a closed (approved) cycle this
    schedules the next delivery instead. The new day becomes the anchor for
    later cycles. Doesn't commit."""
    requirement.anchor_day = due.day
    cycle = ensure_cycle(session, requirement)
    if cycle.stage == APPROVED:
        cycle = open_cycle(session, requirement, due)
    else:
        cycle.due_date = due
        cycle.period = period_label(due, requirement.frequency)
        cycle.overdue_at = None  # set again by recompute if still overdue
    recompute(session, cycle, requirement=requirement)
    return cycle


# ---- lookups and serializers ------------------------------------------------

class Lookups:
    """Small caches so list endpoints don't query per row."""

    def __init__(self, session: Session):
        self.session = session
        self.today = today_for(session)
        self.zone = _zone(session)
        self._participants: dict[int, Optional[Participant]] = {}
        self._templates: dict[int, Optional[IngestionTemplate]] = {}
        self._doc_types: dict[int, Optional[RequiredDocumentType]] = {}
        self._users: dict[int, Optional[User]] = {}

    def participant(self, pid: int) -> Optional[Participant]:
        if pid not in self._participants:
            self._participants[pid] = self.session.get(Participant, pid)
        return self._participants[pid]

    def template(self, tid: Optional[int]) -> Optional[IngestionTemplate]:
        if not tid:
            return None
        if tid not in self._templates:
            self._templates[tid] = self.session.get(IngestionTemplate, tid)
        return self._templates[tid]

    def doc_type(self, did: Optional[int]) -> Optional[RequiredDocumentType]:
        if not did:
            return None
        if did not in self._doc_types:
            self._doc_types[did] = self.session.get(RequiredDocumentType, did)
        return self._doc_types[did]

    def user(self, uid: Optional[int]) -> Optional[User]:
        if not uid:
            return None
        if uid not in self._users:
            self._users[uid] = self.session.get(User, uid)
        return self._users[uid]


def _participant_ref(p: Optional[Participant], pid: int) -> dict:
    return {
        "participant_id": pid,
        "participant_name": p.name if p else f"Participant #{pid}",
        "participant_code": p.code if p else "",
        "institution_type": p.type if p else "",
    }


def item_out(obj: ItemObj, *, with_report: bool = False, session: Optional[Session] = None) -> dict:
    """One submission or document sent for a cycle. with_report adds the
    §20.2 error/warning report of a submission."""
    item = Item(obj)
    out = {
        "kind": "document" if item.is_document else "submission",
        "id": obj.id,
        "ref": item.ref,
        "filename": obj.filename,
        "uploaded_at": obj.uploaded_at,
        "uploaded_by": obj.uploaded_by,
        "status": item.status,
        "rejection_reason": obj.rejection_reason,
        "review_note": obj.review_note,
        "reviewed_by": obj.reviewed_by,
        "reviewed_at": obj.reviewed_at,
    }
    if item.is_document:
        out.update({"period": "", "result": "Passed", "error_count": 0, "warning_count": 0, "records_received": None,
                    "expiry_date": obj.expiry_date, "doc_type_id": obj.doc_type_id,
                    "replaces_id": obj.replaces_document_id, "automated": False})
    else:
        out.update({"period": obj.period, "result": getattr(obj.result, "value", obj.result), "error_count": obj.error_count,
                    "warning_count": obj.warning_count, "records_received": obj.records_received,
                    "replaces_id": obj.replaces_submission_id, "automated": obj.uploaded_by == "Automated API sync"})
        if with_report:
            out["errors"] = _report(obj.errors)
            out["warnings"] = _report(obj.warnings)
    if session is not None:
        column = ComplianceDocument.replaces_document_id if item.is_document else Submission.replaces_submission_id
        model = ComplianceDocument if item.is_document else Submission
        out["replaced_by_id"] = session.exec(select(model.id).where(column == obj.id)).first()
    return out


def _report(entries: list) -> list[dict]:
    return [{"row": e.get("row", 0), "column": e.get("column", e.get("field", "")), "rule": e.get("rule", ""),
             "description": e.get("description", e.get("error", ""))} for e in (entries or [])]


def correction_chain(session: Session, obj: ItemObj) -> list[dict]:
    """The earlier attempts this one corrects, newest first (§6.4 history),
    each with its error report or rejection reason."""
    chain, seen = [], {obj.id}
    model = ComplianceDocument if isinstance(obj, ComplianceDocument) else Submission
    attr = "replaces_document_id" if model is ComplianceDocument else "replaces_submission_id"
    previous_id = getattr(obj, attr)
    while previous_id and previous_id not in seen:
        previous = session.get(model, previous_id)
        if previous is None:
            break
        seen.add(previous.id)
        chain.append(item_out(previous, with_report=True))
        previous_id = getattr(previous, attr)
    return chain


def cycle_out(session: Session, cycle: ComplianceCycle, lk: Lookups, *, with_items: bool = False) -> dict:
    out = cycle.model_dump()
    out["status"] = status_on(cycle, lk.today, lk.zone)
    out["days_until_due"] = (cycle.due_date - lk.today).days
    if with_items:
        out["items"] = [item_out(i.obj, with_report=True, session=session) for i in cycle_items(session, cycle)]
    return out


def requirement_out(session: Session, requirement: ComplianceRequirement, lk: Lookups, *,
                    cycle: Optional[ComplianceCycle] = None) -> dict:
    """A register row (REQ-COMP-002) with its current cycle."""
    cycle = cycle or current_cycle(session, requirement)
    template = lk.template(requirement.template_id)
    doc_type = lk.doc_type(requirement.doc_type_id)
    out = requirement.model_dump()
    out.update(_participant_ref(lk.participant(requirement.participant_id), requirement.participant_id))
    out.update({
        "template_name": f"{template.name} v{template.version}" if template else None,
        "doc_type_name": doc_type.name if doc_type else None,
        "cycle": cycle_out(session, cycle, lk) if cycle else None,
        "latest_item": None,
    })
    if cycle is not None:
        out["submission_status"] = status_on(cycle, lk.today, lk.zone)
        out["stage"] = cycle.stage
        out["due_date"] = cycle.due_date
        out["days_until_due"] = (cycle.due_date - lk.today).days
        items = cycle_items(session, cycle)
        if items:
            out["latest_item"] = item_out(items[-1].obj)
        out["attempts"] = len(items)
    else:
        out["stage"] = requirement.submission_status
        out["days_until_due"] = (requirement.due_date - lk.today).days
        out["attempts"] = 0
    return out


def requirement_detail(session: Session, requirement: ComplianceRequirement) -> dict:
    """The register row plus every cycle (newest first) with its items —
    the per-cycle history §11.4 / REQ-COMP-009 call for."""
    lk = Lookups(session)
    cycles = session.exec(
        select(ComplianceCycle).where(ComplianceCycle.requirement_id == requirement.id).order_by(ComplianceCycle.id.desc())
    ).all()
    out = requirement_out(session, requirement, lk, cycle=cycles[0] if cycles else None)
    out["cycles"] = [cycle_out(session, c, lk, with_items=True) for c in cycles]
    return out


# ---- calendar (REQ-COMP-004/005) --------------------------------------------

def deadlines(session: Session, start: date, end: date, *, participant_id: Optional[int] = None,
              include_projected: bool = True, lk: Optional[Lookups] = None) -> list[dict]:
    """Every deadline of an active requirement due in [start, end]: open and
    closed cycles, plus — for recurring requirements — the later due dates
    their frequency already fixes (projected; those cycles open when the
    one before is approved)."""
    lk = lk or Lookups(session)
    query = select(ComplianceRequirement).where(ComplianceRequirement.active == True)  # noqa: E712
    if participant_id is not None:
        query = query.where(ComplianceRequirement.participant_id == participant_id)
    rows = []
    for req in session.exec(query).all():
        cycles = session.exec(select(ComplianceCycle).where(ComplianceCycle.requirement_id == req.id).order_by(ComplianceCycle.id)).all()
        base = _participant_ref(lk.participant(req.participant_id), req.participant_id)

        def row(due: date, cycle: Optional[ComplianceCycle]) -> dict:
            status = status_on(cycle, lk.today, lk.zone) if cycle else PENDING
            return {**base, "key": f"{req.id}:{cycle.id if cycle else due.isoformat()}", "requirement_id": req.id,
                    "cycle_id": cycle.id if cycle else None, "requirement_name": req.requirement_name,
                    "regulatory_reference": req.regulatory_reference, "kind": req.kind, "frequency": req.frequency,
                    "period": cycle.period if cycle else period_label(due, req.frequency), "due_date": due,
                    "days_until_due": (due - lk.today).days, "status": status,
                    "stage": cycle.stage if cycle else PENDING, "projected": cycle is None}

        for cycle in cycles:
            if start <= cycle.due_date <= end:
                rows.append(row(cycle.due_date, cycle))
        if include_projected and cycles:
            due = cycles[-1].due_date
            for _ in range(60):
                due = next_due_date(due, req.frequency, req.anchor_day)
                if due is None or due > end:
                    break
                if due >= start:
                    rows.append(row(due, None))
    return sorted(rows, key=lambda r: (r["due_date"], r["participant_name"], r["requirement_name"]))


def overdue_rows(session: Session, *, participant_id: Optional[int] = None, lk: Optional[Lookups] = None) -> list[dict]:
    """Every Overdue cycle of an active requirement, whatever its date — the
    red list (REQ-COMP-005)."""
    lk = lk or Lookups(session)
    query = select(ComplianceCycle, ComplianceRequirement).where(
        ComplianceCycle.requirement_id == ComplianceRequirement.id,
        ComplianceRequirement.active == True,  # noqa: E712
        ComplianceCycle.stage != APPROVED,
        ComplianceCycle.due_date < lk.today,
    )
    if participant_id is not None:
        query = query.where(ComplianceRequirement.participant_id == participant_id)
    rows = []
    for cycle, req in session.exec(query).all():
        if status_on(cycle, lk.today, lk.zone) != OVERDUE:
            continue
        rows.append({**_participant_ref(lk.participant(req.participant_id), req.participant_id),
                     "key": f"{req.id}:{cycle.id}", "requirement_id": req.id, "cycle_id": cycle.id,
                     "requirement_name": req.requirement_name, "regulatory_reference": req.regulatory_reference,
                     "kind": req.kind, "frequency": req.frequency, "period": cycle.period, "due_date": cycle.due_date,
                     "days_until_due": (cycle.due_date - lk.today).days, "status": OVERDUE, "stage": cycle.stage,
                     "projected": False})
    return sorted(rows, key=lambda r: (r["due_date"], r["participant_name"]))


# ---- documents roster (REQ-COMP-001, REQ-P360-005) ---------------------------

def document_out(doc: ComplianceDocument, today: date) -> dict:
    out = doc.model_dump(exclude={"storage_key"})
    out["expiry_status"] = document_status(doc, today).value
    out["ref"] = f"DOC-{doc.id}"
    return out


def document_rows(session: Session, participant_id: Optional[int] = None, lk: Optional[Lookups] = None) -> list[dict]:
    """One row per participant × required document type: the document on
    file and its expiry status, anything awaiting review, and the register
    entry that tracks it (None when the type isn't in the register yet)."""
    lk = lk or Lookups(session)
    participants = session.exec(select(Participant).order_by(Participant.name)).all()
    if participant_id is not None:
        participants = [p for p in participants if p.id == participant_id]
    doc_types = session.exec(select(RequiredDocumentType).order_by(RequiredDocumentType.name)).all()
    docs = session.exec(select(ComplianceDocument).order_by(ComplianceDocument.uploaded_at, ComplianceDocument.id)).all()
    requirements = session.exec(select(ComplianceRequirement).where(ComplianceRequirement.kind == DOCUMENT,
                                                                    ComplianceRequirement.active == True)).all()  # noqa: E712
    rows = []
    for p in participants:
        for t in doc_types:
            mine = [d for d in docs if d.participant_id == p.id and d.doc_type_id == t.id]
            on_file = [d for d in mine if is_on_file(d)]
            current = on_file[-1] if on_file else None
            latest = mine[-1] if mine else None
            req = next((r for r in requirements if r.participant_id == p.id and r.doc_type_id == t.id), None)
            cycle = current_cycle(session, req) if req else None
            rows.append({
                **_participant_ref(p, p.id),
                "doc_type_id": t.id,
                "doc_type": t.name,
                "renewal_months": t.renewal_months,
                "expiry_status": (document_status(current, lk.today) if current else DocumentStatus.missing).value,
                "expiry_date": current.expiry_date if current else None,
                "document": document_out(current, lk.today) if current else None,
                "latest_upload": document_out(latest, lk.today) if latest and latest is not current else None,
                "requirement": {
                    "id": req.id, "requirement_name": req.requirement_name, "frequency": req.frequency,
                    "due_date": cycle.due_date if cycle else req.due_date,
                    "status": status_on(cycle, lk.today, lk.zone) if cycle else req.submission_status,
                } if req else None,
            })
    return rows


# ---- service contract for Participant 360, Reports and Dashboard -------------

def participant_compliance(session: Session, participant_id: int) -> dict:
    """REQ-P360-005 Compliance Status for one participant.

    Returns {
      participant: {participant_id, participant_name, participant_code, institution_type},
      summary: {requirements, approved, pending, in_review, needs_correction, overdue},
      requirements: [register row — see requirement_out: id, requirement_name,
                     regulatory_reference, kind, frequency, due_date,
                     submission_status (§9.2), stage, days_until_due, cycle{...},
                     latest_item{...}, template_name, doc_type_name, ...],
      upcoming_deadlines: [deadline rows due in the next 90 days and not yet
                           approved — see deadlines()],
      overdue: [deadline rows with status Overdue],
      documents: [document_rows() for this participant],
    }"""
    lk = Lookups(session)
    participant = lk.participant(participant_id)
    requirements = session.exec(
        select(ComplianceRequirement).where(ComplianceRequirement.participant_id == participant_id,
                                            ComplianceRequirement.active == True)  # noqa: E712
        .order_by(ComplianceRequirement.due_date)
    ).all()
    rows = [requirement_out(session, r, lk) for r in requirements]
    statuses = [r["submission_status"] for r in rows]
    upcoming = [d for d in deadlines(session, lk.today, lk.today + timedelta(days=CALENDAR_DAYS), participant_id=participant_id, lk=lk)
                if d["status"] != APPROVED]
    return {
        "participant": _participant_ref(participant, participant_id),
        "summary": {
            "requirements": len(rows),
            "approved": statuses.count(APPROVED),
            "pending": statuses.count(PENDING),
            "in_review": sum(statuses.count(s) for s in IN_REVIEW),
            "needs_correction": sum(statuses.count(s) for s in NEEDS_CORRECTION),
            "overdue": statuses.count(OVERDUE),
        },
        "requirements": rows,
        "upcoming_deadlines": upcoming,
        "overdue": overdue_rows(session, participant_id=participant_id, lk=lk),
        "documents": document_rows(session, participant_id, lk),
    }


def _window_start(today: date, months: int) -> date:
    return today - relativedelta(months=months)


def failure_rate(session: Session, participant_id: int, months: int = 12) -> dict:
    """REQ-COMP-008: share of a participant's submissions over the rolling
    window that failed validation (contained errors) or were rejected after
    review. Counts every data submission (uploads, corrections, automated
    pulls) and every document sent for the register.

    Returns {rate_pct (None when nothing was submitted), total,
    failed_or_rejected, validation_failed, rejected, window_start, months}."""
    today = today_for(session)
    start = _window_start(today, months)
    since = datetime.combine(start, time.min)
    subs = session.exec(select(Submission).where(Submission.participant_id == participant_id, Submission.uploaded_at >= since)).all()
    docs = session.exec(select(ComplianceDocument).where(ComplianceDocument.participant_id == participant_id,
                                                         ComplianceDocument.uploaded_at >= since,
                                                         ComplianceDocument.review_status != "")).all()
    failed = sum(1 for s in subs if s.result == SubmissionResult.failed)
    rejected = sum(1 for s in subs if s.result != SubmissionResult.failed and s.status == REJECTED)
    rejected += sum(1 for d in docs if d.review_status == REJECTED)
    total = len(subs) + len(docs)
    bad = failed + rejected
    return {"rate_pct": round(bad / total * 100, 1) if total else None, "total": total, "failed_or_rejected": bad,
            "validation_failed": failed, "rejected": rejected, "window_start": start, "months": months}


def _adherence(cycles: list[ComplianceCycle]) -> tuple[int, int]:
    on_time = sum(1 for c in cycles if c.stage == APPROVED and c.on_time)
    return on_time, len(cycles)


def adherence_rate(session: Session, participant_id: int, months: int = 12) -> dict:
    """Deadline adherence: of the participant's cycles whose due date passed
    in the window, the share approved with a file received by the due date
    (approved on time). A cycle still awaiting review counts once approved.

    Returns {rate_pct (None when no deadline fell due), on_time, total,
    window_start, months}."""
    today = today_for(session)
    start = _window_start(today, months)
    cycles = session.exec(
        select(ComplianceCycle).join(ComplianceRequirement, ComplianceCycle.requirement_id == ComplianceRequirement.id).where(
            ComplianceRequirement.participant_id == participant_id, ComplianceCycle.due_date >= start, ComplianceCycle.due_date < today)
    ).all()
    on_time, total = _adherence(list(cycles))
    return {"rate_pct": round(on_time / total * 100, 1) if total else None, "on_time": on_time, "total": total,
            "window_start": start, "months": months}


def _events(session: Session, participant_id: Optional[int] = None, *, register_only: bool = False) -> list[dict]:
    """Compliance events, oldest first: every submission and document sent
    and how it was reviewed, correction requests, missed deadlines,
    incidents and their remediation."""
    lk = Lookups(session)
    requirements = {r.id: r for r in session.exec(select(ComplianceRequirement)).all()}
    links = session.exec(select(ComplianceCycleItem)).all()
    cycle_by_sub = {l.submission_id: l.cycle_id for l in links if l.submission_id}
    cycle_by_doc = {l.document_id: l.cycle_id for l in links if l.document_id}
    cycles = {c.id: c for c in session.exec(select(ComplianceCycle)).all()}
    events: list[dict] = []

    def add(at, type_, title, detail="", status="", pid=None, **refs):
        if at is None:
            return
        if isinstance(at, date) and not isinstance(at, datetime):
            at = datetime.combine(at, time.min)
        p = lk.participant(pid)
        events.append({"at": at, "type": type_, "title": title, "detail": detail, "status": status,
                       **_participant_ref(p, pid), **{k: refs.get(k) for k in (
                           "requirement_id", "requirement_name", "cycle_id", "period", "submission_id",
                           "document_id", "incident_id", "replaces_id")}})

    def where(cycle_id, fallback_requirement_id=None):
        cycle = cycles.get(cycle_id)
        req = requirements.get(cycle.requirement_id if cycle else fallback_requirement_id)
        return {"requirement_id": req.id if req else None, "requirement_name": req.requirement_name if req else None,
                "cycle_id": cycle.id if cycle else None, "period": cycle.period if cycle else None}

    sub_query = select(Submission)
    if participant_id is not None:
        sub_query = sub_query.where(Submission.participant_id == participant_id)
    if register_only:
        sub_query = sub_query.where(Submission.requirement_id != None)  # noqa: E711
    for s in session.exec(sub_query).all():
        ctx = where(cycle_by_sub.get(s.id), s.requirement_id)
        label = ctx["requirement_name"] or "Data transfer"
        failed = s.result == SubmissionResult.failed
        fix = f" — corrects SUB-{s.replaces_submission_id}" if s.replaces_submission_id else ""
        add(s.uploaded_at, "submission_validation_failed" if failed else "submission_received",
            f"SUB-{s.id} {'failed validation' if failed else 'received'} — {label}{fix}",
            f"{s.period} · {s.filename} · {s.records_received} record(s), {s.error_count} error(s)" + (f" · by {s.uploaded_by}" if s.uploaded_by else ""),
            VALIDATION_FAILED if failed else SUBMITTED, s.participant_id, submission_id=s.id, replaces_id=s.replaces_submission_id, **ctx)
        if s.reviewed_at and s.status in (APPROVED, REJECTED, UNDER_REVIEW):
            verb = {APPROVED: "approved", REJECTED: "rejected", UNDER_REVIEW: "taken into review"}[s.status]
            add(s.reviewed_at, f"submission_{s.status.lower().replace(' ', '_')}", f"SUB-{s.id} {verb} by {s.reviewed_by or 'Compliance'} — {label}",
                s.rejection_reason if s.status == REJECTED else s.review_note, s.status, s.participant_id, submission_id=s.id, **ctx)

    doc_query = select(ComplianceDocument).where(ComplianceDocument.review_status != "") if register_only else select(ComplianceDocument)
    if participant_id is not None:
        doc_query = doc_query.where(ComplianceDocument.participant_id == participant_id)
    for d in session.exec(doc_query).all():
        ctx = where(cycle_by_doc.get(d.id), d.requirement_id)
        doc_type = lk.doc_type(d.doc_type_id)
        label = ctx["requirement_name"] or (doc_type.name if doc_type else "Document")
        add(d.uploaded_at, "document_received", f"DOC-{d.id} received — {label}",
            d.filename + (f" · expires {d.expiry_date}" if d.expiry_date else ""), d.review_status or "On File",
            d.participant_id, document_id=d.id, replaces_id=d.replaces_document_id, **ctx)
        if d.reviewed_at and d.review_status in (APPROVED, REJECTED, UNDER_REVIEW):
            verb = {APPROVED: "approved", REJECTED: "rejected", UNDER_REVIEW: "taken into review"}[d.review_status]
            add(d.reviewed_at, f"document_{d.review_status.lower().replace(' ', '_')}", f"DOC-{d.id} {verb} by {d.reviewed_by or 'Compliance'} — {label}",
                d.rejection_reason if d.review_status == REJECTED else d.review_note, d.review_status, d.participant_id, document_id=d.id, **ctx)

    for cycle in cycles.values():
        req = requirements.get(cycle.requirement_id)
        if req is None or (participant_id is not None and req.participant_id != participant_id):
            continue
        ctx = where(cycle.id)
        if cycle.correction_requested_at:
            add(cycle.correction_requested_at, "correction_requested", f"Corrected file requested — {req.requirement_name} ({cycle.period})",
                cycle.correction_note or f"Requested by {cycle.correction_requested_by}", PENDING_CORRECTION, req.participant_id, **ctx)
        missed = cycle.due_date < lk.today and (cycle.stage != APPROVED or cycle.on_time is False)
        if missed and (cycle.overdue_at or status_on(cycle, lk.today, lk.zone) == OVERDUE or cycle.on_time is False):
            add(cycle.due_date + timedelta(days=1), "deadline_missed", f"Deadline missed — {req.requirement_name} ({cycle.period})",
                f"Due {cycle.due_date.isoformat()} without an approved submission", OVERDUE, req.participant_id, **ctx)

    from app.services.incidents import incident_ref

    inc_query = select(Issue)
    if participant_id is not None:
        inc_query = inc_query.where(Issue.participant_id == participant_id)
    incidents = session.exec(inc_query).all()
    for inc in incidents:
        ref, sev = incident_ref(inc), inc.severity.value
        add(inc.created_at, "incident_raised", f"{ref} raised ({sev}) — {inc.description[:80]}", "", "Open", inc.participant_id, incident_id=inc.id)
        if inc.acknowledged_at:
            add(inc.acknowledged_at, "incident_acknowledged", f"{ref} acknowledged by {inc.assignee or 'the owner'}", "", "Under Investigation",
                inc.participant_id, incident_id=inc.id)
        if inc.resolved_at:
            add(inc.resolved_at, "incident_resolved", f"{ref} resolved", inc.resolution_summary, "Resolved", inc.participant_id, incident_id=inc.id)
        if inc.closed_at:
            add(inc.closed_at, "incident_closed", f"{ref} closed", inc.resolution_summary, "Closed", inc.participant_id, incident_id=inc.id)
    by_incident = {i.id: i for i in incidents}
    if by_incident:
        for action in session.exec(select(RemediationAction).where(RemediationAction.incident_id.in_(list(by_incident)))).all():
            inc = by_incident[action.incident_id]
            ref = incident_ref(inc)
            owner = lk.user(action.owner_id)
            add(action.created_at, "remediation_added", f"Remediation action added to {ref}", f"{action.description} · owner {owner.full_name if owner else '—'} · due {action.due_date}",
                "Open", inc.participant_id, incident_id=inc.id)
            if action.completed_at:
                add(action.completed_at, "remediation_completed", f"Remediation action completed on {ref}", action.description, "Completed",
                    inc.participant_id, incident_id=inc.id)
    events.sort(key=lambda e: e["at"])
    return events


def history(session: Session, participant_id: int) -> list[dict]:
    """REQ-COMP-009: the participant's full compliance history, oldest
    first — every submission and document with its outcome, correction
    chains (replaces_id), correction requests, missed deadlines, incidents
    and remediation. Each event: {at, type, title, detail, status,
    participant_id, participant_name, participant_code, institution_type,
    requirement_id, requirement_name, cycle_id, period, submission_id,
    document_id, incident_id, replaces_id}."""
    return _events(session, participant_id)


def dashboard_summary(session: Session, days: int = 30) -> dict:
    """§15.1 Compliance user dashboard. Returns {
      overdue_submissions: int — cycles currently Overdue,
      upcoming_deadlines: [deadline rows due today..today+days, not approved],
      open_incidents: {Critical, High, Medium, Low, total} — unresolved,
      compliance_rate_30d: {rate_pct, on_time, total, window_start} — cycles
          due in the last `days` days approved with an on-time file,
      overdue_action_items: {governance, incident_remediation, total},
      recent_activity: [last 10 compliance events, newest first; see history()],
      as_of: date }"""
    from app.models.governance import ActionItem
    from app.services.governance_jobs import effective_status

    lk = Lookups(session)
    today = lk.today
    upcoming = [d for d in deadlines(session, today, today + timedelta(days=days), lk=lk) if d["status"] not in (APPROVED, OVERDUE)]
    unresolved = session.exec(select(Issue).where(Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))).all()
    by_severity = {s.value: sum(1 for i in unresolved if i.severity == s) for s in IssueSeverity}
    window_start = today - timedelta(days=days)
    recent_cycles = session.exec(
        select(ComplianceCycle).join(ComplianceRequirement, ComplianceCycle.requirement_id == ComplianceRequirement.id).where(
            ComplianceCycle.due_date >= window_start, ComplianceCycle.due_date < today)
    ).all()
    on_time, total = _adherence(list(recent_cycles))
    gov_overdue = sum(1 for item in session.exec(select(ActionItem).where(ActionItem.status != "Completed")).all()
                      if effective_status(item, today) == "Overdue")
    remediation_overdue = len(overdue_remediation(session, today))
    return {
        "as_of": today,
        "overdue_submissions": len(overdue_rows(session, lk=lk)),
        "upcoming_deadlines": upcoming,
        "open_incidents": {**by_severity, "total": len(unresolved)},
        "compliance_rate_30d": {"rate_pct": round(on_time / total * 100, 1) if total else None, "on_time": on_time,
                                "total": total, "window_start": window_start, "days": days},
        "overdue_action_items": {"governance": gov_overdue, "incident_remediation": remediation_overdue,
                                 "total": gov_overdue + remediation_overdue},
        "recent_activity": list(reversed(_events(session, register_only=True)[-10:])),
    }


def overdue_remediation(session: Session, today: date) -> list[RemediationAction]:
    """Open remediation actions past their due date on unresolved incidents
    (REQ-COMP-011)."""
    return list(session.exec(
        select(RemediationAction).join(Issue, RemediationAction.incident_id == Issue.id).where(
            RemediationAction.status == "Open", RemediationAction.due_date < today, Issue.status.in_(UNRESOLVED_INCIDENT_STATUSES))
    ).all())


def summary_rows(session: Session, filters: Optional[dict] = None) -> list[dict]:
    """§14.1 Compliance Summary Report rows, one per cycle. filters (all
    optional): participant_id, institution_type, status (any §9.2 status),
    date_from / date_to (on the due date), current_only (default: True when
    no date range is given — each active requirement's current cycle).

    Each row: {participant_id, participant_name, participant_code,
    institution_type, requirement_id, requirement_name, regulatory_reference,
    kind, frequency, cycle_id, period, due_date, submission_date, status,
    reviewer, rejection_reason, approved_at, on_time}."""
    filters = filters or {}
    lk = Lookups(session)
    date_from, date_to = filters.get("date_from"), filters.get("date_to")
    current_only = filters.get("current_only")
    if current_only is None:
        current_only = not (date_from or date_to)
    query = select(ComplianceCycle, ComplianceRequirement).where(ComplianceCycle.requirement_id == ComplianceRequirement.id)
    if filters.get("participant_id"):
        query = query.where(ComplianceRequirement.participant_id == filters["participant_id"])
    if date_from:
        query = query.where(ComplianceCycle.due_date >= date_from)
    if date_to:
        query = query.where(ComplianceCycle.due_date <= date_to)
    if current_only:
        query = query.where(ComplianceRequirement.active == True)  # noqa: E712
    current_ids = {}
    rows = []
    for cycle, req in session.exec(query.order_by(ComplianceCycle.due_date, ComplianceCycle.id)).all():
        if current_only:
            if req.id not in current_ids:
                c = current_cycle(session, req)
                current_ids[req.id] = c.id if c else None
            if current_ids[req.id] != cycle.id:
                continue
        p = lk.participant(req.participant_id)
        if filters.get("institution_type") and (p is None or p.type != filters["institution_type"]):
            continue
        status = status_on(cycle, lk.today, lk.zone)
        if filters.get("status") and status != filters["status"]:
            continue
        rows.append({**_participant_ref(p, req.participant_id), "requirement_id": req.id, "requirement_name": req.requirement_name,
                     "regulatory_reference": req.regulatory_reference, "kind": req.kind, "frequency": req.frequency,
                     "cycle_id": cycle.id, "period": cycle.period, "due_date": cycle.due_date,
                     "submission_date": cycle.submitted_at, "status": status, "reviewer": cycle.reviewed_by,
                     "rejection_reason": cycle.rejection_reason, "approved_at": cycle.approved_at, "on_time": cycle.on_time})
    return rows


def incident_rows(session: Session, filters: Optional[dict] = None) -> list[dict]:
    """§14.5 Incident Report rows. filters (all optional): participant_id,
    severity, status, date_from / date_to (on the raised date).

    Each row: {incident_id, ref ("INC-0007"), participant_id,
    participant_name, participant_code, institution_type, severity,
    description, incident_date, raised_at, raised_by, owner, status,
    resolved_at, closed_at, resolution_summary}."""
    from app.services.incidents import incident_ref

    filters = filters or {}
    lk = Lookups(session)
    query = select(Issue).order_by(Issue.created_at.desc(), Issue.id.desc())
    if filters.get("participant_id"):
        query = query.where(Issue.participant_id == filters["participant_id"])
    if filters.get("severity"):
        query = query.where(Issue.severity == IssueSeverity(filters["severity"]))
    if filters.get("status"):
        from app.models.enums import IssueStatus

        query = query.where(Issue.status == IssueStatus(filters["status"]))
    if filters.get("date_from"):
        query = query.where(Issue.created_at >= datetime.combine(filters["date_from"], time.min))
    if filters.get("date_to"):
        query = query.where(Issue.created_at < datetime.combine(filters["date_to"] + timedelta(days=1), time.min))
    rows = []
    for inc in session.exec(query).all():
        raiser, owner = lk.user(inc.raised_by_id), lk.user(inc.owner_id)
        rows.append({"incident_id": inc.id, "ref": incident_ref(inc),
                     **_participant_ref(lk.participant(inc.participant_id), inc.participant_id),
                     "severity": inc.severity.value, "description": inc.description, "incident_date": inc.incident_date,
                     "raised_at": inc.created_at, "raised_by": (raiser.full_name or raiser.email) if raiser else "",
                     "owner": (owner.full_name or owner.email) if owner else inc.assignee, "status": inc.status.value,
                     "resolved_at": inc.resolved_at, "closed_at": inc.closed_at, "resolution_summary": inc.resolution_summary})
    return rows


def failure_rates(session: Session, months: int = 12) -> list[dict]:
    """REQ-COMP-008 for every participant, worst first, with deadline
    adherence alongside."""
    out = []
    for p in session.exec(select(Participant).order_by(Participant.name)).all():
        out.append({**_participant_ref(p, p.id), "status": p.status, "failure": failure_rate(session, p.id, months),
                    "adherence": adherence_rate(session, p.id, months)})
    return sorted(out, key=lambda r: (-(r["failure"]["rate_pct"] or -1), r["participant_name"]))


def automated_integration(session: Session, submission: Submission) -> bool:
    if not submission.integration_id:
        return False
    integration = session.get(Integration, submission.integration_id)
    return bool(integration and integration.integration_mode != "Manual")
