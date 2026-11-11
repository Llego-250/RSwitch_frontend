"""Governance demo data (SRS §5.7): the Board, a Steering Committee and two
working groups with RSwitch staff and participant representatives, past
meetings with agenda, minutes and decisions, upcoming meetings, documents of
every category (one series with several versions, two Restricted), and
action items in every §9.4 status — including overdue ones and ones falling
due within the 7-day and 1-day reminder windows.

Dates are relative to today so the calendar, reminders and overdue dashboard
always have something current to show. Idempotent: does nothing once any
committee has members."""

import io
import zipfile
from datetime import datetime, time, timedelta
from typing import Optional

from fpdf import FPDF
from openpyxl import Workbook
from sqlmodel import Session, select

from app.models.governance import (
    ActionItem,
    CommitteeMember,
    GovDocument,
    GovernanceCommittee,
    Meeting,
    MeetingAttendee,
)
from app.models.participant import Participant
from app.models.user import User
from app.services.governance_jobs import backfill_legacy, org_today
from app.storage import put_file

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

COMMITTEES = [
    ("Board of Directors", "Board", "business.lead@rswitch.rw",
     "RSwitch Board: strategy, risk appetite and oversight of the national switch."),
    ("Steering Committee", "Steering Committee", "compliance.lead@rswitch.rw",
     "Participant executives and RSwitch management steering interoperability and the participant roadmap."),
    ("Technical Working Group", "Technical Working Group", "admin@rswitch.rw",
     "Integration leads and architects: message standards, connectivity and data exchange."),
    ("Operational Working Group", "Operational Working Group", "compliance@rswitch.rw",
     "Settlement and operations officers: settlement windows, incident handling and daily operations."),
]

# (committee, staff email | None, institution code | None, name, email, role)
MEMBERS = [
    ("Board of Directors", "compliance.lead@rswitch.rw", None, "", "", "Secretary"),
    ("Board of Directors", None, "KVU", "Aline Uwase", "aline.uwase@kivubank.rw", "Member"),
    ("Board of Directors", None, "MOB", "Olivier Habimana", "o.habimana@mobipesa.rw", "Member"),
    ("Steering Committee", "compliance@rswitch.rw", None, "", "", "Secretary"),
    ("Steering Committee", "business.lead@rswitch.rw", None, "", "", "Vice-Chair"),
    ("Steering Committee", "business@rswitch.rw", None, "", "", "Member"),
    ("Steering Committee", None, "KVU", "Aline Uwase", "aline.uwase@kivubank.rw", "Member"),
    ("Steering Committee", None, "AKS", "Jean Bosco Habimana", "ops@akagera-sc.rw", "Member"),
    ("Steering Committee", None, "MOB", "Diane Mukamana", "integrations@mobipesa.rw", "Member"),
    ("Steering Committee", None, "RUS", "Claudine Ingabire", "manager@rubavusacco.rw", "Observer"),
    ("Technical Working Group", "compliance@rswitch.rw", None, "", "", "Member"),
    ("Technical Working Group", None, "KVU", "Patrick Mugisha", "p.mugisha@kivubank.rw", "Vice-Chair"),
    ("Technical Working Group", None, "MOB", "Diane Mukamana", "integrations@mobipesa.rw", "Member"),
    ("Technical Working Group", None, "NYM", "Eric Niyonzima", "compliance@nyanzamfi.rw", "Member"),
    ("Operational Working Group", "business@rswitch.rw", None, "", "", "Member"),
    ("Operational Working Group", "admin@rswitch.rw", None, "", "", "Member"),
    ("Operational Working Group", None, "RUS", "Claudine Ingabire", "manager@rubavusacco.rw", "Member"),
    ("Operational Working Group", None, "AKS", "Jean Bosco Habimana", "ops@akagera-sc.rw", "Member"),
]

# key: (committee, title, days from today, UTC hour, location, agenda, decisions)
MEETINGS = {
    "board_q3": ("Board of Directors", "Q3 Board Governance Session", -35, 8, "RSwitch Boardroom, Kigali",
                 "1. Minutes of the previous meeting\n2. Revised RSwitch Governance Charter\n"
                 "3. 2026 risk appetite statement\n4. Participant onboarding pipeline",
                 ["Approved the revised RSwitch Governance Charter (v2.0).",
                  "Adopted the 2026 risk appetite statement; circulation restricted to Board members.",
                  "Asked management for a quarterly interoperability KPI pack."]),
    "sc_interop": ("Steering Committee", "Interoperability Review", -21, 7, "Hybrid — RSwitch HQ / Teams",
                   "1. Interoperability scorecard by institution\n2. SACCO data-sharing approach\n"
                   "3. Disaster-recovery contacts\n4. AOB",
                   ["Endorsed the interoperability scorecard as the standing first agenda item.",
                    "SACCO participants to join data sharing under a dedicated MoU annex.",
                    "Every participant to confirm its disaster-recovery contacts before the next session."]),
    "twg_iso": ("Technical Working Group", "ISO 20022 Migration Workshop", -14, 9, "RSwitch Lab 2",
                "1. pacs.008 / pacs.002 message mapping status\n2. MFI ingestion schema corrections\n"
                "3. UAT plan for e-money issuers",
                ["Adopted the ISO 20022 mapping conventions in the Technical Standard v3.1.",
                 "MFI participants to resubmit corrected schema mappings.",
                 "E-money issuers to provide UAT evidence for pacs.008 before go-live."]),
    "owg_settlement": ("Operational Working Group", "Settlement Window Review", -10, 8, "Teams",
                       "1. Mobile money settlement window performance\n2. Proposed cut-off times\n3. Exceptions handling",
                       ["Settlement cut-off moves from 16:00 to 17:00 for mobile money transfers.",
                        "Revised cut-off times to be circulated to all participants."]),
    "owg_incident": ("Operational Working Group", "Weekend Settlement Incident Debrief", -2, 12, "Teams",
                     "1. Timeline of the delayed weekend settlement\n2. Root cause\n3. Follow-up actions", []),
    "twg_sync": ("Technical Working Group", "Bi-weekly Integration Sync", 3, 10, "RSwitch Lab 2",
                 "1. Connectivity status per participant\n2. Certificate renewals due\n3. Pipeline failures this fortnight", []),
    "sc_q4": ("Steering Committee", "Q4 Steering Committee", 9, 7, "RSwitch Boardroom, Kigali",
              "1. Matters arising\n2. Interoperability scorecard\n3. 2027 participant roadmap\n4. AOB", []),
    "owg_monthly": ("Operational Working Group", "Monthly Operations Review", 16, 8, "Teams",
                    "1. Settlement performance\n2. Incident log review\n3. Participant service requests", []),
    "board_q4": ("Board of Directors", "Q4 Board Meeting", 24, 8, "RSwitch Boardroom, Kigali",
                 "1. Minutes of the Q3 session\n2. Interoperability KPI pack\n3. 2027 budget\n4. Risk report", []),
}

# Attendees per meeting: staff emails and representative emails (all members of the committee).
ATTENDEES = {
    "board_q3": ["business.lead@rswitch.rw", "compliance.lead@rswitch.rw", "aline.uwase@kivubank.rw", "o.habimana@mobipesa.rw"],
    "sc_interop": ["compliance.lead@rswitch.rw", "compliance@rswitch.rw", "business.lead@rswitch.rw", "business@rswitch.rw",
                   "aline.uwase@kivubank.rw", "ops@akagera-sc.rw", "integrations@mobipesa.rw"],
    "twg_iso": ["admin@rswitch.rw", "compliance@rswitch.rw", "p.mugisha@kivubank.rw", "integrations@mobipesa.rw",
                "compliance@nyanzamfi.rw"],
    "owg_settlement": ["compliance@rswitch.rw", "business@rswitch.rw", "admin@rswitch.rw", "manager@rubavusacco.rw",
                       "ops@akagera-sc.rw"],
    "owg_incident": ["compliance@rswitch.rw", "admin@rswitch.rw", "manager@rubavusacco.rw"],
    "twg_sync": ["admin@rswitch.rw", "compliance@rswitch.rw", "p.mugisha@kivubank.rw", "integrations@mobipesa.rw",
                 "compliance@nyanzamfi.rw"],
    "sc_q4": ["compliance.lead@rswitch.rw", "compliance@rswitch.rw", "business.lead@rswitch.rw", "business@rswitch.rw",
              "aline.uwase@kivubank.rw", "ops@akagera-sc.rw", "integrations@mobipesa.rw", "manager@rubavusacco.rw"],
    "owg_monthly": ["compliance@rswitch.rw", "business@rswitch.rw", "admin@rswitch.rw", "manager@rubavusacco.rw",
                    "ops@akagera-sc.rw"],
    "board_q4": ["business.lead@rswitch.rw", "compliance.lead@rswitch.rw", "aline.uwase@kivubank.rw", "o.habimana@mobipesa.rw"],
}

# (title, category, committee, [(version, days ago)], access, format, meeting key or None)
DOCUMENTS = [
    ("RSwitch Governance Charter", "Policy", "Board of Directors", [("v1.0", 400), ("v2.0", 34)], "Internal", "pdf", None),
    ("Board Risk Appetite Statement 2026", "Policy", "Board of Directors", [("v1.0", 34)], "Restricted", "pdf", None),
    ("Board Minutes — Q3 Governance Session", "Minutes", "Board of Directors", [("v1.0", 33)], "Restricted", "pdf", "board_q3"),
    ("Steering Committee Terms of Reference", "Policy", "Steering Committee", [("v1.0", 180)], "Internal", "pdf", None),
    ("Steering Committee Minutes — Interoperability Review", "Minutes", "Steering Committee", [("v1.0", 19)], "Internal", "pdf", "sc_interop"),
    ("Participant Contact & Escalation Matrix", "Other", "Steering Committee", [("v1.0", 60), ("v1.1", 18)], "Internal", "xlsx", None),
    ("API Interoperability Technical Standard", "Working Paper", "Technical Working Group", [("v3.0", 90), ("v3.1", 15)], "Internal", "pdf", "twg_iso"),
    ("TWG Minutes — ISO 20022 Migration Workshop", "Minutes", "Technical Working Group", [("v1.0", 12)], "Internal", "docx", "twg_iso"),
    ("Resolution on Mobile Money Settlement Window", "Decision", "Operational Working Group", [("v1.2", 9)], "Internal", "pdf", "owg_settlement"),
    ("OWG Minutes — Settlement Window Review", "Minutes", "Operational Working Group", [("v1.0", 9)], "Internal", "pdf", "owg_settlement"),
]

# (description, committee, owner staff email | institution code, due in days, status, meeting key, created days ago)
ACTION_ITEMS = [
    ("Circulate revised settlement cut-off times to all participants", "Operational Working Group",
     "compliance@rswitch.rw", -4, "In Progress", "owg_settlement", 10),
    ("Submit corrected schema mapping for MFI ingestion", "Technical Working Group", "NYM", -6, "Open", "twg_iso", 14),
    ("Provide UAT evidence for ISO 20022 pacs.008 messages", "Technical Working Group", "MOB", -2, "Open", "twg_iso", 14),
    ("Draft the data-sharing MoU annex for SACCO participants", "Steering Committee",
     "business.lead@rswitch.rw", -8, "In Progress", "sc_interop", 21),
    ("Confirm disaster-recovery contact list", "Steering Committee", "KVU", 7, "Open", "sc_interop", 21),
    ("Publish the approved Governance Charter on the staff intranet", "Board of Directors",
     "compliance.lead@rswitch.rw", 1, "In Progress", "board_q3", 35),
    ("Compile financial inclusion figures for the Q4 Board pack", "Board of Directors",
     "business@rswitch.rw", 5, "Open", "board_q3", 35),
    ("Prepare the quarterly interoperability KPI pack", "Steering Committee",
     "business@rswitch.rw", 12, "In Progress", "sc_interop", 21),
    ("Review the participant onboarding checklist against the latest BNR directive", "Steering Committee",
     "compliance@rswitch.rw", 20, "Open", None, 3),
    ("Write up the root cause of the delayed weekend settlement", "Operational Working Group",
     "admin@rswitch.rw", 6, "Open", "owg_incident", 2),
    ("Publish ISO 20022 message specifications for SACCOs", "Technical Working Group",
     "admin@rswitch.rw", -15, "Completed", "twg_iso", 14),
    ("Approve the revised settlement window internally", "Operational Working Group", "RUS", -5, "Completed", "owg_settlement", 10),
]


def _pdf(title: str, committee: str, version: str) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    line = {"new_x": "LMARGIN", "new_y": "NEXT"}
    pdf.multi_cell(0, 8, _latin(title), **line)
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 6, _latin(f"{committee} — {version}\n "), **line)
    pdf.ln(4)
    pdf.multi_cell(0, 6, "Demo governance document generated by app.seeds.governance for RDIP development.", **line)
    return bytes(pdf.output())


def _latin(text: str) -> str:
    return text.replace("—", "-").encode("latin-1", "replace").decode("latin-1")


def _docx(title: str, committee: str, version: str) -> bytes:
    """A minimal valid WordprocessingML document (no python-docx needed)."""
    def para(text: str) -> str:
        escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f"<w:p><w:r><w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>"

    body = "".join(para(t) for t in (title, f"{committee} — {version}", "Demo minutes generated by app.seeds.governance."))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                   "</Types>")
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                   "</Relationships>")
        z.writestr("word/document.xml",
                   '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                   f"<w:body>{body}</w:body></w:document>")
    return buffer.getvalue()


def _xlsx(session: Session) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Contacts"
    sheet.append(["Institution", "Type", "Primary contact", "Email", "Escalation route"])
    for p in session.exec(select(Participant).order_by(Participant.name)).all():
        sheet.append([p.name, p.type, p.primary_contact_name, p.primary_contact_email, "RSwitch Operations → Head of Compliance"])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def seed(session: Session) -> None:
    backfill_legacy(session)
    if session.exec(select(CommitteeMember.id)).first() is not None:
        return
    users = {u.email: u for u in session.exec(select(User)).all()}
    institutions = {p.code: p for p in session.exec(select(Participant)).all()}
    today = org_today(session)
    now = datetime.utcnow()

    def staff(email: Optional[str]) -> Optional[User]:
        return users.get(email) if email else None

    committees: dict[str, GovernanceCommittee] = {}
    for name, kind, chair_email, description in COMMITTEES:
        committee = session.exec(select(GovernanceCommittee).where(GovernanceCommittee.name == name)).first()
        committee = committee or GovernanceCommittee(name=name)
        committee.type, committee.description = kind, description
        chair = staff(chair_email)
        committee.chair_id = chair.id if chair else committee.chair_id
        session.add(committee)
        committees[name] = committee
    session.flush()

    members: dict[tuple[str, str], CommitteeMember] = {}
    for committee_name, staff_email, code, name, email, role in MEMBERS:
        committee = committees[committee_name]
        user = staff(staff_email)
        institution = institutions.get(code) if code else None
        if staff_email and not user or code and not institution:
            continue
        member = CommitteeMember(
            committee_id=committee.id, user_id=user.id if user else None,
            participant_id=institution.id if institution else None,
            name="" if user else name, email="" if user else email, role=role,
            joined_on=today - timedelta(days=200),
        )
        session.add(member)
        members[(committee_name, staff_email or email)] = member
    session.flush()

    meetings: dict[str, Meeting] = {}
    for key, (committee_name, title, days, hour, location, agenda, decisions) in MEETINGS.items():
        committee = committees[committee_name]
        scheduled = datetime.combine(today + timedelta(days=days), time(hour, 0))
        meeting = Meeting(
            title=title, committee=committee_name, committee_id=committee.id, scheduled_at=scheduled,
            duration_minutes=90 if committee.type == "Board" else 60, location=location, agenda=agenda,
            decisions=decisions, decisions_count=len(decisions), created_by="Compliance Officer",
            created_by_id=staff("compliance@rswitch.rw").id if staff("compliance@rswitch.rw") else None,
            created_at=min(now, scheduled) - timedelta(days=14), updated_at=min(now, scheduled + timedelta(days=2)),
        )
        session.add(meeting)
        session.flush()
        count = 0
        for address in ATTENDEES[key]:
            user = staff(address)
            member = members.get((committee_name, address))
            if user:
                session.add(MeetingAttendee(meeting_id=meeting.id, user_id=user.id, name=user.full_name, email=user.email))
            elif member:
                session.add(MeetingAttendee(meeting_id=meeting.id, member_id=member.id, name=member.name, email=member.email))
            else:
                continue
            count += 1
        meeting.attendees_count = count
        meetings[key] = meeting
    session.flush()

    uploader = staff("compliance@rswitch.rw") or staff("compliance.lead@rswitch.rw")
    for title, category, committee_name, versions, access, fmt, meeting_key in DOCUMENTS:
        committee = committees[committee_name]
        meeting = meetings.get(meeting_key) if meeting_key else None
        series_id = None
        for index, (version, days_ago) in enumerate(versions):
            slug = title.replace(" — ", "_").replace(" ", "_").replace("&", "and")
            filename = f"{slug}_{version}.{fmt}"
            if fmt == "pdf":
                content, mime = _pdf(title, committee_name, version), PDF
            elif fmt == "docx":
                content, mime = _docx(title, committee_name, version), DOCX
            else:
                content, mime = _xlsx(session), XLSX
            key = f"governance/demo-{filename}"
            put_file(key, content, mime)
            doc = GovDocument(
                title=title, category=category, committee=committee_name, committee_id=committee.id, version=version,
                access_level=access, filename=filename, storage_key=key, content_type=mime, size_bytes=len(content),
                uploaded_by=uploader.full_name if uploader else "", uploaded_by_id=uploader.id if uploader else None,
                uploaded_at=now - timedelta(days=days_ago), meeting_id=meeting.id if meeting else None,
                series_id=series_id, is_latest=index == len(versions) - 1,
            )
            session.add(doc)
            session.flush()
            series_id = series_id or doc.id
            doc.series_id = series_id
            if meeting and category == "Minutes" and doc.is_latest:
                meeting.minutes_document_id = doc.id
                session.add(meeting)

    for description, committee_name, owner, due_in, status, meeting_key, created_ago in ACTION_ITEMS:
        committee = committees[committee_name]
        user = staff(owner) if "@" in owner else None
        institution = institutions.get(owner) if "@" not in owner else None
        if not user and not institution:
            continue
        created = now - timedelta(days=created_ago)
        due = today + timedelta(days=due_in)
        session.add(
            ActionItem(
                description=description, committee=committee_name, committee_id=committee.id,
                meeting_id=meetings[meeting_key].id if meeting_key else None,
                owner=user.full_name if user else institution.name,
                owner_user_id=user.id if user else None, owner_participant_id=institution.id if institution else None,
                due_date=due, status=status, completed=status == "Completed",
                started_at=created + timedelta(days=1) if status in ("In Progress", "Completed") else None,
                completed_at=datetime.combine(due - timedelta(days=1), time(9, 0)) if status == "Completed" else None,
                completed_by=(user.full_name if user else "Compliance Officer") if status == "Completed" else "",
                created_by="Compliance Officer", created_at=created, updated_at=created,
            )
        )
    session.commit()
