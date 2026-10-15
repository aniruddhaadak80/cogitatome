"""FastAPI application object and route wiring for the interpretability worker.

``app`` is created by :func:`create_app` (so tests can build an isolated
instance) and exposed at import time as the module-level ``app`` for
``uvicorn cogitatome_agents.main:app``. Running the module (``python -m
cogitatome_agents``) serves it over uvicorn with :func:`serve`.

Routes (all under ``/v1`` except the health probe):

* ``GET  /healthz``         liveness payload
* ``POST /v1/sae/train``    sparse-autoencoder training
* ``POST /v1/attribution``  logit attribution
* ``POST /v1/probes/fit``   binary linear probe
* ``POST /v1/patch/sweep``  activation-patching sweep
* ``GET  /v1/corpus/search``offline BM25 corpus search
* ``GET  /openapi.json``    generated OpenAPI schema (FastAPI built-in)
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from . import attribution as attribution_mod
from . import patching as patching_mod
from . import probes as probes_mod
from . import sae as sae_mod
from . import search as search_mod
from .config import Settings, get_settings
from .logs import RequestContextMiddleware, configure_logging, get_logger
from .schemas import (
    AttributionRequest,
    AttributionResponse,
    CorpusSearchResponse,
    CorpusSearchResult,
    HealthResponse,
    PatchSweepRequest,
    PatchSweepResponse,
    ProbeFitRequest,
    ProbeFitResponse,
    SAETrainRequest,
    SAETrainResponse,
)

_DESCRIPTION = (
    "cogitatome heavy interpretability worker. Runs the expensive, "
    "deterministic jobs the web UI offloads — sparse-autoencoder training, "
    "logit attribution, linear-probe fitting and activation-patching sweeps — "
    "plus an offline BM25 search over a curated interpretability/safety corpus. "
    "Every endpoint is seeded/reproducible and requires no API keys."
)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and return the FastAPI application."""

    settings = settings or get_settings()
    configure_logging(settings.log_level)
    logger: logging.Logger = get_logger("app")
    logger.info(
        "service.starting",
        extra={"version": settings.version, "config": {"cors_origins": settings.cors_origins}},
    )

    app = FastAPI(
        title=settings.service_name,
        version=settings.version,
        description=_DESCRIPTION,
    )

    # Middleware is added outer-most last: the CORS layer must sit outermost so
    # preflight OPTIONS requests are answered before correlation/logging wrap it.
    app.add_middleware(RequestContextMiddleware, logger=get_logger("http"))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", response_model=HealthResponse, tags=["service"], summary="Liveness probe")
    def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            version=settings.version,
            service=settings.service_name,
        )

    @app.post(
        "/v1/sae/train",
        response_model=SAETrainResponse,
        tags=["interpretability"],
        summary="Train a sparse autoencoder over activation vectors",
    )
    def sae_train(request: SAETrainRequest) -> SAETrainResponse:
        return sae_mod.train_sae(request)

    @app.post(
        "/v1/attribution",
        response_model=AttributionResponse,
        tags=["interpretability"],
        summary="Attribute residual-stream components along the logit direction",
    )
    def attribution(request: AttributionRequest) -> AttributionResponse:
        return attribution_mod.attribute_logits(request)

    @app.post(
        "/v1/probes/fit",
        response_model=ProbeFitResponse,
        tags=["interpretability"],
        summary="Fit a binary linear probe",
    )
    def probe_fit(request: ProbeFitRequest) -> ProbeFitResponse:
        return probes_mod.fit_probe(request)

    @app.post(
        "/v1/patch/sweep",
        response_model=PatchSweepResponse,
        tags=["interpretability"],
        summary="Activation-patching sweep across positions",
    )
    def patch_sweep(request: PatchSweepRequest) -> PatchSweepResponse:
        return patching_mod.patch_sweep(request)

    @app.get(
        "/v1/corpus/search",
        response_model=CorpusSearchResponse,
        tags=["corpus"],
        summary="BM25 search over the offline interpretability corpus",
    )
    def corpus_search(
        q: str = Query(default="", description="Free-text query."),
        kind: str | None = Query(default=None, description="Optional entry-kind filter (e.g. 'paper')."),
        limit: int = Query(default=10, ge=1, le=100, description="Maximum number of results."),
    ) -> CorpusSearchResponse:
        hits = search_mod.search_corpus(query=q, kind=kind, limit=limit)
        results = [CorpusSearchResult(entry=entry, score=score) for entry, score in hits]
        return CorpusSearchResponse(query=q, kind=kind, total=len(results), results=results)

    return app


app = create_app()


def serve() -> None:
    """Serve the application with uvicorn using configured host/port."""

    import uvicorn  # imported lazily so tests don't require a running server dep chain

    settings = get_settings()
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":  # pragma: no cover - exercised via `python -m cogitatome_agents.main`
    serve()
