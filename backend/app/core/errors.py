"""Error responses (SRS §20).

§20.1: a 500 must never leak internals — the client gets the fixed
user-facing message and the traceback goes to the server log.
§20.2: validation errors are a JSON array of {field, rule, message} so the
UI can show each message next to its input. FastAPI's own request
validation (422) is reshaped into the same array."""

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler as default_http_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

log = logging.getLogger("rdip.errors")

INTERNAL_ERROR = "Something went wrong on our end. The technical team has been notified."


class CodedHTTPException(HTTPException):
    """An HTTPException with a machine-readable `code` next to the message,
    e.g. "session_idle" so the UI can tell an inactivity sign-out from any
    other 401."""

    def __init__(self, status_code: int, detail: str, code: str, headers: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code


def problem(field: str, rule: str, message: str) -> dict:
    return {"field": field, "rule": rule, "message": message}


def validation_error(problems: list[dict], status_code: int = 422) -> HTTPException:
    """Raise-able §20.2 error: `raise validation_error([problem(...)])`."""
    return HTTPException(status_code=status_code, detail=problems)


def _field_name(loc: tuple) -> str:
    # ("body", "email") -> "email"; ("query", "date_from") -> "date_from"
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(parts) or "request"


async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    problems = [problem(_field_name(tuple(e.get("loc", ()))), str(e.get("type", "invalid")), str(e.get("msg", "Invalid value")))
                for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": problems})


async def _http_handler(request: Request, exc: StarletteHTTPException):
    code = getattr(exc, "code", None)
    if not code:
        return await default_http_handler(request, exc)
    return JSONResponse({"detail": exc.detail, "code": code}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    response = JSONResponse(status_code=500, content={"detail": INTERNAL_ERROR})
    # This handler runs outside the CORS middleware; without the header the
    # browser would hide the message behind a CORS failure.
    origin = request.headers.get("origin")
    allowed = [o.strip() for o in settings.cors_origins.split(",")]
    if origin and origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
