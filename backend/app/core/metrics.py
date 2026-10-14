"""Request metrics behind the Technical/Admin dashboard's System Health
widget (SRS §15.3): how long this API process has been up and the share of
requests it answered with a 5xx over a recent window. In-process, so the
figures are per API instance and restart with it — like the rate limiter."""

import threading
import time
from collections import deque
from datetime import datetime

STARTED_AT = datetime.utcnow()
_STARTED_MONOTONIC = time.monotonic()
KEEP_SECONDS = 24 * 3600
MAX_EVENTS = 500_000  # bounds memory under heavy load; oldest dropped first


class RequestMetrics:
    def __init__(self):
        self._events: deque = deque(maxlen=MAX_EVENTS)  # (monotonic time, is_5xx)
        self._lock = threading.Lock()

    def record(self, status: int) -> None:
        now = time.monotonic()
        with self._lock:
            self._events.append((now, status >= 500))
            while self._events and self._events[0][0] < now - KEEP_SECONDS:
                self._events.popleft()

    def snapshot(self, window_seconds: int) -> dict:
        since = time.monotonic() - window_seconds
        with self._lock:
            recent = [is_error for at, is_error in self._events if at >= since]
        errors = sum(recent)
        return {
            "requests": len(recent),
            "errors_5xx": errors,
            "error_rate_pct": round(errors / len(recent) * 100, 2) if recent else None,
            "window_minutes": window_seconds // 60,
        }


metrics = RequestMetrics()


def uptime_seconds() -> int:
    return int(time.monotonic() - _STARTED_MONOTONIC)


class MetricsMiddleware:
    """Pure ASGI (streams pass through untouched). An exception escaping the
    app is a 500 to the client, so it counts as one."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            metrics.record(500)
            raise
        metrics.record(status["code"])
