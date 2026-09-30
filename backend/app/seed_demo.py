"""Seed realistic multi-month demo data so the board trend graphs and
participant portal have something real to show. Every submission is a real
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
from app.models.integration import Integration
from app.models.issue import Issue
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import IngestionTemplate, TemplateColumn
from app.models.user import User
from app.services.ingestion import read_rows, summarize_rows, validate_rows
from app.storage import init_bucket, put_file

random.seed(7)

PARTICIPANTS = [
    dict(name="Kivu Commercial Bank", code="KVU", type="Commercial bank", freq=30),
    dict(name="Akagera Savings & Credit", code="AKS", type="Microfinance", freq=7),
    dict(name="MobiPesa Rwanda", code="MOB", type="Mobile money", freq=1),
    dict(name="Nyanza Microfinance", code="NYM", type="Microfinance", freq=30),
    dict(name="Rubavu Union SACCO", code="RUS", type="SACCO", freq=30),
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


def get_or_create_user(session: Session, email: str, full_name: str, role: UserRole, participant_id=None) -> User:
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password("changeme123"),
        role=role,
        participant_id=participant_id,
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


def main() -> None:
    init_db()
    init_bucket()

    with Session(engine) as session:
        admin = get_or_create_user(session, "admin@rswitch.rw", "RDIP Admin", UserRole.technical)
        get_or_create_user(session, "board@rswitch.rw", "Board Viewer", UserRole.board)
        get_or_create_user(session, "compliance@rswitch.rw", "Compliance Officer", UserRole.compliance)

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
                participants.append(existing)
                continue
            onboarded_months_ago = {"KVU": 6, "AKS": 5, "MOB": 3, "NYM": 2, "RUS": 1}[spec["code"]]
            participant = Participant(
                name=spec["name"],
                code=spec["code"],
                type=spec["type"],
                expected_frequency_days=spec["freq"],
                created_at=month_floor(datetime.utcnow()) - relativedelta(months=onboarded_months_ago) + timedelta(days=2),
            )
            session.add(participant)
            session.commit()
            session.refresh(participant)
            session.add(Integration(participant_id=participant.id))
            session.commit()

            login_email = f"ops@{spec['code'].lower()}.rw"
            get_or_create_user(session, login_email, f"{spec['name']} Ops", UserRole.participant, participant.id)

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
            session.commit()

            participants.append(participant)

        for participant in participants:
            template = session.exec(
                select(IngestionTemplate).where(IngestionTemplate.participant_id == participant.id)
            ).first()
            columns = session.exec(
                select(TemplateColumn).where(TemplateColumn.template_id == template.id)
            ).all()

            base_rows = {"KVU": 220, "AKS": 60, "MOB": 900, "NYM": 45, "RUS": 70}[participant.code]
            avg_amount = {"KVU": 180000, "AKS": 25000, "MOB": 4000, "NYM": 18000, "RUS": 30000}[participant.code]

            last_passed_at = None
            for offset in range(MONTHS_BACK - 1, -1, -1):
                month_start = month_floor(datetime.utcnow()) - relativedelta(months=offset)
                if month_start < month_floor(participant.created_at):
                    continue  # not onboarded yet this month
                uploaded_at = month_start + timedelta(days=random.randint(1, 20))
                period_label = uploaded_at.strftime("%B %Y")

                fails = random.random() < 0.12
                row_count = int(base_rows * random.uniform(0.7, 1.3))
                data = generate_csv(row_count, avg_amount)
                if fails:
                    # corrupt one row's amount to trigger a real validation failure
                    lines = data.decode().splitlines()
                    lines[len(lines) // 2] = lines[len(lines) // 2].rsplit(",", 2)[0] + ",not-a-number,POS"
                    data = "\n".join(lines).encode()

                rows = read_rows("demo.csv", data)
                errors = validate_rows(rows, columns)
                result = SubmissionResult.failed if errors else SubmissionResult.passed
                row_count_actual, numeric_totals = summarize_rows(rows, columns) if not errors else (0, {})

                storage_key = f"submissions/{participant.id}/demo-{participant.code}-{uploaded_at.strftime('%Y%m')}.csv"
                put_file(storage_key, data, "text/csv")

                submission = Submission(
                    participant_id=participant.id,
                    template_id=template.id,
                    period=period_label,
                    filename=f"{participant.code}_{uploaded_at.strftime('%Y%m')}.csv",
                    storage_key=storage_key,
                    uploaded_at=uploaded_at,
                    uploaded_by=admin.full_name,
                    result=result,
                    error_count=len(errors),
                    errors=errors[:5],
                    row_count=row_count_actual,
                    numeric_totals=numeric_totals,
                )
                session.add(submission)
                if result == SubmissionResult.passed:
                    last_passed_at = uploaded_at
            session.commit()

            integration = session.exec(
                select(Integration).where(Integration.participant_id == participant.id)
            ).first()
            integration.last_submission_at = last_passed_at
            if participant.code == "NYM":
                integration.status = IntegrationStatus.disconnected
                integration.note = "Certificate expired on their side. Reconnection planned."
                integration.source = IntegrationSource.schedule_check
            elif participant.code == "AKS":
                integration.status = IntegrationStatus.degraded
                integration.note = "Two of four expected batches missing this cycle."
                integration.source = IntegrationSource.schedule_check
            session.add(integration)
            session.commit()

            # Documents: vary status across participants for a believable roster
            doc_plan = {
                "KVU": {"Operating licence": 300, "UAT sign-off": None, "Infosec certification": 20},
                "AKS": {"Operating licence": -10, "UAT sign-off": None},  # expired licence, missing infosec
                "MOB": {"Operating licence": 200, "UAT sign-off": None, "Infosec certification": 200},
                "NYM": {},  # everything missing
                "RUS": {"Operating licence": 45, "Infosec certification": 55},
            }
            for doc_name, days_from_now in doc_plan.get(participant.code, {}).items():
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

    print("Seed complete.")


if __name__ == "__main__":
    main()
