"""Server-side RBAC (SRS §12.1, §17.2: "enforced server-side on every API
endpoint"). Every login is RSwitch staff with one of three roles; the
matrix below is the single source of truth and is mirrored in
src/lib/roles.ts. Participant institutions never log in — they send files
to RSwitch offline, and staff upload them on their behalf (REQ-INTG-007)."""

from fastapi import Depends, HTTPException

from app.core.security import get_current_user
from app.models.enums import UserRole
from app.models.user import User

C, B, T = UserRole.compliance, UserRole.business, UserRole.technical

# SRS §12.1. Where a specific requirement narrows or widens the matrix the
# requirement wins, and is cited.
CAPS: dict[str, frozenset[UserRole]] = {
    "dashboard.view": frozenset({C, B, T}),
    "integrations.view": frozenset({C, B, T}),
    "integrations.manage": frozenset({T}),
    "integrations.upload": frozenset({C, T}),  # upload on behalf of a participant
    "pipelines.view": frozenset({C, B, T}),
    "pipelines.manage": frozenset({T}),
    # REQ-MAP-009: Standards & Mapping is accessible only to Technical/Admin.
    "mapping.view": frozenset({T}),
    "mapping.manage": frozenset({T}),
    "participant360.view": frozenset({C, B, T}),
    "participant360.notes": frozenset({C}),  # REQ-P360-014
    "participant360.risk_methodology": frozenset({C, B, T}),  # REQ-P360-009 "authorized users"
    "governance.view": frozenset({C, B, T}),
    "governance.manage": frozenset({C}),  # REQ-GOV-011
    "compliance.view": frozenset({C, B, T}),
    "compliance.manage": frozenset({C}),
    "compliance.upload": frozenset({C, T}),
    "ai.view": frozenset({C, B, T}),
    "ai.manage": frozenset({B}),
    # REQ-AI-006: Business and Compliance users manage the alert lifecycle.
    "ai.alerts.transition": frozenset({C, B}),
    "inclusion.view": frozenset({C, B, T}),
    "inclusion.manage": frozenset({B}),
    "reports.view": frozenset({C, B, T}),
    "reports.generate": frozenset({C, B}),
    "reports.schedule": frozenset({C, B}),
    "notifications.view": frozenset({C, B, T}),
    "notifications.manage": frozenset({T}),
    "users.manage": frozenset({T}),
    "settings.view": frozenset({B, T}),
    "settings.manage": frozenset({T}),
    "audit.view": frozenset({C, T}),
}

# §20.1 — the same message whatever the module, so a 403 never reveals what
# exists behind it (REQ-AUTH-010).
FORBIDDEN = "You do not have permission to perform this action."


def has_cap(user: User, cap: str) -> bool:
    return user.role in CAPS[cap]


def require_cap(cap: str):
    if cap not in CAPS:
        raise KeyError(f"Unknown capability {cap}")

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not has_cap(current_user, cap):
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        return current_user

    return dependency


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Any signed-in user. Prefer require_cap with the module's .view cap."""
    return current_user


require_uploader = require_cap("integrations.upload")
require_admin = require_cap("users.manage")


def require_roles(*roles: UserRole):
    """Exact role check (no implicit Technical bypass). Prefer require_cap."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        return current_user

    return dependency
