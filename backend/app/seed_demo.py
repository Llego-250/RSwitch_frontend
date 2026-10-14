"""Seed realistic multi-month demo data so the board trend graphs and
participant views have something real to show. Every submission is a real
generated CSV run through the actual validation/summarization code — the
only thing that's synthetic is the underlying transaction data itself, not
the pipeline that processes it.

Run inside the backend container: `python -m app.seed_demo`
"""

import random
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.core.security import hash_password
from app.db import engine, init_db
from app.models.document import ComplianceDocument, RequiredDocumentType
from app.models.enums import (
    IntegrationSource,
    IntegrationStatus,
    IssueSeverity,
    IssueStatus,
    SubmissionResult,
    UserRole,
)
from app.models.integration import Integration, IntegrationMode
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User
from app.services.ingestion import aggregate, read_rows, template_columns, validate_rows
from app.services.mapping import resolve_plan
from app.storage import init_bucket, put_file
from fpdf import FPDF
from app.models.admin import ParticipantNote
from app.services import anomaly
from app.seeds import run_all as run_module_seeds

random.seed(7)

PARTICIPANTS = [
    dict(name="Kivu Commercial Bank", code="KVU", type="Commercial Bank", freq=30, region="Kigali City",
         contact=("Aline Uwase", "aline.uwase@kivubank.rw")),
    dict(name="Akagera Savings & Credit", code="AKS", type="MFI", freq=7, region="Eastern Province",
         contact=("Jean Bosco Habimana", "ops@akagera-sc.rw")),
    dict(name="MobiPesa Rwanda", code="MOB", type="E-money Issuer", freq=1, region="Kigali City",
         contact=("Diane Mukamana", "integrations@mobipesa.rw")),
    dict(name="Nyanza Microfinance", code="NYM", type="MFI", freq=30, region="Southern Province",
         contact=("Eric Niyonzima", "compliance@nyanzamfi.rw")),
    dict(name="Rubavu Union SACCO", code="RUS", type="SACCO", freq=30, region="Western Province",
         contact=("Claudine Ingabire", "manager@rubavusacco.rw")),
]

DOC_TYPES = [
    dict(name="Operating licence", renewal_months=12),
    dict(name="UAT sign-off", renewal_months=None),
    dict(name="Infosec certification", renewal_months=12),
]

CHANNELS = ["POS", "Mobile", "ATM", "Web"]
MONTHS_BACK = 6


def month_floor(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# Meets the SRS §11.1 password policy; change it after first login.
DEMO_PASSWORD = "Rdip-Demo-2026!"


def get_or_create_user(session: Session, email: str, full_name: str, role: UserRole, is_senior: bool = False) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(DEMO_PASSWORD),
        role=role,
        is_senior=is_senior,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def generate_csv(row_count: int, avg_amount: float) -> bytes:
    lines = ["transaction_id,transaction_date,amount,channel"]
    for i in range(row_count):
        tx_date = (datetime.utcnow() - timedelta(days=random.randint(0, 27))).strftime("%Y-%m-%d")
        amount = round(random.uniform(avg_amount * 0.3, avg_amount * 1.8), 2)
        lines.append(f"TX{i:05d},{tx_date},{amount},{random.choice(CHANNELS)}")
    return "\n".join(lines).encode()


# Expected submission schedule of each participant's manual data source:
# monthly by the 10th; Akagera reports weekly.
EXPECTED_SCHEDULE = {"KVU": "0 9 10 * *", "AKS": "0 9 * * 1", "MOB": "0 9 10 * *", "NYM": "0 9 10 * *", "RUS": "0 9 10 * *"}


def _record_upload(session: Session, participant: Participant, integration: Integration, data: bytes, uploaded_at: datetime,
                   uploaded_by: str, *, approved: bool, replaces: "Submission | None" = None) -> Submission:
    """One monthly return through the real validation code; a file that
    passes has its aggregates loaded exactly as the pipeline's Load step
    does (seeds/pipelines.py adds the job history)."""
    columns = template_columns(session, integration.template_id)
    table = read_rows("demo.csv", data)
    errors, warnings = validate_rows(table, columns)
    passed = not errors
    transactions, totals, breakdowns = 0, {}, {}
    if passed:
        plan = resolve_plan(session, None, columns)
        canonical, _, _ = plan.apply(table.rows, [c.name for c in columns])
        transactions, totals, breakdowns = aggregate(canonical, plan.numeric, plan.categorical, plan.weight_field)
    suffix = f"-r{replaces.id}" if replaces else ""
    storage_key = f"submissions/{participant.id}/demo-{participant.code}-{uploaded_at:%Y%m}{suffix}.csv"
    put_file(storage_key, data, "text/csv")
    status = ("Approved" if approved else "Submitted") if passed else "Validation Failed"
    submission = Submission(
        participant_id=participant.id,
        integration_id=integration.id,
        template_id=integration.template_id,
        period=uploaded_at.strftime("%B %Y"),
        filename=f"{participant.code}_{uploaded_at:%Y%m}.csv",
        storage_key=storage_key,
        uploaded_at=uploaded_at,
        uploaded_by=uploaded_by,
        result=SubmissionResult.passed if passed else SubmissionResult.failed,
        status=status,
        replaces_submission_id=replaces.id if replaces else None,
        records_received=len(table.rows),
        error_count=len(errors),
        errors=errors,
        warning_count=len(warnings),
        warnings=warnings,
        row_count=transactions,
        numeric_totals=totals,
        breakdowns=breakdowns,
        loaded_at=uploaded_at + timedelta(minutes=2) if passed else None,
        # Older periods have been reviewed; the current month awaits review.
        review_status="Approved" if approved and passed else "Pending Review",
        reviewed_by="Compliance Officer" if approved and passed else "",
        reviewed_at=uploaded_at + timedelta(days=3) if approved and passed else None,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)
    return submission


def seed_transfers(session: Session, participant: Participant, admin: User) -> None:
    """Up to six monthly returns per participant. About one in eight fails
    validation (a corrupted amount) and is corrected by a re-upload two days
    later (§6.4); Nyanza's current return failed and still awaits its
    corrected file."""
    integration = session.exec(
        select(Integration).where(Integration.participant_id == participant.id,
                                  Integration.integration_mode == IntegrationMode.manual.value).order_by(Integration.id)
    ).first()
    if integration is None or session.exec(select(Submission.id).where(Submission.participant_id == participant.id)).first():
        return
    base_rows = {"KVU": 220, "AKS": 60, "MOB": 900, "NYM": 45, "RUS": 70}[participant.code]
    avg_amount = {"KVU": 180000, "AKS": 25000, "MOB": 4000, "NYM": 18000, "RUS": 30000}[participant.code]
    now = datetime.utcnow()
    for offset in range(MONTHS_BACK - 1, -1, -1):
        month_start = month_floor(now) - relativedelta(months=offset)
        if month_start < month_floor(participant.created_at):
            continue  # not onboarded yet this month
        uploaded_at = min(month_start + timedelta(days=random.randint(1, 9), hours=random.randint(8, 16)),
                          now - timedelta(hours=6))
        fails = random.random() < 0.12 or (participant.code == "NYM" and offset == 0)
        data = generate_csv(int(base_rows * random.uniform(0.7, 1.3)), avg_amount)
        if fails:
            # corrupt one row's amount to trigger a real validation failure
            lines = data.decode().splitlines()
            lines[len(lines) // 2] = lines[len(lines) // 2].rsplit(",", 2)[0] + ",not-a-number,POS"
            data = "\n".join(lines).encode()
        attempt = _record_upload(session, participant, integration, data, uploaded_at, admin.full_name, approved=offset > 0)
        corrected_at = uploaded_at + timedelta(days=2)
        if fails and participant.code != "NYM" and corrected_at < now:
            clean = generate_csv(int(base_rows * random.uniform(0.7, 1.3)), avg_amount)
            _record_upload(session, participant, integration, clean, corrected_at, "Compliance Officer",
                           approved=offset > 0, replaces=attempt)

    # Where the history leaves the data source; seeds/pipelines.py and the
    # overdue check refine it.
    history = session.exec(
        select(Submission).where(Submission.integration_id == integration.id).order_by(Submission.uploaded_at)
    ).all()
    passed = [s for s in history if s.result == SubmissionResult.passed]
    if history:
        last = history[-1]
        integration.last_sync_at = last.uploaded_at
        integration.last_sync_records = last.records_received
        integration.last_sync_errors = last.error_count
        integration.last_submission_at = passed[-1].uploaded_at if passed else None
        ok = last.result == SubmissionResult.passed
        integration.status = IntegrationStatus.healthy if ok else IntegrationStatus.failed
        integration.note = (f"SUB-{last.id} ({last.period}) loaded" if ok else
                            f"SUB-{last.id} ({last.period}) failed validation with {last.error_count} error(s)")
        integration.source = IntegrationSource.pipeline
        integration.updated_at = last.uploaded_at
        integration.updated_by = "System"
        session.add(integration)
        session.commit()


def demo_pdf(title: str) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=14)
    pdf.cell(0, 10, title.encode("latin-1", "replace").decode("latin-1"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 6, "Demo document generated by app.seed_demo for RDIP development.")
    return bytes(pdf.output())


def main() -> None:
    init_db()
    init_bucket()

    with Session(engine) as session:
        admin = get_or_create_user(session, "admin@rswitch.rw", "RDIP Admin", UserRole.technical)
        get_or_create_user(session, "business@rswitch.rw", "Business Analyst", UserRole.business)
        get_or_create_user(session, "compliance@rswitch.rw", "Compliance Officer", UserRole.compliance)
        get_or_create_user(session, "compliance.lead@rswitch.rw", "Head of Compliance", UserRole.compliance, is_senior=True)
        get_or_create_user(session, "business.lead@rswitch.rw", "Head of Business", UserRole.business, is_senior=True)

        doc_type_ids = {}
        for dt in DOC_TYPES:
            existing = session.exec(select(RequiredDocumentType).where(RequiredDocumentType.name == dt["name"])).first()
            if not existing:
                existing = RequiredDocumentType(**dt)
                session.add(existing)
                session.commit()
                session.refresh(existing)
            doc_type_ids[dt["name"]] = existing.id

        participants = []
        for spec in PARTICIPANTS:
            existing = session.exec(select(Participant).where(Participant.code == spec["code"])).first()
            if existing:
                # A demo database created before §10.1 fields existed: fill
                # only what is still blank, never overwrite real edits.
                for field, value in (("region", spec["region"]), ("primary_contact_name", spec["contact"][0]),
                                     ("primary_contact_email", spec["contact"][1]), ("short_name", spec["code"])):
                    if not getattr(existing, field):
                        setattr(existing, field, value)
                session.add(existing)
                session.commit()
                participants.append(existing)
                continue
            onboarded_months_ago = {"KVU": 6, "AKS": 5, "MOB": 3, "NYM": 2, "RUS": 1}[spec["code"]]
            joined = month_floor(datetime.utcnow()) - relativedelta(months=onboarded_months_ago) + timedelta(days=2)
            participant = Participant(
                name=spec["name"],
                short_name=spec["code"],
                code=spec["code"],
                type=spec["type"],
                region=spec["region"],
                registration_date=joined.date(),
                primary_contact_name=spec["contact"][0],
                primary_contact_email=spec["contact"][1],
                expected_frequency_days=spec["freq"],
                created_at=joined,
            )
            session.add(participant)
            session.commit()
            session.refresh(participant)

            template = IngestionTemplate(
                participant_id=participant.id, name="Monthly transaction report", version=1, applies_to=spec["name"]
            )
            session.add(template)
            session.commit()
            session.refresh(template)
            columns = [
                TemplateColumn(template_id=template.id, name="transaction_id", type="string", required=True, position=0),
                TemplateColumn(template_id=template.id, name="transaction_date", type="date", required=True, position=1),
                TemplateColumn(template_id=template.id, name="amount", type="number", required=True, position=2),
                TemplateColumn(template_id=template.id, name="channel", type="string", required=False, position=3),
            ]
            session.add_all(columns)
            # The participant's manual data source (§10.2): files sent to
            # RSwitch offline and uploaded by staff, validated against the
            # template, expected on the schedule below.
            session.add(Integration(
                participant_id=participant.id,
                source_name="Monthly transaction report",
                integration_mode=IntegrationMode.manual.value,
                schedule_cron=EXPECTED_SCHEDULE[spec["code"]],
                template_id=template.id,
                note="Configured — awaiting the first transfer",
                created_at=joined,
                created_by=admin.full_name,
                updated_by=admin.full_name,
            ))
            session.commit()

            participants.append(participant)

        for participant in participants:
            seed_transfers(session, participant, admin)

            # Documents: vary status across participants for a believable roster
            doc_plan = {
                "KVU": {"Operating licence": 300, "UAT sign-off": None, "Infosec certification": 20},
                "AKS": {"Operating licence": -10, "UAT sign-off": None},  # expired licence, missing infosec
                "MOB": {"Operating licence": 200, "UAT sign-off": None, "Infosec certification": 200},
                "NYM": {},  # everything missing
                "RUS": {"Operating licence": 45, "Infosec certification": 55},
            }
            for doc_name, days_from_now in doc_plan.get(participant.code, {}).items():
                doc_key = f"documents/{participant.id}/demo-{doc_name.replace(' ', '_')}.pdf"
                put_file(doc_key, demo_pdf(f"{participant.name} - {doc_name}"), "application/pdf")
                if days_from_now is None:
                    expiry = None
                else:
                    expiry = (datetime.utcnow() + timedelta(days=days_from_now)).date()
                session.add(
                    ComplianceDocument(
                        participant_id=participant.id,
                        doc_type_id=doc_type_ids[doc_name],
                        filename=f"{participant.code}_{doc_name.replace(' ', '_')}.pdf",
                        storage_key=f"documents/{participant.id}/demo-{doc_name.replace(' ', '_')}.pdf",
                        expiry_date=expiry,
                    )
                )
            session.commit()

        issue_plan = [
            ("KVU", "Reconciliation mismatch on POS batch", IssueSeverity.medium, IssueStatus.resolved, 5),
            ("AKS", "Two of four expected batches missing this cycle", IssueSeverity.high, IssueStatus.open, 0),
            ("MOB", "Duplicate transaction IDs in weekly file", IssueSeverity.critical, IssueStatus.in_progress, 1),
            ("NYM", "No submissions received in over a month", IssueSeverity.critical, IssueStatus.open, 0),
            ("RUS", "Channel field left blank for most rows", IssueSeverity.low, IssueStatus.closed, 4),
        ]
        code_to_participant = {p.code: p for p in participants}
        for code, description, severity, status, months_ago in issue_plan:
            participant = code_to_participant[code]
            exists = session.exec(select(Issue).where(Issue.description == description)).first()
            if exists:
                continue
            created_at = month_floor(datetime.utcnow()) - timedelta(days=30 * months_ago) + timedelta(days=3)
            session.add(
                Issue(
                    participant_id=participant.id,
                    description=description,
                    severity=severity,
                    assignee="Aline Uwase",
                    status=status,
                    created_at=created_at,
                )
            )
        session.commit()

        if not session.exec(select(ParticipantNote)).first():
            session.add(ParticipantNote(participant_id=code_to_participant["KVU"].id, author="Compliance Officer",
                                        note="Annual audit signed off with no major discrepancies."))
            session.commit()
        run_module_seeds(session)
        created = anomaly.detect(session)
        print(f"Anomaly scan raised {created} alert(s).")

    print("Seed complete.")


if __name__ == "__main__":
    main()
