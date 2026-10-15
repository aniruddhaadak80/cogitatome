"""Pydantic request/response contracts for every endpoint.

Keeping all wire models in one module gives the service a single, explicit
source of truth that FastAPI renders into OpenAPI, and lets the TypeScript SDK
client mirror the shapes one-to-one.

Validation contract
-------------------
Shape errors raise :class:`pydantic.ValidationError`, which FastAPI translates
into a ``422 Unprocessable Entity`` with the offending field. Concretely:

* activation matrices must be non-empty and rectangular (every row equal length,
  every stream equal dimension);
* every coordinate must be a finite number (NaN/inf are rejected);
* probe labels must be ``0`` or ``1`` with at least one example of each class;
* patch tensors must be 3-D and rectangular, and both positions must be valid.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# --------------------------------------------------------------------------- #
# Shared validation helpers
# --------------------------------------------------------------------------- #
def _ensure_matrix(value: list[list[float]], *, name: str, min_rows: int, min_cols: int) -> list[list[float]]:
    """Validate a 2-D real matrix: non-empty, rectangular, finite."""

    if not isinstance(value, (list, tuple)) or len(value) < min_rows:
        raise ValueError(f"{name} must contain at least {min_rows} rows")
    width = len(value[0])
    if width < min_cols:
        raise ValueError(f"{name} rows must each have at least {min_cols} columns")
    for i, row in enumerate(value):
        if len(row) != width:
            raise ValueError(f"{name} must be rectangular: row {i} has {len(row)} columns, expected {width}")
        for j, entry in enumerate(row):
            _require_finite(entry, f"{name}[{i}][{j}]")
    return value


def _ensure_tensor3d(
    value: list[list[list[float]]], *, name: str, min_positions: int, min_streams: int, min_dim: int
) -> list[list[list[float]]]:
    """Validate a 3-D real tensor: rectangular across every axis, finite."""

    if not isinstance(value, (list, tuple)) or len(value) < min_positions:
        raise ValueError(f"{name} must contain at least {min_positions} positions")
    n_streams = len(value[0])
    if n_streams < min_streams:
        raise ValueError(f"{name} each position must have at least {min_streams} streams")
    dim = len(value[0][0])
    if dim < min_dim:
        raise ValueError(f"{name} streams must each have at least {min_dim} values")
    for pi, position in enumerate(value):
        if len(position) != n_streams:
            raise ValueError(
                f"{name} must be rectangular: position {pi} has {len(position)} streams, expected {n_streams}"
            )
        for si, stream in enumerate(position):
            if len(stream) != dim:
                raise ValueError(
                    f"{name} must be rectangular: stream [{pi}][{si}] has {len(stream)} values, "
                    f"expected {dim}"
                )
            for di, entry in enumerate(stream):
                _require_finite(entry, f"{name}[{pi}][{si}][{di}]")
    return value


def _require_finite(entry: object, label: str) -> None:
    if isinstance(entry, bool) or not isinstance(entry, (int, float)):
        raise ValueError(f"{label} must be a real number")
    if not math.isfinite(float(entry)):
        raise ValueError(f"{label} must be finite (no NaN or infinity)")


def _ensure_vector(value: list[float], *, name: str, min_len: int) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) < min_len:
        raise ValueError(f"{name} must contain at least {min_len} values")
    for i, entry in enumerate(value):
        _require_finite(entry, f"{name}[{i}]")
    return value


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #
class HealthResponse(BaseModel):
    """Liveness/readiness payload for ``GET /healthz``."""

    model_config = ConfigDict(extra="forbid")
    status: str
    version: str
    service: str


# --------------------------------------------------------------------------- #
# Sparse autoencoder training
# --------------------------------------------------------------------------- #
class SAETrainRequest(BaseModel):
    """Activations to decompose plus SAE hyper-parameters.

    ``activations`` is ``(n_samples, input_dim)``. The encoder/decoder are
    initialised deterministically from ``seed``; training is reproducible for a
    fixed ``(activations, n_features, l1, epochs, seed)`` tuple.
    """

    model_config = ConfigDict(extra="forbid")

    activations: list[list[float]]
    n_features: int
    l1: float = 0.01
    epochs: int = 200
    seed: int = 7

    @field_validator("activations")
    @classmethod
    def _check_activations(cls, v: list[list[float]]) -> list[list[float]]:
        return _ensure_matrix(v, name="activations", min_rows=1, min_cols=1)

    @field_validator("n_features")
    @classmethod
    def _check_n_features(cls, v: int) -> int:
        if v < 1:
            raise ValueError("n_features must be >= 1")
        return v

    @field_validator("l1")
    @classmethod
    def _check_l1(cls, v: float) -> float:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
            raise ValueError("l1 must be a finite, non-negative float")
        return float(v)

    @field_validator("epochs")
    @classmethod
    def _check_epochs(cls, v: int) -> int:
        if v < 1:
            raise ValueError("epochs must be >= 1")
        return v


class SAEFeature(BaseModel):
    """One learned SAE dictionary direction.

    ``activating_tokens`` lists the zero-based indices of the input activation
    vectors whose encoding activated this feature in the final epoch; the list
    is capped for payload size (see the training module).
    """

    model_config = ConfigDict(extra="forbid")
    index: int
    decoder: list[float]
    dead: bool
    max_activation: float
    activating_tokens: list[int]


class SAETrainResponse(BaseModel):
    """Trained dictionary diagnostics.

    ``explained_variance`` is the fraction of activation variance the SAE
    reconstructs; ``l0`` is the mean number of active features per sample.
    """

    model_config = ConfigDict(extra="forbid")
    features: list[SAEFeature]
    loss_curve: list[float]
    final_loss: float
    l0: float
    explained_variance: float


# --------------------------------------------------------------------------- #
# Logit attribution
# --------------------------------------------------------------------------- #
class AttributionComponent(BaseModel):
    """A named residual-stream component to attribute against the logits."""

    model_config = ConfigDict(extra="forbid")
    name: str
    vector: list[float]

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("component name must be non-empty")
        return v

    @field_validator("vector")
    @classmethod
    def _check_vector(cls, v: list[float]) -> list[float]:
        return _ensure_vector(v, name="vector", min_len=1)


class AttributionRequest(BaseModel):
    """Decompose the effect of components along the model's logit direction.

    Each ``component.vector`` must share the dimension of ``logits``. The
    projection of a component onto the unit logit direction measures how much
    that component pushes the read-out along the direction the logits point in.
    """

    model_config = ConfigDict(extra="forbid")
    logits: list[float]
    components: list[AttributionComponent]
    top_k: int = 5

    @field_validator("logits")
    @classmethod
    def _check_logits(cls, v: list[float]) -> list[float]:
        return _ensure_vector(v, name="logits", min_len=1)

    @field_validator("components")
    @classmethod
    def _check_components(cls, v: list[AttributionComponent]) -> list[AttributionComponent]:
        if not v:
            raise ValueError("components must contain at least one entry")
        return v

    @field_validator("top_k")
    @classmethod
    def _check_top_k(cls, v: int) -> int:
        if v < 1:
            raise ValueError("top_k must be >= 1")
        return v

    @model_validator(mode="after")
    def _check_dimensions(self) -> AttributionRequest:
        dim = len(self.logits)
        for i, component in enumerate(self.components):
            if len(component.vector) != dim:
                raise ValueError(
                    f"components[{i}].vector has length {len(component.vector)}, "
                    f"expected {dim} to match the logits dimension"
                )
        return self


class ComponentAttribution(BaseModel):
    """The computed attribution for one component.

    * ``projection`` — dot of the component with the unit logit direction.
    * ``raw_dot`` — dot of the component with the (unnormalised) logits.
    * ``share`` — ``projection`` normalised by the total absolute projection,
      so the shares of all components sum to one in absolute value.
    * ``norm`` — L2 norm of the component vector.
    """

    model_config = ConfigDict(extra="forbid")
    name: str
    projection: float
    raw_dot: float
    share: float
    norm: float


class AttributionResponse(BaseModel):
    """Per-component attribution with the ranked positive/negative splits."""

    model_config = ConfigDict(extra="forbid")
    n_components: int
    logit_norm: float
    top_k: int
    attributions: list[ComponentAttribution]
    positive: list[ComponentAttribution]
    negative: list[ComponentAttribution]


# --------------------------------------------------------------------------- #
# Linear probes
# --------------------------------------------------------------------------- #
class ProbeFitRequest(BaseModel):
    """Binary linear-probe fit request.

    ``activations`` is ``(n_samples, n_features)`` and ``labels`` must be ``0``
    or ``1`` with at least one example of each class. ``layer`` is recorded as
    metadata describing which activation slice the probe targets.
    """

    model_config = ConfigDict(extra="forbid")
    activations: list[list[float]]
    labels: list[int]
    layer: int = 0

    @field_validator("activations")
    @classmethod
    def _check_activations(cls, v: list[list[float]]) -> list[list[float]]:
        return _ensure_matrix(v, name="activations", min_rows=2, min_cols=1)

    @field_validator("labels")
    @classmethod
    def _check_labels(cls, v: list[int]) -> list[int]:
        if len(v) < 2:
            raise ValueError("labels must contain at least 2 entries")
        for i, label in enumerate(v):
            if isinstance(label, bool) or label not in (0, 1):
                raise ValueError(f"labels[{i}] must be 0 or 1")
        if len(set(v)) < 2:
            raise ValueError("labels must contain at least one 0 and one 1")
        return v

    @model_validator(mode="after")
    def _check_lengths(self) -> ProbeFitRequest:
        if len(self.labels) != len(self.activations):
            raise ValueError(
                f"labels has {len(self.labels)} entries but activations have {len(self.activations)} rows"
            )
        return self


class ProbeFitResponse(BaseModel):
    """Fitted logistic-regression probe metrics.

    ``weights``/``bias`` are in the raw activation space (standardisation is
    folded in), so predictions are ``sigmoid(activations · weights + bias)``.
    """

    model_config = ConfigDict(extra="forbid")
    weights: list[float]
    bias: float
    accuracy: float
    roc_auc: float


# --------------------------------------------------------------------------- #
# Activation patching
# --------------------------------------------------------------------------- #
class PatchSweepRequest(BaseModel):
    """Activation-patching sweep over per-position residual streams.

    ``residuals`` is ``(n_streams, n_positions, dim)`` — a stack of ``dim``-vector
    residual snapshots, one per stream, for every position. ``source_position``
    donates; ``target_position`` receives; the sweep walks a donor position from
    ``source_position`` toward ``target_position`` in ``stride`` increments.
    """

    model_config = ConfigDict(extra="forbid")
    residuals: list[list[list[float]]]
    source_position: int
    target_position: int
    stride: int = 1

    @field_validator("residuals")
    @classmethod
    def _check_residuals(cls, v: list[list[list[float]]]) -> list[list[list[float]]]:
        return _ensure_tensor3d(v, name="residuals", min_positions=1, min_streams=1, min_dim=1)

    @field_validator("source_position", "target_position")
    @classmethod
    def _check_positions(cls, v: int) -> int:
        if v < 0:
            raise ValueError("positions must be >= 0")
        return v

    @field_validator("stride")
    @classmethod
    def _check_stride(cls, v: int) -> int:
        if v < 1:
            raise ValueError("stride must be >= 1")
        return v

    @model_validator(mode="after")
    def _check_positions_in_range(self) -> PatchSweepRequest:
        n_positions = len(self.residuals[0])
        for name, value in (
            ("source_position", self.source_position),
            ("target_position", self.target_position),
        ):
            if value >= n_positions:
                raise ValueError(f"{name} {value} is out of range 0..{n_positions - 1}")
        return self


class PatchStep(BaseModel):
    """One donor step of the sweep.

    * ``patch_magnitude`` — Frobenius norm of the per-stream patch injected at
      the recipient when swapping ``target_position`` for this donor.
    * ``delta_norm`` — norm of the net change to the recipient's summed
      residual read-out across streams.
    """

    model_config = ConfigDict(extra="forbid")
    position: int
    patch_magnitude: float
    delta_norm: float


class PatchSweepResponse(BaseModel):
    """Ordered sweep results from ``source_position`` down to ``target_position``."""

    model_config = ConfigDict(extra="forbid")
    steps: list[PatchStep]
    n_positions: int
    source_position: int
    target_position: int


# --------------------------------------------------------------------------- #
# Corpus search
# --------------------------------------------------------------------------- #
class CorpusEntry(BaseModel):
    """A bibliographic record from the bundled interpretability corpus."""

    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    authors: list[str]
    year: int
    venue: str
    kind: str
    url: str
    tags: list[str]
    summary: str


class CorpusSearchResult(BaseModel):
    """A corpus entry paired with its BM25 relevance score."""

    model_config = ConfigDict(extra="forbid")
    entry: CorpusEntry
    score: float


class CorpusSearchResponse(BaseModel):
    """Ranked search hits plus the echo of the applied query/filter."""

    model_config = ConfigDict(extra="forbid")
    query: str
    kind: str | None
    total: int
    results: list[CorpusSearchResult]
