"""Deterministic binary linear-probe fitting (logistic regression).

A linear probe measures how much linearly-decodable information about a binary
label lives in a set of activations. The worker fits logistic regression by
full-batch gradient descent on standardised features, then folds the
standardisation back into the weights so the returned ``weights``/``bias``
operate directly on raw activations:
``prediction = sigmoid(activations · weights + bias)``.

Optimisation starts from zero weights with a fixed step size and iteration
count — no shuffling, no randomness — so the fit is bit-for-bit reproducible.
``accuracy`` is measured on the supplied activations (train fit) and ``roc_auc``
is the tie-aware rank statistic between the predicted probability and the label.
"""

from __future__ import annotations

import numpy as np

from .mathx import roc_auc, sigmoid
from .schemas import ProbeFitRequest, ProbeFitResponse

_EPOCHS = 4000
_LEARNING_RATE = 0.1
_L2 = 1e-3
_STD_FLOOR = 1e-12


def fit_probe(request: ProbeFitRequest) -> ProbeFitResponse:
    """Fit a linear probe and return raw-space weights, bias and metrics."""

    x = np.asarray(request.activations, dtype=np.float64)  # (N, D)
    y = np.asarray(request.labels, dtype=np.float64)  # (N,)
    n_samples, dim = x.shape

    mean = x.mean(axis=0)
    std = x.std(axis=0)
    safe_std = np.where(std < _STD_FLOOR, 1.0, std)
    x_std = (x - mean) / safe_std

    weights = np.zeros(dim, dtype=np.float64)
    bias = 0.0
    for _ in range(_EPOCHS):
        probs = sigmoid(x_std @ weights + bias)
        error = probs - y  # gradient of binary cross-entropy
        grad_w = x_std.T @ error / n_samples + _L2 * weights
        grad_b = float(error.mean())
        weights -= _LEARNING_RATE * grad_w
        bias -= _LEARNING_RATE * grad_b

    # Undo standardisation so the coefficients apply to raw activations.
    raw_weights = weights / safe_std
    raw_bias = bias - float(np.sum(weights * mean / safe_std))

    raw_probs = sigmoid(x @ raw_weights + raw_bias)
    predictions = (raw_probs >= 0.5).astype(np.int64)
    accuracy = float((predictions == y.astype(np.int64)).mean())
    auc = roc_auc(raw_probs, y.astype(np.int64))

    return ProbeFitResponse(
        weights=raw_weights.tolist(),
        bias=float(raw_bias),
        accuracy=accuracy,
        roc_auc=auc,
    )
