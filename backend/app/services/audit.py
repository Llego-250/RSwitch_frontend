from typing import Optional

from fastapi import Request
from sqlmodel import Session

from app.db import engine
from app.models.admin import AuditEvent
from app.models.user import User


def record(
    session: Session,
    action: str,
    resource: str = "",
    user: Optional[User] = None,
    request: Optional[Request] = None,
    status: str = "SUCCESS",
    actor_email: str = "",
) -> None:
    """Append one audit event. Uses its own session so it never commits (or
    expires the objects of) the caller's transaction."""
    with Session(engine) as own:
        own.add(
            AuditEvent(
                actor_email=user.email if user else actor_email or "system",
                actor_name=(user.full_name or user.email) if user else "System",
                actor_role=user.role.value if user else "System",
                action=action,
                resource=resource,
                ip_address=(request.client.host if request and request.client else ""),
                status=status,
            )
        )
        own.commit()
