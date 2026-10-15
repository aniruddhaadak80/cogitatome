"""Logit-attribution endpoint tests: math, ordering, normalisation, validation."""

from __future__ import annotations

import numpy as np


def _attribute(client, logits, components, top_k=5):
    response = client.post(
        "/v1/attribution",
        json={"logits": logits, "components": components, "top_k": top_k},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_projection_matches_manual_dot(client):
    logits = [1.0, 0.0, -2.0]
    components = [
        {"name": "embed", "vector": [2.0, 0.0, 0.0]},
        {"name": "attn", "vector": [-1.0, 0.0, 0.0]},
        {"name": "mlp", "vector": [0.0, 3.0, 0.0]},
    ]
    result = _attribute(client, logits, components)
    direction = np.asarray(logits) / np.linalg.norm(logits)
    for item, comp in zip(
        sorted(result["attributions"], key=lambda r: r["name"]), sorted(components, key=lambda c: c["name"]), strict=False
    ):
        expected = float(np.asarray(comp["vector"]) @ direction)
        assert np.isclose(item["projection"], expected)


def test_positive_and_negative_split(client):
    logits = [1.0, 0.0, -2.0]
    components = [
        {"name": "pos1", "vector": [2.0, 0.0, 0.0]},
        {"name": "neg1", "vector": [-3.0, 0.0, 0.0]},
        {"name": "zero", "vector": [0.0, 5.0, 0.0]},
    ]
    result = _attribute(client, logits, components)
    assert [item["name"] for item in result["positive"]] == ["pos1"]
    assert [item["name"] for item in result["negative"]] == ["neg1"]
    assert all(item["projection"] > 0 for item in result["positive"])
    assert all(item["projection"] < 0 for item in result["negative"])


def test_shares_normalise_to_unit(client):
    logits = [1.0, 1.0, 1.0]
    components = [
        {"name": "a", "vector": [2.0, 0.0, 0.0]},
        {"name": "b", "vector": [-1.0, 0.0, 0.0]},
        {"name": "c", "vector": [0.5, 0.0, 0.0]},
    ]
    result = _attribute(client, logits, components)
    total = sum(abs(item["share"]) for item in result["attributions"])
    assert np.isclose(total, 1.0, atol=1e-9)


def test_zero_logits_collapse_deterministically(client):
    result = _attribute(client, [0.0, 0.0], [{"name": "x", "vector": [1.0, 2.0]}])
    assert result["logit_norm"] == 0.0
    assert all(item["projection"] == 0.0 for item in result["attributions"])
    assert all(item["share"] == 0.0 for item in result["attributions"])


def test_top_k_limits_ranked_lists(client):
    logits = [3.0, 0.0, 0.0]
    components = [{"name": f"c{i}", "vector": [float(i + 1), 0.0, 0.0]} for i in range(6)]
    result = _attribute(client, logits, components, top_k=2)
    assert len(result["positive"]) == 2
    # Highest-positive first.
    projections = [item["projection"] for item in result["positive"]]
    assert projections == sorted(projections, reverse=True)


def test_422_on_dimension_mismatch(client):
    response = client.post(
        "/v1/attribution",
        json={"logits": [1.0, 0.0], "components": [{"name": "x", "vector": [1.0, 0.0, 0.0]}]},
    )
    assert response.status_code == 422


def test_422_on_empty_components(client):
    response = client.post("/v1/attribution", json={"logits": [1.0], "components": []})
    assert response.status_code == 422
