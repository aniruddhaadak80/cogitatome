# syntax=docker/dockerfile:1
#
# Multi-stage image for the cogitatome interpretability worker.
#
# The service is numpy-only and network-free at runtime, so the final image is a
# slim Python base with a non-root user. Dependencies are resolved once in the
# builder into a virtualenv that is copied wholesale into the runtime stage.
#
# NOTE: Docker is not installed in the authoring environment, so this image has
# not been built or run locally — treat the first `docker build` as the test.

# ---- builder: resolve and install pinned dependencies into a venv ----
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Create an isolated virtualenv that the runtime stage will reuse.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---- runtime: copy the venv and only the code needed to serve ----
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    AGENTS_HOST=0.0.0.0 \
    AGENTS_PORT=8000

# Untrusted code runs as an unprivileged, non-login system user.
RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /app app

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

# Only the package and its bundled corpus are needed at runtime. The service
# runs from source (WORKDIR=/app is on sys.path) so corpus.json resolves at
# /app/corpus.json relative to the package.
COPY cogitatome_agents ./cogitatome_agents
COPY corpus.json ./corpus.json

RUN chown -R app:app /app
USER app

EXPOSE 8000

# Liveness probe against the service's own health endpoint (stdlib only).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)" || exit 1

CMD ["python", "-m", "cogitatome_agents"]
