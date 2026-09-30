import hashlib
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.models.admin import ApiKey
from app.models.user import User

# auto_error=False so a request may authenticate with X-API-Key instead.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token", auto_error=False)

MFA_TOKEN_MINUTES = 5


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create_access_token(subject: str, minutes: Optional[int] = None, scope: str = "access") -> str:
    expire = datetime.utcnow() + timedelta(minutes=minutes or settings.jwt_expires_minutes)
    payload = {"sub": subject, "exp": expire, "scope": scope}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, scope: str = "access") -> str:
    """Returns the subject (email) or raises 401. An MFA-pending token can't
    be used as an access token and vice versa."""
    error = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise error
    if payload.get("scope", "access") != scope or not payload.get("sub"):
        raise error
    return payload["sub"]


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user: Optional[User] = None
    if token:
        email = decode_token(token)
        user = session.exec(select(User).where(User.email == email)).first()
    elif x_api_key:
        key = session.exec(
            select(ApiKey).where(ApiKey.key_hash == hash_api_key(x_api_key), ApiKey.is_active == True)  # noqa: E712
        ).first()
        if key:
            key.last_used_at = datetime.utcnow()
            session.add(key)
            session.commit()
            user = session.get(User, key.user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user
