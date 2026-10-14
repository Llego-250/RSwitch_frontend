"""Reports demo data (SRS §5.11): a few generated reports of different types
in the history — each rendered from the demo data by the real report code,
so every file downloads — one recurring schedule per frequency (Daily,
Weekly, Monthly) and saved filter templates (one shared, one private).
Idempotent: does nothing once any report run, schedule or template exists."""

from datetime import timedelta

from sqlmodel import Session, select

from app.models.admin import ReportRun, ReportSchedule, ReportTemplate
from app.models.user import User
from app.services import audit, reporting

# (user, report, format, filters)
RUNS = [
    ("compliance@rswitch.rw", "compliance_summary", "pdf", {"status": "Overdue"}),
    ("compliance@rswitch.rw", "incidents", "xlsx", {}),
    ("admin@rswitch.rw", "integration_health", "pdf", {}),
    ("business@rswitch.rw", "participant_performance", "xlsx", {}),
    ("business@rswitch.rw", "inclusion", "pdf", {}),
    ("compliance.lead@rswitch.rw", "governance_action_items", "pdf", {"status": "Overdue"}),
]
# (user, name, report, format, frequency, filters)
SCHEDULES = [
    ("compliance@rswitch.rw", "Daily overdue compliance", "compliance_summary", "xlsx", "Daily", {"status": "Overdue"}),
    ("business@rswitch.rw", "Weekly participant performance", "participant_performance", "pdf", "Weekly", {}),
    ("business.lead@rswitch.rw", "Monthly financial inclusion", "inclusion", "pdf", "Monthly", {}),
]
# (user, name, report, format, filters, shared)
TEMPLATES = [
    ("compliance@rswitch.rw", "Overdue SACCO obligations", "compliance_summary", "xlsx",
     {"institution_type": "SACCO", "status": "Overdue"}, True),
    ("business@rswitch.rw", "Kigali commercial banks", "participant_performance", "pdf",
     {"institution_type": "Commercial Bank", "region": "Kigali City"}, False),
]


def seed(session: Session) -> None:
    if any(session.exec(select(model.id)).first() is not None for model in (ReportRun, ReportSchedule, ReportTemplate)):
        return
    users = {u.email: u for u in session.exec(select(User)).all()}

    for email, key, fmt, filters in RUNS:
        user = users.get(email)
        if user is None or not reporting.can_generate(user, key):
            continue
        filters = reporting.clean_filters(session, key, filters)
        run = reporting.create_run(session, key, fmt, filters, user)
        reporting.execute_in(session, run)
        audit.record(session, "REPORT_GENERATE", f"RPT-{run.id:04d} {run.name} ({fmt})", user)

    first = reporting.first_slot(session)
    for email, name, key, fmt, frequency, filters in SCHEDULES:
        user = users.get(email)
        if user is None or not reporting.can_generate(user, key):
            continue
        start = first + (timedelta(days=1) if frequency != "Daily" else timedelta())
        session.add(ReportSchedule(name=name, report=key, format=fmt, frequency=frequency,
                                   filters=reporting.clean_filters(session, key, filters),
                                   created_by=user.full_name or user.email, created_by_id=user.id,
                                   start_at=start, next_run_at=start))
    for email, name, key, fmt, filters, shared in TEMPLATES:
        user = users.get(email)
        if user is None:
            continue
        session.add(ReportTemplate(name=name, report=key, format=fmt, filters=reporting.clean_filters(session, key, filters),
                                   owner_id=user.id, owner_name=user.full_name or user.email, shared=shared))
    session.commit()
