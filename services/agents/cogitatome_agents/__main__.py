"""``python -m cogitatome_agents`` entry point.

Serves the FastAPI application over uvicorn, honouring ``AGENTS_HOST`` /
``AGENTS_PORT`` from the environment. Described fully in the service README.
"""

from __future__ import annotations

from .main import serve


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
