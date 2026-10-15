"""cogitatome heavy interpretability worker package.

A deterministic FastAPI service exposing sparse-autoencoder training, logit
attribution, linear-probe fitting, activation-patching sweeps and an offline
BM25 search over a curated interpretability/safety corpus.

The FastAPI application object lives in :mod:`cogitatome_agents.main` (the
``app`` symbol); run the service with ``python -m cogitatome_agents`` or
``uvicorn cogitatome_agents.main:app``.
"""

__version__ = "0.1.0"

__all__ = ["__version__"]
