from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.config import settings
from app.core.security import hash_password
from app.db import engine, init_db
from app.models.enums import UserRole
from app.models.user import User
from app.routers import auth, documents, integrations, issues, participants, reports, submissions, templates
from app.services.scheduler import start_scheduler
from app.storage import init_bucket

app = FastAPI(title="RDIP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, participants.router, templates.router, submissions.router,
               integrations.router, documents.router, issues.router, reports.router):
    app.include_router(router)


def _seed_admin() -> None:
    with Session(engine) as session:
        if session.exec(select(User)).first():
            return
        session.add(
            User(
                email="admin@rswitch.rw",
                full_name="RDIP Admin",
                hashed_password=hash_password("changeme123"),
                role=UserRole.technical,
            )
        )
        session.commit()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    init_bucket()
    _seed_admin()
    app.state.scheduler = start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}
