"""Activation-patching sweep endpoint tests: walk logic, magnitudes, validation."""

from __future__ import annotations

import numpy as np


def _sweep(client, residuals, source, target, stride=1):
    response = client.post(
        "/v1/patch/sweep",
        json={
            "residuals": residuals,
            "source_position": source,
            "target_position": target,
            "stride": stride,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_self_patch_is_zero(client):
    residuals = [[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]]
    result = _sweep(client, residuals, source=2, target=2)
    assert len(result["steps"]) == 1
    assert result["steps"][0]["position"] == 2
    assert result["steps"][0]["patch_magnitude"] == 0.0
    assert result["steps"][0]["delta_norm"] == 0.0


def test_walk_ends_on_target(client):
    residuals = [[[float(p), 1.0] for p in range(5)]]  # (streams=1, positions=5, dim=2)
    result = _sweep(client, residuals, source=4, target=1, stride=1)
    positions = [step["position"] for step in result["steps"]]
    assert positions == [4, 3, 2, 1]
    assert result["steps"][-1]["patch_magnitude"] == 0.0
    assert result["steps"][-1]["delta_norm"] == 0.0


def test_stride_clamps_to_target(client):
    residuals = [[[1.0, 0.0], [0.0, 1.0], [2.0, 2.0], [3.0, 1.0]]]
    result = _sweep(client, residuals, source=3, target=0, stride=2)
    positions = [step["position"] for step in result["steps"]]
    assert positions == [3, 1, 0]  # 3 -> 1 -> clamped 0


def test_patch_magnitude_matches_frobenius(client):
    residuals = [[[1.0, 0.0], [0.0, 1.0], [4.0, 3.0]]]
    result = _sweep(client, residuals, source=2, target=0, stride=2)
    first = result["steps"][0]
    donor = np.asarray(residuals[0][2])
    recipient = np.asarray(residuals[0][0])
    expected = float(np.linalg.norm(donor - recipient))
    assert np.isclose(first["patch_magnitude"], expected)


def test_n_positions_reported(client):
    residuals = [[[float(p)] for p in range(3)]]
    result = _sweep(client, residuals, source=2, target=0)
    assert result["n_positions"] == 3
    assert result["source_position"] == 2
    assert result["target_position"] == 0


def test_multistream_distinguishes_magnitude_and_delta(client):
    # Two streams whose per-stream differences cancel when summed.
    residuals = [
        [[1.0, 0.0], [0.0, 1.0]],  # stream 0: pos0=[1,0], pos1=[0,1]
        [[-1.0, 0.0], [0.0, -1.0]],  # stream 1: pos0=[-1,0], pos1=[0,-1]
    ]
    result = _sweep(client, residuals, source=1, target=0, stride=1)
    step0 = result["steps"][0]
    # Summed read-out delta = (stream0 diff) + (stream1 diff) = [1,-1]+[-1,1] = 0.
    assert np.isclose(step0["delta_norm"], 0.0)
    # But the injected field is non-zero across streams.
    assert step0["patch_magnitude"] > 0.0


def test_422_source_out_of_range(client):
    residuals = [[[1.0, 0.0], [0.0, 1.0]]]
    response = client.post(
        "/v1/patch/sweep",
        json={"residuals": residuals, "source_position": 0, "target_position": 9},
    )
    assert response.status_code == 422


def test_422_stride_zero(client):
    residuals = [[[1.0, 0.0], [0.0, 1.0]]]
    response = client.post(
        "/v1/patch/sweep",
        json={"residuals": residuals, "source_position": 1, "target_position": 0, "stride": 0},
    )
    assert response.status_code == 422


def test_422_ragged_residuals(client):
    residuals = [[[1.0, 0.0], [0.0]], [[1.0, 1.0], [0.0, 0.0]]]
    response = client.post(
        "/v1/patch/sweep",
        json={"residuals": residuals, "source_position": 1, "target_position": 0},
    )
    assert response.status_code == 422
