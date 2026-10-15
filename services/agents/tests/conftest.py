"""Shared pytest fixtures and helpers for the interpretability worker tests.

The client fixture builds the app with logging silenced (``CRITICAL``) so test
output stays clean, while still exercising the full middleware stack (CORS +
correlation-id logging). Deterministic synthetic-data helpers live here so each
test module stays focused on behaviour rather than fixture construction.
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from cogitatome_agents.config import Settings
from cogitatome_agents.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """A TestClient over the real application with quiet logging."""

    return TestClient(create_app(Settings(log_level="CRITICAL")))


def separable_dataset(
    n_per_class: int = 30, dim: int = 4, seed: int = 1, separation: float = 2.0
) -> tuple[list[list[float]], list[int]]:
    """Two well-separated Gaussian blobs (label 1 = +separation, 0 = -separation).

    Blue activations are linearly separable, so a correctly-fit linear probe
    reaches accuracy ≈ 1.0 — the ground truth the probe tests assert against.
    """

    rng = np.random.default_rng(seed)
    positive = rng.normal(separation, 0.3, size=(n_per_class, dim))
    negative = rng.normal(-separation, 0.3, size=(n_per_class, dim))
    activations = np.vstack([positive, negative])
    labels = [1] * n_per_class + [0] * n_per_class
    return activations.round(4).tolist(), labels


def random_activations(n: int = 40, dim: int = 6, seed: int = 0) -> list[list[float]]:
    """A small reproducible activation matrix for SAE training."""

    rng = np.random.default_rng(seed)
    return rng.standard_normal((n, dim)).round(4).tolist()


@pytest.fixture
def random_acts() -> list[list[float]]:
    return random_activations()


@pytest.fixture
def separable() -> tuple[list[list[float]], list[int]]:
    return separable_dataset()
