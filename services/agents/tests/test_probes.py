"""Linear-probe endpoint tests: separability, determinism and validation."""

from __future__ import annotations


def _fit(client, activations, labels, layer=3, **overrides):
    payload = {"activations": activations, "labels": labels, "layer": layer}
    payload.update(overrides)
    response = client.post("/v1/probes/fit", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_probe_solves_separable_data(client, separable):
    activations, labels = separable
    result = _fit(client, activations, labels)
    assert result["accuracy"] > 0.99
    assert result["roc_auc"] > 0.99
    assert len(result["weights"]) == len(activations[0])


def test_probe_is_deterministic(client, separable):
    activations, labels = separable
    first = _fit(client, activations, labels)
    second = _fit(client, activations, labels)
    assert first == second


def test_probe_weights_predict_labels(client, separable):
    activations, labels = separable
    result = _fit(client, activations, labels)
    weights = result["weights"]
    bias = result["bias"]
    correct = 0
    for row, label in zip(activations, labels, strict=False):
        score = sum(w * x for w, x in zip(weights, row, strict=False)) + bias
        predicted = 1 if score >= 0 else 0
        correct += int(predicted == label)
    assert correct / len(labels) > 0.99


def test_probe_single_class_422(client):
    activations = [[1.0, 0.0], [2.0, 0.0], [3.0, 0.0]]
    response = client.post("/v1/probes/fit", json={"activations": activations, "labels": [1, 1, 1]})
    assert response.status_code == 422


def test_probe_invalid_label_422(client, separable):
    activations, _ = separable
    labels = [0, 1] * 30
    labels[0] = 2
    response = client.post("/v1/probes/fit", json={"activations": activations, "labels": labels})
    assert response.status_code == 422


def test_probe_length_mismatch_422(client, separable):
    activations, labels = separable
    response = client.post(
        "/v1/probes/fit",
        json={"activations": activations, "labels": labels[:-1]},
    )
    assert response.status_code == 422


def test_probe_ragged_activations_422(client):
    response = client.post(
        "/v1/probes/fit",
        json={"activations": [[1.0, 2.0], [3.0]], "labels": [0, 1]},
    )
    assert response.status_code == 422
