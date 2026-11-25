"""Structured logging configuration and per-request correlation ID context."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Return the active HTTP request correlation ID, or '-' outside requests."""
    return request_id_ctx.get()


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class _TripilotStreamHandler(logging.StreamHandler):
    """Tagged StreamHandler subclass so repeated app setups replace cleanly."""


class _JsonLogFormatter(logging.Formatter):
    """Single-line JSON formatter aligned with Google Cloud Logging severity fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(is_dev: bool) -> None:
    """Configure root logging cleanly without duplicating handlers across reloads."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for existing in list(root.handlers):
        if isinstance(existing, _TripilotStreamHandler):
            root.removeHandler(existing)

    handler = _TripilotStreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    if is_dev:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"
            )
        )
    else:
        handler.setFormatter(_JsonLogFormatter())
    root.addHandler(handler)
