"""Symmetric encryption for secrets stored in the database (integration
endpoint URLs and credentials — SRS §10.2, §17.2). Values are never logged
or returned in plain text; callers decrypt only at the moment of use."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    raw = settings.encryption_key or settings.jwt_secret
    key = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def mask(value: str, visible: int = 4) -> str:
    """For display: keep only the last few characters."""
    if not value:
        return ""
    return "•" * max(4, len(value) - visible) + value[-visible:]
