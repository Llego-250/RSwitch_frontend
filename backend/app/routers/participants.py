from datetime import date
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.errors import problem, validation_error
from app.core.permissions import has_cap, require_cap
from app.core.security import is_valid_email, normalize_email
from app.db import get_session
from app.models.admin import ParticipantNote
from app.models.enums import REGIONS, InstitutionType, ParticipantStatus
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.user import User
from app.services import audit, participant360, risk

router = APIRouter(prefix="/participants", tags=["Participants"])

NOT_FOUND = "The requested record could not be found."
MAX_NOTE_CHARS = 4000

TYPES = [t.value for t in InstitutionType]
STATUSES = [s.value for s in ParticipantStatus]


@router.get("", response_model=list[Participant])
def list_participants(
    is_active: Optional[bool] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    region: Optional[str] = None,
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_cap("integrations.view")),
):
    """§19.2 list with filters — the participant catalog (REQ-INTG-001)."""
    query = select(Participant)
    if is_active is not None:
        query = query.where(Participant.is_active == is_active)
    if status is not None:
        query = query.where(Participant.status == status)
    if type is not None:
        query = query.where(Participant.type == type)
    if region is not None:
        query = query.where(Participant.region == region)
    if q:
        # §8.1: search by participant name or ID (the numeric id, or the code).
        like = f"%{q.strip()}%"
        match = Participant.name.ilike(like) | Participant.code.ilike(like) | Participant.short_name.ilike(like)
        if q.strip().isdigit():
            match = match | (Participant.id == int(q.strip()))
        query = query.where(match)
    return session.exec(query.order_by(Participant.name)).all()


# ---- risk assessment (REQ-P360-009..012, §11.5) — above /{participant_id} -------

@router.get("/risk-scores")
def risk_scores(session: Session = Depends(get_session), _: User = Depends(require_cap("participant360.view"))):
    """Current score of every participant, riskiest first; insufficient-data
    participants last, unscored (REQ-P360-012)."""
    return risk.latest_scores(session)


@router.post("/risk-scores/recompute")
def recompute_risk(request: Request, session: Session = Depends(get_session),
                   user: User = Depends(require_cap("settings.manage"))):
    """Recalculate now rather than waiting for the nightly run."""
    count = risk.recompute(session, trigger="On demand")
    audit.record(session, "RISK_RECALCULATE", f"{count} participant(s), on demand", user, request)
    return {"recomputed": count, "distribution": risk.distribution(session)}


@router.get("/risk-methodology")
def risk_methodology(session: Session = Depends(get_session),
                     _: User = Depends(require_cap("participant360.risk_methodology"))):
    """REQ-P360-009/011: indicators, definitions, weights, thresholds, data
    sources. Shown read-only to every role; edited in Settings."""
    return risk.methodology(session)


@router.put("/risk-methodology")
def update_risk_methodology(request: Request, value: dict = Body(...), session: Session = Depends(get_session),
                            admin: User = Depends(require_cap("settings.manage"))):
    """REQ-P360-011: Technical/Admin reconfigures weights (each set adding up
    to 100), thresholds and indicators. Every score is recalculated at once."""
    before = risk.config(session)
    saved, problems = risk.save_config(session, value)
    if problems:
        raise validation_error(problems)
    changed = [k for k in saved if saved[k] != before.get(k)]
    audit.record(session, "SETTINGS_UPDATE", f"risk: {', '.join(changed) or 'no changes'}"[:900], admin, request)
    count = risk.recompute(session, trigger="Settings change") if changed else 0
    return {**risk.methodology(session), "recomputed": count}


class ParticipantIn(BaseModel):
    """SRS §10.1 fields a Technical/Admin user maintains."""

    name: Optional[str] = None
    short_name: Optional[str] = None
    code: Optional[str] = None
    type: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    registration_date: Optional[date] = None
    primary_contact_name: Optional[str] = None
    primary_contact_email: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    expected_frequency_days: Optional[int] = None


def _apply(session: Session, participant: Participant, data: dict, *, creating: bool) -> None:
    """Validate (§20.2, every problem at once) and copy onto the row."""
    problems: list[dict] = []
    if "name" in data or creating:
        if not (data.get("name") or "").strip():
            problems.append(problem("name", "required", "Enter the institution's full legal name"))
    if "code" in data or creating:
        code = (data.get("code") or "").strip().upper()
        if not code or not code.replace("-", "").isalnum() or len(code) > 12:
            problems.append(problem("code", "format", "Code: up to 12 letters or digits, e.g. BKG"))
        elif session.exec(select(Participant.id).where(Participant.code == code, Participant.id != (participant.id or 0))).first():
            problems.append(problem("code", "unique", "This record already exists or conflicts with an existing entry."))
        data["code"] = code
    if "type" in data or creating:
        if data.get("type") not in TYPES:
            problems.append(problem("type", "enum", f"Institution type must be one of: {', '.join(TYPES)}"))
    if data.get("region") and data["region"] not in REGIONS:
        problems.append(problem("region", "enum", f"Region must be one of: {', '.join(REGIONS)}"))
    if "country" in data and data["country"] is not None and not data["country"].strip():
        problems.append(problem("country", "required", "Enter the country"))
    if "primary_contact_name" in data or creating:
        if not (data.get("primary_contact_name") or "").strip():
            problems.append(problem("primary_contact_name", "required", "Enter the primary contact's name"))
    if "primary_contact_email" in data or creating:
        if not is_valid_email(data.get("primary_contact_email") or ""):
            problems.append(problem("primary_contact_email", "email", "Enter a valid email address"))
        else:
            data["primary_contact_email"] = normalize_email(data["primary_contact_email"])
    if data.get("status") is not None and data["status"] not in STATUSES:
        problems.append(problem("status", "enum", f"Status must be one of: {', '.join(STATUSES)}"))
    if data.get("expected_frequency_days") is not None and not 1 <= data["expected_frequency_days"] <= 366:
        problems.append(problem("expected_frequency_days", "range", "Expected frequency is 1 to 366 days"))
    if problems:
        # A duplicate code alone is a conflict (§20.1 409); anything else is invalid input.
        raise validation_error(problems, 409 if all(p["rule"] == "unique" for p in problems) else 422)

    for key, value in data.items():
        if value is None and not creating:
            continue
        if isinstance(value, str):
            value = value.strip()
        if value is not None:
            setattr(participant, key, value)
    if not participant.short_name:
        participant.short_name = participant.code
    # Status and is_active say the same thing; keep them in step whichever
    # one was sent.
    if "status" in data and data["status"]:
        participant.is_active = data["status"] == ParticipantStatus.active.value
    elif "is_active" in data and data["is_active"] is not None:
        if data["is_active"]:
            participant.status = ParticipantStatus.active.value
        elif participant.status == ParticipantStatus.active.value:
            participant.status = ParticipantStatus.inactive.value


@router.post("", response_model=Participant, status_code=201)
def create_participant(
    body: ParticipantIn, request: Request, session: Session = Depends(get_session), user: User = Depends(require_cap("integrations.manage"))
):
    """Registers the institution only. Its data sources are added as
    integrations; until then the catalog shows it as Not Configured."""
    participant = Participant(name="", code="")
    data = body.model_dump(exclude_none=True)
    data.setdefault("status", ParticipantStatus.active.value)
    data.setdefault("country", "Rwanda")
    data.setdefault("registration_date", date.today())
    _apply(session, participant, data, creating=True)
    session.add(participant)
    session.commit()
    session.refresh(participant)
    audit.record(session, "PARTICIPANT_CREATE", f"{participant.name} ({participant.code})", user, request)
    return participant


def _participant(session: Session, participant_id: int) -> Participant:
    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return participant


@router.get("/{participant_id}")
def get_participant(participant_id: int, session: Session = Depends(get_session),
                    user: User = Depends(require_cap("participant360.view"))):
    """§19.2 Participant 360 profile (REQ-P360-001..009): the §10.1 fields
    plus integrations, submission summary, compliance status, incidents,
    technical performance, outstanding actions and the risk assessment."""
    return participant360.profile(session, _participant(session, participant_id), user)


def _update(participant_id: int, body: ParticipantIn, request: Request, session: Session, user: User) -> Participant:
    participant = session.get(Participant, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    data = {k: getattr(body, k) for k in body.model_fields_set}
    _apply(session, participant, data, creating=False)
    session.add(participant)
    session.commit()
    session.refresh(participant)
    audit.record(session, "PARTICIPANT_UPDATE", f"{participant.code}: {', '.join(sorted(data))}", user, request)
    return participant


@router.put("/{participant_id}", response_model=Participant)
def update_participant(participant_id: int, body: ParticipantIn, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_cap("integrations.manage"))):
    """§19.2 update participant details (Technical/Admin)."""
    return _update(participant_id, body, request, session, user)


@router.patch("/{participant_id}", response_model=Participant)
def patch_participant(participant_id: int, body: ParticipantIn, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(require_cap("integrations.manage"))):
    """Partial update, same rules as PUT."""
    return _update(participant_id, body, request, session, user)


@router.get("/{participant_id}/submissions")
def participant_submissions(participant_id: int, session: Session = Depends(get_session),
                            _: User = Depends(require_cap("integrations.view"))):
    """§19.2 / REQ-INTG-011: every transfer from this participant, failed
    attempts included, with status, record and error counts."""
    from app.routers.submissions import submission_out

    if not session.get(Participant, participant_id):
        raise HTTPException(status_code=404, detail="The requested record could not be found.")
    rows = session.exec(
        select(Submission).where(Submission.participant_id == participant_id).order_by(Submission.uploaded_at.desc(), Submission.id.desc())
    ).all()
    return [submission_out(session, s) for s in rows]


@router.get("/{participant_id}/incidents")
def participant_incidents(participant_id: int, session: Session = Depends(get_session),
                          user: User = Depends(require_cap("participant360.view"))):
    """§19.2 / REQ-P360-006: open and resolved incidents."""
    _participant(session, participant_id)
    return participant360.incidents(session, participant_id, user)


@router.get("/{participant_id}/risk-score")
def participant_risk_score(participant_id: int, session: Session = Depends(get_session),
                           user: User = Depends(require_cap("participant360.view"))):
    """§19.2 current risk score with breakdown (REQ-P360-009..012): the three
    categories, composite, inputs, history and — for authorized users — the
    methodology. status "insufficient_data" with message "Insufficient data —
    score pending." under 3 months of submission history."""
    _participant(session, participant_id)
    row = risk.participant_risk(session, participant_id)
    if not has_cap(user, "participant360.risk_methodology"):
        row.pop("methodology", None)
    return row


@router.get("/{participant_id}/outstanding-actions")
def participant_outstanding_actions(participant_id: int, session: Session = Depends(get_session),
                                    _: User = Depends(require_cap("participant360.view"))):
    """REQ-P360-008: pending items assigned to RSwitch or the institution."""
    _participant(session, participant_id)
    return participant360.outstanding_actions(session, participant_id)


@router.get("/{participant_id}/notes", response_model=list[ParticipantNote])
def list_notes(participant_id: int, session: Session = Depends(get_session),
               _: User = Depends(require_cap("participant360.view"))):
    """REQ-P360-014 notes, newest first; every role reads them."""
    _participant(session, participant_id)
    return session.exec(
        select(ParticipantNote).where(ParticipantNote.participant_id == participant_id)
        .order_by(ParticipantNote.created_at.desc(), ParticipantNote.id.desc())
    ).all()


@router.post("/{participant_id}/notes", response_model=ParticipantNote, status_code=201)
def add_note(
    participant_id: int,
    request: Request,
    note: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    user: User = Depends(require_cap("participant360.notes")),
):
    """REQ-P360-014: Compliance users annotate a participant's profile."""
    _participant(session, participant_id)
    text = (note or "").strip()
    if not text:
        raise validation_error([problem("note", "required", "Write the note before saving it.")])
    if len(text) > MAX_NOTE_CHARS:
        raise validation_error([problem("note", "max_length", f"Notes are limited to {MAX_NOTE_CHARS} characters.")])
    row = ParticipantNote(participant_id=participant_id, author=user.full_name or user.email, note=text)
    session.add(row)
    session.commit()
    session.refresh(row)
    audit.record(session, "PARTICIPANT_NOTE", f"participant #{participant_id}", user, request)
    return row
