"""API rate limiting (SRS §17.2): 100 requests/minute per user and 1000/minute
per client IP, over a sliding 60-second window. In-process, so limits are
per API instance — enough for the single-server v1 deployment (§17.6.3)."""

import hashlib
import threading
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

WINDOW_SECONDS = 60
EXEMPT_PATHS = {"/health"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _allow(self, key: str, limit: int, now: float) -> bool:
        hits = self._hits[key]
        while hits and hits[0] <= now - WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True

    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled or request.method == "OPTIONS" or request.url.path in EXEMPT_PATHS:
            return await call_next(request)
        now = time.monotonic()
        ip = request.client.host if request.client else "unknown"
        credential = request.headers.get("authorization") or request.headers.get("x-api-key") or ""
        with self._lock:
            allowed = self._allow(f"ip:{ip}", settings.rate_limit_per_ip, now)
            if allowed and credential:
                user_key = "user:" + hashlib.sha256(credential.encode()).hexdigest()
                allowed = self._allow(user_key, settings.rate_limit_per_user, now)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a moment before trying again."},
                headers={"Retry-After": str(WINDOW_SECONDS)},
            )
        return await call_next(request)
