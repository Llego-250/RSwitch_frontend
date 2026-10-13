"""Financial inclusion demo data: a monthly aggregate inclusion return per
institution — one row per region it serves with counts and totals only
(accounts, active users, transaction count and value), never customer
records (SRS §2.7). Synthetic: RSwitch has not yet confirmed the real fields
(§24.5). Each return goes through the shared ingestion functions (read,
validate, summarise) like any upload; it is validated against an in-memory
column spec rather than a stored template so it never replaces the
participant's transaction template for regular uploads. Idempotent."""

import random
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta
from sqlmodel import Session, select

from app.models.enums import REGIONS, SubmissionResult
from app.models.participant import Participant
from app.models.submission import Submission
from app.models.template import TemplateColumn
from app.models.user import User
from app.services.ingestion import aggregate, identity_fields, read_rows, validate_rows
from app.storage import put_file

MONTHS = 6
COLUMNS = [
    TemplateColumn(template_id=0, name="region", type="enum", rule="regex:" + "|".join(REGIONS), required=True, position=0),
    TemplateColumn(template_id=0, name="accounts", type="number", required=True, position=1),
    TemplateColumn(template_id=0, name="active_users", type="number", required=True, position=2),
    TemplateColumn(template_id=0, name="transaction_count", type="number", required=True, position=3),
    TemplateColumn(template_id=0, name="transaction_value", type="number", required=True, position=4),
]
# The columns follow the pipeline's identity mapping: transaction_count is the
# weight (the transactions each row represents), the rest are summed.
# accounts at the first period, monthly growth, active share, transactions per
# active user per month, average transaction value — by institution type.
PROFILE = {
    "Commercial Bank": (210_000, 0.008, 0.52, 7.5, 92_000),
    "E-money Issuer": (900_000, 0.022, 0.63, 16.0, 5_200),
    "MFI": (25_000, 0.012, 0.47, 2.4, 34_000),
    "SACCO": (12_000, 0.010, 0.41, 1.8, 27_000),
}
SCALE = {"KVU": 410_000, "MOB": 1_850_000, "AKS": 36_000, "NYM": 21_000, "RUS": 14_500,
         "HCS": 11_800, "MFS": 17_500, "NDS": 8_900}
SPREAD = {
    "Commercial Bank": {"Kigali City": 0.45, "Southern Province": 0.15, "Eastern Province": 0.15,
                        "Northern Province": 0.12, "Western Province": 0.13},
    "E-money Issuer": {"Kigali City": 0.30, "Southern Province": 0.18, "Eastern Province": 0.20,
                       "Northern Province": 0.15, "Western Province": 0.17},
}
NEIGHBOUR = {"Kigali City": "Eastern Province", "Eastern Province": "Kigali City", "Southern Province": "Western Province",
             "Western Province": "Northern Province", "Northern Province": "Kigali City"}


def _regions(p: Participant) -> dict[str, float]:
    home = p.region or REGIONS[0]
    if p.type in SPREAD:
        return SPREAD[p.type]
    if p.type == "MFI":
        return {home: 0.75, NEIGHBOUR[home]: 0.25}
    return {home: 1.0}


def _return(rng: random.Random, p: Participant, months_in: int) -> bytes:
    base, growth, active, tx_per_user, avg_value = PROFILE[p.type]
    accounts_total = SCALE.get(p.code, base) * (1 + growth) ** months_in
    lines = ["region,accounts,active_users,transaction_count,transaction_value"]
    for region, share in _regions(p).items():
        accounts = int(accounts_total * share * rng.uniform(0.98, 1.02))
        users = int(accounts * active * rng.uniform(0.96, 1.04))
        count = int(users * tx_per_user * rng.uniform(0.92, 1.08))
        value = round(count * avg_value * rng.uniform(0.9, 1.1))
        lines.append(f"{region},{accounts},{users},{count},{value}")
    return "\n".join(lines).encode()


def seed(session: Session) -> None:
    rng = random.Random(4207)
    now = datetime.utcnow()
    this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    staff = session.exec(select(User).where(User.email == "compliance@rswitch.rw")).first()
    uploader = staff.full_name if staff else "Compliance Officer"
    existing = set(session.exec(select(Submission.filename)).all())

    for p in session.exec(select(Participant).order_by(Participant.id)).all():
        if p.type not in PROFILE:
            continue
        onboarded = p.created_at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for offset in range(MONTHS, 0, -1):
            period = this_month - relativedelta(months=offset)
            if period < onboarded:
                continue
            filename = f"{p.code}_FIN_{period:%Y%m}.csv"
            # Returns arrive in the first days of the following month.
            uploaded = period + relativedelta(months=1) + timedelta(days=rng.randint(3, 7), hours=10)
            if filename in existing or uploaded > now:
                continue
            data = _return(rng, p, (period.year - onboarded.year) * 12 + period.month - onboarded.month)
            table = read_rows(filename, data)
            errors, warnings = validate_rows(table, COLUMNS)
            if errors:
                raise ValueError(f"Synthetic inclusion return {filename} failed validation: {errors[:3]}")
            transactions, totals, breakdowns = aggregate(table.rows, *identity_fields(COLUMNS))
            key = f"submissions/{p.id}/demo-inclusion-{p.code}-{period:%Y%m}.csv"
            put_file(key, data, "text/csv")
            latest = offset == 1
            session.add(Submission(
                participant_id=p.id, template_id=None, period=period.strftime("%B %Y"), filename=filename,
                storage_key=key, uploaded_at=uploaded, uploaded_by=uploader, result=SubmissionResult.passed,
                records_received=len(table.rows), row_count=transactions, numeric_totals=totals,
                breakdowns=breakdowns, warnings=warnings, warning_count=len(warnings), loaded_at=uploaded,
                status="Under Review" if latest else "Approved",
                review_status="Pending Review" if latest else "Approved",
                reviewed_by="" if latest else uploader,
                reviewed_at=None if latest else uploaded + timedelta(days=2),
            ))
            existing.add(filename)
    session.commit()
