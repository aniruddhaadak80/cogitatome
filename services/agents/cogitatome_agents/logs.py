"""Structured request logging and correlation-id plumbing for the service.

This module provides:

* a JSON formatter that emits one structured object per log record, so that a
  log aggregator can index ``level``, ``event``, ``request_id`` and friends
  instead of parsing free-text lines;
* a :class:`contextvars.ContextVar` carrying the current request id, populated
  by :class:`RequestContextMiddleware` for every inbound HTTP request;
* an ASGI middleware that assigns a correlation id (honouring an inbound
  ``X-Request-ID`` header when the caller supplied one), records one access log
  line per request and echoes the id back on the response header.

Everything here is deterministic-safe: no wall-clock time is captured, only
monotonic per-request latency, so tests never depend on the system clock.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

REQUEST_ID_HEADER = "X-Request-ID"

# Per-request correlation id. Defaults to a process-random value so that any
# log emitted outside a request context still carries *something* useful.
request_id_var: ContextVar[str] = ContextVar("cogitatome_request_id", default="no-request")


def get_request_id() -> str:
    """Return the correlation id bound to the current execution context."""

    return request_id_var.get()


class RequestIdFilter(logging.Filter):
    """Inject the active ``request_id`` into every emitted :class:`LogRecord`."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003 - logging API name
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()  # type: ignore[attr-defined]
        return True


class JsonFormatter(logging.Formatter):
    """Render a :class:`LogRecord` as a single-line JSON object.

    Well-known :mod:`logging` attributes are mapped to stable lowercase keys and
    any extra attributes (those injected via ``logger.info(..., extra={...})``,
    by :class:`RequestIdFilter`, or by correlation middleware) are surfaced as
    sibling keys. This keeps access logs and application logs in one schema.
    """

    _RESERVED = frozenset(
        {
            "name",
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
            "taskName",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
        }
        payload.update(self._extra(record))
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str, sort_keys=True)

    def _extra(self, record: logging.LogRecord) -> dict[str, object]:
        extra: dict[str, object] = {}
        for key, value in vars(record).items():
            if key in self._RESERVED or key.startswith("_"):
                continue
            if key == "request_id":
                continue  # added explicitly below for stable ordering
            if _is_sensitive(key):
                continue
            extra[key] = value
        extra["request_id"] = getattr(record, "request_id", get_request_id())
        return extra


def _is_sensitive(key: str) -> bool:
    """Return ``True`` for attribute names that must never be logged."""

    lowered = key.lower()
    return any(token in lowered for token in ("key", "secret", "token", "password", "authorization"))


def configure_logging(level: str = "INFO") -> None:
    """Install the JSON formatter on the root logger (idempotent-ish).

    Existing handlers from prior calls are removed so that repeated calls, e.g.
    one per test, do not fan out duplicate lines.
    """

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())
    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger that emits through the JSON formatter."""

    return logging.getLogger(f"cogitatome_agents.{name}")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign and propagate a correlation id, then log one access line/request.

    The middleware honours an inbound ``X-Request-ID``; when absent it mints a
    short random hex id. The id is bound to a contextvar for the duration of the
    request (so application handlers' logs are correlated), attached to the
    response, and summarised in a structured access log on completion.
    """

    def __init__(self, app: ASGIApp, logger: logging.Logger | None = None) -> None:
        super().__init__(app)
        self._log = logger or get_logger("http")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        inbound = request.headers.get(REQUEST_ID_HEADER)
        request_id = _sanitise(inbound) if inbound else uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            request_id_var.reset(token)
            duration_ms = round((time.perf_counter() - started) * 1000, 3)
            self._log.info(
                "request.complete",
                extra={
                    "http": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": status_code,
                    },
                    "duration_ms": duration_ms,
                },
            )


def _sanitise(candidate: str) -> str:
    """Coerce a caller-supplied request id into a safe token."""

    cleaned = candidate.strip()
    if not cleaned or len(cleaned) > 128 or any(ch.isspace() for ch in cleaned):
        return uuid.uuid4().hex[:16]
    return cleaned
