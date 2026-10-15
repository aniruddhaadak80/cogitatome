"""Runtime configuration for the interpretability worker.

Configuration is read at startup from environment variables via
:meth:`Settings.load` and carried by an immutable :class:`Settings` value
object. Nothing here reads secrets — the service is entirely offline — so the
only tunables are CORS policy and log verbosity.

Environment variables
---------------------
``CORS_ORIGINS``
    Comma-separated list of allowed origins for
    :meth:`starlette.middleware.cors.CORSMiddleware`. ``*`` (the default) means
    "reflect the caller's origin" — convenient for local development. Use a
    comma-separated allow-list in production.
``LOG_LEVEL``
    One of the standard :mod:`logging` level names (default ``INFO``).
``AGENTS_HOST`` / ``AGENTS_PORT``
    Bind address for ``python -m cogitatome_agents`` (defaults 127.0.0.1:8000).
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


class Settings(BaseModel):
    """Immutable, validated service configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "cogitatome-agents"
    version: str = "0.1.0"
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = False
    log_level: str = "INFO"
    host: str = "127.0.0.1"
    port: int = 8000

    @classmethod
    def load(cls) -> Settings:
        """Build settings from the current process environment."""

        raw = os.environ.get("CORS_ORIGINS", "*")
        origins = _parse_cors_origins(raw)
        return cls(
            cors_origins=origins,
            # Cookies are incompatible with a wildcard origin list; only allow
            # them when the operator pinned a specific origin.
            cors_allow_credentials="*" not in origins,
            log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
            host=os.environ.get("AGENTS_HOST", "127.0.0.1"),
            port=int(os.environ.get("AGENTS_PORT", "8000")),
        )


def _parse_cors_origins(raw: str) -> list[str]:
    origins = [item.strip() for item in raw.split(",")]
    origins = [item for item in origins if item]
    return origins or ["*"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide cached settings snapshot."""

    return Settings.load()
