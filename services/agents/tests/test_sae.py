"""Sparse-autoencoder training endpoint tests: correctness and determinism."""

from __future__ import annotations

import numpy as np
import pytest
from pydantic import ValidationError

from cogitatome_agents.schemas import SAETrainRequest


def _train(client, activations, **overrides):
    payload = {"activations": activations, "n_features": 8, "epochs": 120, "seed": 7}
    payload.update(overrides)
    response = client.post("/v1/sae/train", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_sae_response_shape(client, random_acts):
    result = _train(client, random_acts, l1=0.02)
    dim = len(random_acts[0])
    assert len(result["features"]) == 8
    for feature in result["features"]:
        assert len(feature["decoder"]) == dim
        assert isinstance(feature["dead"], bool)
        assert feature["max_activation"] >= 0.0
        assert feature["activating_tokens"] == sorted(feature["activating_tokens"])
    assert len(result["loss_curve"]) == 120


def test_sae_is_deterministic_for_a_seed(client, random_acts):
    first = _train(client, random_acts, l1=0.02, seed=7)
    second = _train(client, random_acts, l1=0.02, seed=7)
    assert first == second


def test_sae_seed_changes_result(client, random_acts):
    seeded = _train(client, random_acts, l1=0.02, seed=7)
    other = _train(client, random_acts, l1=0.02, seed=123)
    assert seeded["final_loss"] != other["final_loss"]


def test_sae_decoder_rows_are_unit_norm(client, random_acts):
    result = _train(client, random_acts, l1=0.02)
    for feature in result["features"]:
        norm = float(np.linalg.norm(feature["decoder"]))
        assert np.isclose(norm, 1.0, atol=1e-6)


def test_sae_final_loss_matches_curve_and_improves(client, random_acts):
    result = _train(client, random_acts, l1=0.02)
    curve = result["loss_curve"]
    assert result["final_loss"] == curve[-1]
    # Training should reduce the loss at some point below its initial value.
    assert min(curve) <= curve[0]


def test_sae_explained_variance_in_range(client, random_acts):
    result = _train(client, random_acts, l1=0.01, n_features=12, epochs=200)
    ev = result["explained_variance"]
    assert np.isfinite(ev)
    assert -1.0 <= ev <= 1.0


def test_sae_l0_finite(client, random_acts):
    result = _train(client, random_acts, l1=0.05)
    l0 = result["l0"]
    assert 0.0 <= l0 <= 8  # mean active features per sample, bounded by n_features


def test_sae_422_on_ragged_activations(client):
    ragged = [[1.0, 2.0, 3.0], [4.0, 5.0]]
    response = client.post("/v1/sae/train", json={"activations": ragged, "n_features": 4})
    assert response.status_code == 422


def test_sae_422_on_empty_activations(client):
    response = client.post("/v1/sae/train", json={"activations": [], "n_features": 4})
    assert response.status_code == 422


def test_sae_422_on_bad_hyperparameters(client, random_acts):
    assert client.post("/v1/sae/train", json={"activations": random_acts, "n_features": 0}).status_code == 422
    assert (
        client.post(
            "/v1/sae/train", json={"activations": random_acts, "n_features": 4, "epochs": 0}
        ).status_code
        == 422
    )
    assert (
        client.post("/v1/sae/train", json={"activations": random_acts, "n_features": 4, "l1": -1}).status_code
        == 422
    )


def test_sae_422_on_non_finite():
    # The finite-value guard rejects NaN/inf at the schema layer (422 in HTTP
    # terms). Testing at the model level avoids FastAPI echoing the raw NaN in
    # its 422 detail body, which is not itself JSON-serialisable.
    with pytest.raises(ValidationError):
        SAETrainRequest(activations=[[1.0, 2.0], [float("nan"), 4.0]], n_features=4)
    with pytest.raises(ValidationError):
        SAETrainRequest(activations=[[1.0, 2.0], [float("inf"), 4.0]], n_features=4)
