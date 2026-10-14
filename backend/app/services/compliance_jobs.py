"""Scheduled compliance checks (SRS §6.5 steps 2 and 4, REQ-COMP-005, §13).
run() is called on every scheduler tick and is idempotent: statuses are
recomputed from stored facts, and every notification carries a stable dedupe
key, so a tick never repeats a reminder or an escalation.

  Lead time reached (Settings → reminders.days_before, e.g. 14/7/1 days)
    → compliance_deadline_reminder to Compliance users, and
      participant_deadline_reminder emailed to the responsible
      participant's primary contact (REQ-COMP-005). Only while the
      institution still owes a file (nothing valid in hand).
  Deadline passed without an acceptable submission → status Overdue,
    submission_overdue to Compliance users, an escalation to senior
    Compliance users (§6.5 step 4), and an overdue reminder to the
    participant's contact — repeated weekly while it still owes the file."""

from datetime import date
from typing import Optional

from sqlmodel import Session, select

from app.models.compliance import ComplianceCycle, ComplianceRequirement
from app.models.enums import UserRole
from app.models.participant import Participant
from app.services import notify
from app.services.compliance import (
    APPROVED,
    OUTSTANDING,
    OVERDUE,
    ensure_cycle,
    recompute,
    send_each,
    today_for,
)
from app.services.settings_store import get_setting

PARTICIPANT_OVERDUE_REPEAT_DAYS = 7


def run(session: Session, today: Optional[date] = None) -> dict:
    today = today or today_for(session)
    changed = refresh_statuses(session, today)
    reminders = send_deadline_reminders(session, today)
    overdue = escalate_overdue(session, today)
    return {"status_changes": changed, "reminders": reminders, "overdue_notices": overdue}


def _open_cycles(session: Session):
    """(cycle, requirement, participant) for every cycle of an active
    requirement that isn't approved yet."""
    return session.exec(
        select(ComplianceCycle, ComplianceRequirement, Participant).where(
            ComplianceCycle.requirement_id == ComplianceRequirement.id,
            ComplianceRequirement.participant_id == Participant.id,
            ComplianceRequirement.active == True,  # noqa: E712
            ComplianceCycle.stage != APPROVED,
        ).order_by(ComplianceCycle.due_date, ComplianceCycle.id)
    ).all()


def refresh_statuses(session: Session, today: date) -> int:
    """Give every active requirement a cycle and recompute open cycles, so
    a deadline passing turns them Overdue (§9.2)."""
    for requirement in session.exec(select(ComplianceRequirement).where(ComplianceRequirement.active == True)).all():  # noqa: E712
        ensure_cycle(session, requirement)
    session.commit()
    changed = 0
    for cycle, requirement, _ in _open_cycles(session):
        before = cycle.status
        if recompute(session, cycle, today=today, requirement=requirement) != before:
            changed += 1
    session.commit()
    return changed


def lead_times(session: Session) -> list[int]:
    """REQ-SET-004 lead times, smallest first."""
    raw = get_setting(session, "reminders").get("days_before") or [14, 7, 1]
    return sorted({int(d) for d in raw if int(d) >= 0})


def _plural(n: int, word: str = "day") -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def send_deadline_reminders(session: Session, today: date) -> int:
    """§6.5 step 2 / REQ-COMP-005: at each lead time, once — the tightest one
    reached, so a cycle opened 5 days out gets the 7-day reminder, not the
    14-day one."""
    leads = lead_times(session)
    compliance = notify.users_with_roles(session, UserRole.compliance)
    sent = 0
    for cycle, requirement, participant in _open_cycles(session):
        if cycle.stage not in OUTSTANDING or participant.status != "Active":
            continue
        left = (cycle.due_date - today).days
        if left < 0:
            continue
        lead = next((n for n in leads if left <= n), None)
        if lead is None:
            continue
        when = "today" if left == 0 else f"in {_plural(left)}"
        due = cycle.due_date.strftime("%d %B %Y").lstrip("0")
        what = f"{requirement.requirement_name} ({cycle.period})"
        state = "" if cycle.stage == "Pending" else f" Current state: {cycle.stage}."
        sent += send_each(
            session, "compliance_deadline_reminder", compliance,
            title=f"Compliance deadline {when} — {participant.name}",
            message=f"{what} for {participant.name} is due on {due}"
                    f"{f' ({requirement.regulatory_reference})' if requirement.regulatory_reference else ''}.{state} "
                    "Upload the file once the institution sends it.",
            link="/compliance", severity="warning" if left <= 7 else "info",
            dedupe_key=f"compliance_deadline_reminder:{cycle.id}:{cycle.due_date.isoformat()}:{lead}",
        )
        if participant.primary_contact_email:
            sent += send_each(
                session, "participant_deadline_reminder", [participant.primary_contact_email],
                title=f"Reminder: {what} due {due}",
                message="",
                email_subject=f"[RSwitch] Reminder: {requirement.requirement_name} due {due}",
                email_body=_participant_email(participant, requirement, cycle, due,
                                              f"is due {when} ({due})."),
                dedupe_key=f"participant_deadline_reminder:{cycle.id}:{cycle.due_date.isoformat()}:{lead}",
            )
    return sent


def escalate_overdue(session: Session, today: date) -> int:
    """§6.5 step 4: Compliance users are told, senior Compliance users get
    the escalation (each person one notice), and the participant's contact
    is reminded — weekly while nothing valid has been received."""
    compliance = notify.users_with_roles(session, UserRole.compliance)
    seniors = notify.senior_users(session, UserRole.compliance)
    senior_ids = {u.id for u in seniors}
    others = [u for u in compliance if u.id not in senior_ids]
    sent = 0
    for cycle, requirement, participant in _open_cycles(session):
        if cycle.status != OVERDUE:
            continue
        days = (today - cycle.due_date).days
        due = cycle.due_date.strftime("%d %B %Y").lstrip("0")
        what = f"{requirement.requirement_name} ({cycle.period})"
        detail = (f"{what} for {participant.name} was due on {due} ({_plural(days)} ago) and has no approved submission. "
                  f"Current state: {cycle.stage}.")
        key = f"{cycle.id}:{cycle.due_date.isoformat()}"
        sent += send_each(session, "submission_overdue", others, title=f"Submission overdue — {participant.name}",
                          message=detail, link="/compliance", severity="alert", dedupe_key=f"submission_overdue:{key}")
        sent += send_each(session, "submission_overdue", seniors, title=f"Escalation: submission overdue — {participant.name}",
                          message=detail + " Escalated to senior Compliance (§6.5).", link="/compliance", severity="alert",
                          dedupe_key=f"submission_overdue_escalation:{key}")
        if cycle.stage in OUTSTANDING and participant.primary_contact_email and participant.status == "Active":
            week = days // PARTICIPANT_OVERDUE_REPEAT_DAYS
            sent += send_each(
                session, "participant_deadline_reminder", [participant.primary_contact_email],
                title=f"Overdue: {what}", message="",
                email_subject=f"[RSwitch] Overdue: {requirement.requirement_name} was due {due}",
                email_body=_participant_email(participant, requirement, cycle, due,
                                              f"was due on {due} and is now {_plural(days)} overdue."),
                dedupe_key=f"participant_overdue:{key}:{week}",
            )
    return sent


def _participant_email(participant: Participant, requirement: ComplianceRequirement, cycle: ComplianceCycle,
                       due: str, when: str) -> str:
    """Outbound only: the institution replies through the agreed channel,
    never into RDIP."""
    greeting = f"Dear {participant.primary_contact_name}," if participant.primary_contact_name else "Dear colleague,"
    reference = f" ({requirement.regulatory_reference})" if requirement.regulatory_reference else ""
    return (
        f"{greeting}\n\n"
        f"This is an automated reminder from RSwitch. {participant.name}'s {requirement.requirement_name}{reference} "
        f"for {cycle.period} {when}\n\n"
        "Please send it to RSwitch through the agreed channel (email or secure transfer). If you have already "
        "sent it, please disregard this message.\n\n"
        "— RSwitch Compliance\n(This mailbox is not monitored.)"
    )
