"""Deterministic sparse-autoencoder training (numpy only).

The worker learns an over-complete dictionary of unit-norm feature directions
``U ∈ R^{F×D}`` that reconstruct supplied activations under an L1 sparsity
penalty:

    z   = relu(x · Uᵀ + b)        # sparse codes, shape (N, F)
    x̂   = z · U                  # reconstruction, shape (N, D)
    L   = ‖x - x̂‖²  +  l1 · mean_n Σ_f z_nf

Encoder and decoder share one weight matrix (``W_enc = W_decᵀ``), and the
decoder rows are re-normalised to unit L2 norm after every step — the "tied
decoder norms" used by Anthropic-style SAEs. Dead units (never active across
the batch) are periodically resampled from the largest current reconstruction
error, following the standard opaque-resampling recipe. Optimisation is Adam
(no data shuffling, full-batch), so a given ``seed`` yields bit-identical output.
"""

from __future__ import annotations

import numpy as np

from .mathx import explained_variance, relu
from .schemas import SAEFeature, SAETrainRequest, SAETrainResponse

#: Maximum number of activating sample indices reported per feature, so a feature
#: that lights up on every input does not balloon the response payload.
_ACTIVATION_CAP = 64

#: Adam hyper-parameters / learning rate (fixed for reproducibility).
_ADAM_LR = 1e-2
_ADAM_B1 = 0.9
_ADAM_B2 = 0.999
_ADAM_EPS = 1e-8


class _Adam:
    """Minimal deterministic Adam optimiser over a fixed list of arrays."""

    def __init__(self, params: list[np.ndarray]) -> None:
        self.params = [p.astype(np.float64, copy=True) for p in params]
        self.m = [np.zeros_like(p) for p in self.params]
        self.v = [np.zeros_like(p) for p in self.params]
        self.t = 0

    def step(self, grads: list[np.ndarray]) -> list[np.ndarray]:
        self.t += 1
        bias1 = 1.0 - _ADAM_B1**self.t
        bias2 = 1.0 - _ADAM_B2**self.t
        for i, grad in enumerate(grads):
            self.m[i] = _ADAM_B1 * self.m[i] + (1.0 - _ADAM_B1) * grad
            self.v[i] = _ADAM_B2 * self.v[i] + (1.0 - _ADAM_B2) * (grad * grad)
            m_hat = self.m[i] / bias1
            v_hat = self.v[i] / bias2
            self.params[i] -= _ADAM_LR * m_hat / (np.sqrt(v_hat) + _ADAM_EPS)
        return self.params

    def zero_momentum_rows(self, rows: np.ndarray) -> None:
        """Clear Adam momentum for the dictionary rows being resampled."""

        for i, param in enumerate(self.params):
            if param.ndim >= 1 and param.shape[0] == rows.size or i == 0:
                # param 0 is the dictionary (F, D); reset the given rows.
                if i == 0:
                    self.m[i][rows] = 0.0
                    self.v[i][rows] = 0.0
            if i == 1:  # encoder bias, one entry per feature
                self.m[i][rows] = 0.0
                self.v[i][rows] = 0.0


def _normalize_rows(matrix: np.ndarray) -> np.ndarray:
    """Return ``matrix`` with each row scaled to unit L2 norm."""

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.clip(norms, 1e-12, None)


def train_sae(request: SAETrainRequest) -> SAETrainResponse:
    """Train the sparse autoencoder and return dictionary diagnostics."""

    x = np.asarray(request.activations, dtype=np.float64)  # (N, D)
    n_samples, dim = x.shape
    n_features = int(request.n_features)
    l1 = float(request.l1)
    epochs = int(request.epochs)

    rng = np.random.default_rng(request.seed)
    dictionary = _normalize_rows(rng.standard_normal((n_features, dim)))
    b_enc = np.zeros(n_features, dtype=np.float64)
    opt = _Adam([dictionary, b_enc])
    resample_every = max(1, epochs // 10)

    loss_curve: list[float] = []
    for epoch in range(epochs):
        # ---- forward ----
        pre = x @ dictionary.T + b_enc  # (N, F)
        z = relu(pre)  # (N, F)
        active_mask = pre > 0.0
        x_hat = z @ dictionary  # (N, D)
        residual = x - x_hat

        mse = float((residual**2).sum(axis=1).mean())
        l1_term = float(z.sum(axis=1).mean())
        loss_curve.append(mse + l1 * l1_term)

        # ---- backward ----
        d_x_hat = (-2.0 / n_samples) * residual  # (N, D)
        d_z = d_x_hat @ dictionary.T + (l1 / n_samples)  # (N, F)
        d_z *= active_mask
        g_dict = z.T @ d_x_hat + d_z.T @ x  # (F, D): decoder + tied-encoder grad
        g_b_enc = d_z.sum(axis=0)  # (F,)

        # ---- optimise + re-project decoder columns onto the unit sphere ----
        dictionary, b_enc = opt.step([g_dict, g_b_enc])
        dictionary = _normalize_rows(dictionary)

        # ---- dead-unit resampling from the largest reconstruction error ----
        if (epoch + 1) % resample_every == 0:
            codes = relu(x @ dictionary.T + b_enc)
            alive = (codes > 0.0).any(axis=0)
            dead = np.nonzero(~alive)[0]
            if dead.size:
                residual = x - codes @ dictionary
                resid_norms = np.linalg.norm(residual, axis=1)
                for j in dead:
                    donor = int(np.argmax(resid_norms))  # deterministic first-max
                    direction = residual[donor] + 1e-9
                    direction = direction / (np.linalg.norm(direction) + 1e-12)
                    dictionary[j] = direction  # tie encoder column to decoder row
                    b_enc[j] = 0.0
                opt.zero_momentum_rows(dead)

    # ---- final diagnostics ----
    codes = relu(x @ dictionary.T + b_enc)
    x_hat = codes @ dictionary

    features: list[SAEFeature] = []
    for f in range(n_features):
        column = codes[:, f]
        activating = np.nonzero(column > 0.0)[0][:_ACTIVATION_CAP]
        features.append(
            SAEFeature(
                index=f,
                decoder=dictionary[f].tolist(),
                dead=not bool(activating.size),
                max_activation=float(column.max()),
                activating_tokens=activating.astype(int).tolist(),
            )
        )

    l0 = float((codes > 0.0).sum(axis=1).mean())
    return SAETrainResponse(
        features=features,
        loss_curve=loss_curve,
        final_loss=loss_curve[-1],
        l0=l0,
        explained_variance=float(explained_variance(x, x_hat)),
    )
