"""Direct logit attribution over a residual-stream decomposition.

Given the model's final ``logits`` vector and a set of named residual-stream
``components`` (each a vector in the same space as the logits), this module
scores how strongly each component pushes the read-out along the direction the
logits point in.

The "logit direction" is the unit vector ``u = logits / ‖logits‖``. A component
``c`` is projected onto it, ``projection = c · u``; the raw (unnormalised) dot
``c · logits`` and the component norm are also reported. Normalised shares
divide each projection by the total absolute projection, so the shares sum to
one in magnitude while preserving sign. When ``logits`` is (near) the zero
vector the direction is undefined and every projection collapses to ``0`` — a
deterministic, documented fallback.
"""

from __future__ import annotations

import numpy as np

from .schemas import (
    AttributionRequest,
    AttributionResponse,
    ComponentAttribution,
)

_EPS = 1e-12


def attribute_logits(request: AttributionRequest) -> AttributionResponse:
    """Compute per-component logit attribution with top-k positive/negative splits."""

    logits = np.asarray(request.logits, dtype=np.float64)
    logit_norm = float(np.linalg.norm(logits))
    direction = logits / logit_norm if logit_norm > _EPS else np.zeros_like(logits)

    rows: list[tuple[str, float, float, float]] = []  # (name, projection, raw_dot, norm)
    total_abs = 0.0
    for component in request.components:
        vector = np.asarray(component.vector, dtype=np.float64)
        projection = float(vector @ direction)
        raw_dot = float(vector @ logits)
        norm = float(np.linalg.norm(vector))
        rows.append((component.name, projection, raw_dot, norm))
        total_abs += abs(projection)

    attributions = [
        ComponentAttribution(
            name=name,
            projection=projection,
            raw_dot=raw_dot,
            share=(projection / total_abs) if total_abs > _EPS else 0.0,
            norm=norm,
        )
        for name, projection, raw_dot, norm in rows
    ]

    ranked = sorted(attributions, key=lambda item: item.projection, reverse=True)
    top_k = int(request.top_k)
    positive = [item for item in ranked if item.projection > 0.0][:top_k]
    negative = [item for item in ranked if item.projection < 0.0][-top_k:][::-1]

    return AttributionResponse(
        n_components=len(ranked),
        logit_norm=logit_norm,
        top_k=top_k,
        attributions=ranked,
        positive=positive,
        negative=negative,
    )
