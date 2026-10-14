from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.config import settings
from app.core.errors import register_error_handlers
from app.core.metrics import MetricsMiddleware
from app.core.ratelimit import RateLimitMiddleware
from app.core.security import hash_password
from app.db import engine, init_db
from app.models.enums import UserRole
from app.models.user import User
from app.routers import (
    alerts,
    auth,
    compliance,
    dashboard,
    documents,
    governance,
    inclusion,
    integrations,
    issues,
    notifications,
    participants,
    pipelines,
    reports,
    settings as settings_router,
    submissions,
    templates,
    users,
)
from app.services.scheduler import start_scheduler
from app.storage import init_bucket

app = FastAPI(title="RDIP API")
# SRS §20: structured validation errors, no internals in 500s.
register_error_handlers(app)

app.add_middleware(RateLimitMiddleware)
# §15.3 System Health: uptime and 5xx rate of this API instance.
app.add_middleware(MetricsMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the report filename on downloads.
    expose_headers=["Content-Disposition", "X-Report-Run-Id"],
)

for router in (auth.router, participants.router, templates.router, submissions.router,
               integrations.router, documents.router, issues.router, reports.router, users.router,
               settings_router.router, governance.router, alerts.router, notifications.router,
               compliance.router, pipelines.router, inclusion.router, dashboard.router):
    app.include_router(router)


def _seed_admin() -> None:
    with Session(engine) as session:
        if session.exec(select(User)).first():
            return
        session.add(
            User(
                email="admin@rswitch.rw",
                full_name="RDIP Admin",
                hashed_password=hash_password("Rdip-Demo-2026!"),
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
