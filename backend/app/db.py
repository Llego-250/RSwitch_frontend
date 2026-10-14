import json

import sqlalchemy as sa
from pydantic_core import PydanticUndefined
from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine, select

from app.config import settings

engine = create_engine(settings.database_url, echo=False)


def init_db() -> None:
    import app.models  # noqa: F401  (register every table before create_all)

    SQLModel.metadata.create_all(engine)
    _sync_columns()
    _upgrade_existing_schema()


def _model_default(cls, column_name: str):
    """The Python-side default a model declares for a field, used to backfill
    a column added to an existing table."""
    field = getattr(cls, "model_fields", {}).get(column_name)
    if field is None:
        return None
    if field.default_factory is not None:
        return field.default_factory()
    if field.default is PydanticUndefined:
        return None
    return field.default


def _sync_columns() -> None:
    """create_all creates missing tables but never alters existing ones. Add
    any column a model gained since the database was created (backfilled
    with the model's default), and on Postgres add new members to native
    enum types. Lightweight stand-in for migrations: additive changes only."""
    insp = inspect(engine)
    postgres = engine.dialect.name == "postgresql"
    for mapper in SQLModel._sa_registry.mappers:
        cls, table = mapper.class_, mapper.local_table
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            value = _model_default(cls, column.name)
            with engine.begin() as conn:
                if postgres and isinstance(column.type, sa.Enum):
                    column.type.create(conn, checkfirst=True)
                ddl = column.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl}'))
                if value is not None:
                    if isinstance(column.type, sa.JSON) and not isinstance(value, (dict, list)):
                        value = json.loads(value)
                    conn.execute(table.update().values({column.name: value}))
        if postgres:
            _extend_pg_enums(table)


def _extend_pg_enums(table: sa.Table) -> None:
    for column in table.columns:
        if not isinstance(column.type, sa.Enum) or not column.type.name:
            continue
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            labels = set(
                conn.execute(
                    text("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :n"),
                    {"n": column.type.name},
                ).scalars()
            )
            for member in column.type.enums:
                if member not in labels:
                    conn.execute(text(f"ALTER TYPE \"{column.type.name}\" ADD VALUE IF NOT EXISTS '{member}'"))


# Old free-text participant types → the four SRS institution types (§10.1).
_INSTITUTION_TYPE_ALIASES = {
    "commercial bank": "Commercial Bank",
    "bank": "Commercial Bank",
    "mobile money": "E-money Issuer",
    "e-money issuer": "E-money Issuer",
    "emi": "E-money Issuer",
    "microfinance": "MFI",
    "microfinance institution": "MFI",
    "mfi": "MFI",
    "sacco": "SACCO",
}


def _upgrade_integrations() -> None:
    """Integration rows from before data sources (REQ-INTG-001): a participant
    may now have several, so the unique index on participant_id becomes a
    plain one; and statuses take the SRS §9.1 words. Enum columns store
    member NAMES, so rows are rewritten in SQL before the ORM ever reads one
    (an old name would not load). Portable SQLite/Postgres; idempotent."""
    insp = inspect(engine)
    if not insp.has_table("integration"):
        return
    for index in insp.get_indexes("integration"):
        if index["name"] == "ix_integration_participant_id" and index.get("unique"):
            with engine.begin() as conn:
                conn.execute(text("DROP INDEX ix_integration_participant_id"))
                conn.execute(text("CREATE INDEX ix_integration_participant_id ON integration (participant_id)"))
    # Compare as text: on a database created fresh, the Postgres enum type
    # has no old labels, and `status = 'connected'` would be an invalid
    # enum literal rather than simply matching nothing.
    status = "CAST(status AS VARCHAR)"
    with engine.begin() as conn:
        # "Connected" said nothing about data received: Healthy only if a
        # transfer ever succeeded, otherwise Pending.
        conn.execute(text(f"UPDATE integration SET status = 'healthy' WHERE {status} = 'connected' AND last_submission_at IS NOT NULL"))
        conn.execute(text(f"UPDATE integration SET status = 'pending' WHERE {status} = 'connected'"))
        for old, new in (("degraded", "warning"), ("disconnected", "failed"), ("maintenance", "paused")):
            conn.execute(text(f"UPDATE integration SET status = '{new}' WHERE {status} = '{old}'"))
        # Pre-data-source rows have no expected schema linked; use the
        # participant's latest ingestion template (what uploads fell back to).
        conn.execute(text(
            "UPDATE integration SET template_id = (SELECT t.id FROM ingestiontemplate t"
            " WHERE t.participant_id = integration.participant_id ORDER BY t.version DESC, t.id DESC LIMIT 1)"
            " WHERE template_id IS NULL"
        ))


def _upgrade_existing_schema() -> None:
    """Data fixes an older database needs. Every step is idempotent."""
    from app.models.enums import UserRole
    from app.models.participant import Participant
    from app.models.user import User

    _upgrade_integrations()
    with Session(engine) as session:
        # Participants no longer sign in.
        for user in session.exec(select(User).where(User.role == UserRole.participant, User.is_active == True)).all():  # noqa: E712
            user.is_active = False
            session.add(user)
        # The SRS defines three roles; the old Board viewer becomes Business.
        for user in session.exec(select(User).where(User.role == UserRole.board)).all():
            user.role = UserRole.business
            session.add(user)
        for participant in session.exec(select(Participant)).all():
            canonical = _INSTITUTION_TYPE_ALIASES.get((participant.type or "").strip().lower())
            if canonical and participant.type != canonical:
                participant.type = canonical
                session.add(participant)
            if participant.registration_date is None and participant.created_at:
                participant.registration_date = participant.created_at.date()
                session.add(participant)
            if not participant.short_name:
                participant.short_name = participant.code
                session.add(participant)
            if not participant.is_active and participant.status == "Active":
                participant.status = "Inactive"
                session.add(participant)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session

