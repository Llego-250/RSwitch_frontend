"""Role-aware dashboard data (SRS §5.2, §15)."""

from fastapi import APIRouter

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
