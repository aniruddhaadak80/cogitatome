"""Small, dependency-free numerical kernels shared across the workers.

These helpers are deliberately numpy-only and deterministic — no randomness,
no hidden global state — so that every callable in :mod:`cogitatome_agents`
produces identical results for identical inputs. They cover the primitives the
interpretability endpoints reuse:

* :func:`relu` / :func:`sigmoid` — neuron activations for the SAE and probe;
* :func:`roc_auc` — tie-aware Mann-Whitney rank statistic for linear probes;
* :func:`explained_variance` — reconstruction quality for the SAE.
"""

from __future__ import annotations

import numpy as np

_EPS = 1e-12


def relu(z: np.ndarray) -> np.ndarray:
    """Rectified linear unit, ``max(z, 0)``."""

    return np.maximum(z, 0.0)


def sigmoid(z: np.ndarray) -> np.ndarray:
    """Numerically stable logistic sigmoid.

    Evaluated through ``exp(-|z|)`` so large-magnitude logits never overflow.
    Works elementwise on scalars and arrays alike.
    """

    arr = np.asarray(z, dtype=np.float64)
    az = np.abs(arr)
    e = np.exp(-np.clip(az, 0.0, 700.0))
    return np.where(arr >= 0, 1.0 / (1.0 + e), e / (1.0 + e))


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Return 1-based ranks of ``values`` with ties averaged.

    A deterministic, ``O(n log n)`` implementation that does not depend on
    library quirks: equal values receive the mean of the positions they span.
    """

    n = values.size
    order = np.argsort(values, kind="stable")
    sorted_vals = values[order]
    ranks = np.empty(n, dtype=np.float64)
    i = 0
    while i < n:
        j = i + 1
        while j < n and sorted_vals[j] == sorted_vals[i]:
            j += 1
        # Positions i..j-1 (0-based) map to ranks (i+1)..j; take their mean.
        ranks[order[i:j]] = (i + j + 1) / 2.0
        i = j
    return ranks


def roc_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    """Tie-aware area under the ROC curve via the rank statistic.

    ``AUC = (sum of ranks among positives - n_pos(n_pos+1)/2) / (n_pos * n_neg)``.
    Returns ``0.5`` (chance) when only one class is present, since the AUC is
    undefined there — this is logged by callers as a degenerate case.
    """

    scores = np.asarray(scores, dtype=np.float64).ravel()
    labels = np.asarray(labels).ravel()
    if scores.shape != labels.shape:
        raise ValueError("scores and labels must have the same length")
    pos = labels == 1
    n_pos = int(pos.sum())
    n_neg = int((~pos).sum())
    if n_pos == 0 or n_neg == 0:
        return 0.5
    ranks = _average_ranks(scores)
    rank_sum_pos = float(ranks[pos].sum())
    auc = (rank_sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)
    return float(auc)


def explained_variance(x: np.ndarray, x_hat: np.ndarray) -> float:
    """Fraction of per-feature variance preserved by a reconstruction.

    Computed as ``1 - Var(x - x_hat) / Var(x)`` where variances run over the
    batch axis and are summed across the feature dimension. Returns ``0.0``
    when the input is (near) constant, avoiding a spurious division by zero.
    """

    x = np.asarray(x, dtype=np.float64)
    x_hat = np.asarray(x_hat, dtype=np.float64)
    denom = float(x.var(axis=0).sum()) if x.size else 0.0
    if denom < _EPS:
        return 0.0
    numer = float((x - x_hat).var(axis=0).sum())
    return 1.0 - numer / denom
