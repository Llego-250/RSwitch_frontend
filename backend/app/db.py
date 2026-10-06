from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine, select

from app.config import settings

engine = create_engine(settings.database_url, echo=False)


def init_db() -> None:
    import app.models  # noqa: F401  (register every table before create_all)

    SQLModel.metadata.create_all(engine)
    _upgrade_existing_schema()


def _upgrade_existing_schema() -> None:
    """create_all never alters existing tables, so patch the few changes an
    older database needs: the uploaded_by column on compliance documents, and
    deactivating leftover participant logins (participants no longer sign in)."""
    from app.models.enums import UserRole
    from app.models.user import User

    columns = {c["name"] for c in inspect(engine).get_columns("compliancedocument")}
    if "uploaded_by" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE compliancedocument ADD COLUMN uploaded_by VARCHAR NOT NULL DEFAULT ''"))

    with Session(engine) as session:
        for user in session.exec(select(User).where(User.role == UserRole.participant, User.is_active == True)).all():  # noqa: E712
            user.is_active = False
            session.add(user)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
