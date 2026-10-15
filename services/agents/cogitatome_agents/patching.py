"""Activation-patching sweep over per-position residual streams.

The input ``residuals`` is a ``(n_streams, n_positions, dim)`` tensor: for each
position it stores a stack of ``dim``-dimensional residual snapshots taken at
successive depths (the "streams"). Summing over the stream axis yields the
accumulated residual read-out a logit lens would see at each position.

The sweep measures what happens when we graft the recipient ``target_position``
onto a *donor* position. The donor walks from ``source_position`` toward
``target_position`` in ``stride`` increments (the walk is clamped so it always
lands exactly on ``target_position``), and for every donor we report:

* ``patch_magnitude`` — the Frobenius norm of the per-stream difference carved
  out of the recipient, ``‖residuals[:, p, :] - residuals[:, target, :]‖_F``;
* ``delta_norm`` — the norm of the net change to the recipient's summed
  residual read-out, ``‖Σ_streams (residuals[s, p] - residuals[s, target])‖``.

The two differ unless the stream axis collapses to one slice, which is the
point: patch magnitude is the raw injected field, delta norm is what survives
after streams superpose. The terminal donor (== target) trivially yields zeros.
"""

from __future__ import annotations

import numpy as np

from .schemas import PatchStep, PatchSweepRequest, PatchSweepResponse


def _walk_to_target(source: int, target: int, stride: int) -> list[int]:
    """Return the donor walk ``source → target`` in ``stride`` steps.

    Ends exactly on ``target`` (a trailing shorter step), so
    ``positions[-1] == target`` always holds.
    """

    if source == target:
        return [target]
    direction = 1 if target > source else -1
    positions: list[int] = []
    current = source
    while True:
        positions.append(current)
        if current == target:
            break
        nxt = current + direction * stride
        overshoot = nxt > target if direction > 0 else nxt < target
        if overshoot:
            positions.append(target)
            break
        current = nxt
    return positions


def patch_sweep(request: PatchSweepRequest) -> PatchSweepResponse:
    """Run the donor sweep and return per-step patch diagnostics."""

    residuals = np.asarray(request.residuals, dtype=np.float64)  # (L, P, D)
    _, n_positions, _ = residuals.shape
    source = int(request.source_position)
    target = int(request.target_position)
    # Position bounds are enforced by the request schema (422 on violation);
    # coerce here so the function body reads cleanly.

    stream_sum = residuals.sum(axis=0)  # (P, D)
    recipient = residuals[:, target, :]  # (L, D)
    recipient_sum = stream_sum[target]  # (D,)

    steps: list[PatchStep] = []
    for donor in _walk_to_target(source, target, int(request.stride)):
        patch_tensor = residuals[:, donor, :] - recipient
        delta_vector = stream_sum[donor] - recipient_sum
        steps.append(
            PatchStep(
                position=donor,
                patch_magnitude=float(np.linalg.norm(patch_tensor)),
                delta_norm=float(np.linalg.norm(delta_vector)),
            )
        )

    return PatchSweepResponse(
        steps=steps,
        n_positions=int(n_positions),
        source_position=source,
        target_position=target,
    )
