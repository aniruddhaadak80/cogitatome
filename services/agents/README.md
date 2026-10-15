# cogitatome-agents

> The heavy interpretability worker behind the cogitatome observatory.

`cogitatome-agents` is a small, deterministic FastAPI service that runs the
*expensive* interpretability jobs the web UI should never block on: sparse
autoencoder training, logit attribution, linear-probe fitting, activation
patching sweeps, and an offline search over a curated corpus of real
interpretability / alignment papers.

Everything here runs with **zero API keys** and **no network access**. All "AI"
behaviour is a deterministic, seeded numerical simulation written in **numpy
only** — no `torch`, no `transformers`, no model downloads. The same inputs and
seed always produce bit-identical output.

---

## Why this service exists

The browser is a poor place to train a sparse autoencoder over thousands of
activation vectors or to sweep hundreds of activation patches. `cogitatome`'s
web app calls this worker for those jobs and renders the results; the worker
keeps the guarantee that a rerun reproduces exactly what the user saw.

Determinism guarantees:

- Every learner is seeded (SAE) or zero-initialised with a fixed step schedule
  (probe). There is no data shuffling and no source of nondeterminism.
- The corpus index is built once from a bundled JSON file; ranking ties are
  broken by ascending entry id, so ordering is stable.
- Structured logs never capture wall-clock timestamps, only monotonic
  per-request latency, so log output does not vary run to run.

---

## Endpoints

All routes except the health probe live under `/v1` and exchange the typed
pydantic models defined in `cogitatome_agents/schemas.py` (which FastAPI renders
into the OpenAPI schema at `/openapi.json`). Malformed shapes return
`422 Unprocessable Entity` with the offending field.

### `GET /healthz`

Liveness payload:

```json
{ "status": "ok", "version": "0.1.0", "service": "cogitatome-agents" }
```

### `POST /v1/sae/train`

Trains an over-complete, unit-norm sparse autoencoder over supplied activation
vectors using Adam with an L1 penalty and dead-unit resampling.

Request:

```json
{
  "activations": [[0.1, 0.2], [1.0, -1.0]],
  "n_features": 8,
  "l1": 0.01,
  "epochs": 200,
  "seed": 7
}
```

Response: `features[]` (each with `index`, unit-norm `decoder`, `dead`,
`max_activation`, `activating_tokens`), plus `loss_curve`, `final_loss`, `l0`
(mean active features per sample) and `explained_variance`.

Model: `z = relu(x · Uᵀ + b)`, `x̂ = z · U`, loss
`‖x - x̂‖² + l1 · mean_n Σ_f z_nf`. Encoder and decoder share one weight matrix
(tied decoder norms); dead units are resampled from the largest current
reconstruction error every `epochs // 10` epochs.

### `POST /v1/attribution`

Direct logit attribution. Each named component is projected onto the unit logit
direction `u = logits / ‖logits‖`; the endpoint returns the full ranking plus
top-k positive/negative splits and normalised shares (absolute shares sum to 1).

```json
{
  "logits": [1.0, 0.0, -2.0],
  "components": [{ "name": "embed", "vector": [2.0, 0.0, 0.0] }],
  "top_k": 5
}
```

### `POST /v1/probes/fit`

Fits a binary linear probe (logistic regression by gradient descent on
standardised features) and folds standardisation back so the returned
`weights`/`bias` operate on raw activations. Reports train accuracy and
tie-aware ROC AUC. Requires labels of `0`/`1` with at least one of each class.

```json
{ "activations": [[2.0, 2.0], [-2.0, -2.0]], "labels": [1, 0], "layer": 3 }
```

### `POST /v1/patch/sweep`

Activation-patching sweep over a `(n_streams, n_positions, dim)` tensor of
per-position residual streams. The donor walks from `source_position` toward
`target_position` in `stride` steps; for each donor it reports
`patch_magnitude` (Frobenius norm of the injected per-stream patch) and
`delta_norm` (norm of the net change to the recipient's summed residual read-out).

```json
{ "residuals": [[[1.0, 0.0], [0.0, 1.0]]], "source_position": 1, "target_position": 0, "stride": 1 }
```

### `GET /v1/corpus/search`

Offline BM25 search over the bundled `corpus.json` (~35 real papers with real
arXiv ids). Fields `title` and `tags` are weighted 3×; query params are `q`,
optional `kind` filter, and `limit`.

```
GET /v1/corpus/search?q=sparse%20autoencoder%20superposition&limit=5
```

---

## Running

Requires **Python 3.12**.

```bash
cd services/agents
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Windows  (or: source .venv/bin/activate on POSIX)
pip install -e ".[dev]"             # runtime + pytest/ruff

# Dev server:
uvicorn cogitatome_agents.main:app --reload
# Equivalently, the module entry point (honours AGENTS_HOST/AGENTS_PORT):
python -m cogitatome_agents
```

Interactive API docs are served at `http://127.0.0.1:8000/docs`, and the OpenAPI
schema at `/openapi.json`.

### Environment variables

| Variable        | Default     | Purpose                                                        |
| --------------- | ----------- | -------------------------------------------------------------- |
| `CORS_ORIGINS`  | `*`         | Comma-separated allowed origins. `*` reflects the caller (dev). |
| `LOG_LEVEL`     | `INFO`      | Standard logging level name.                                   |
| `AGENTS_HOST`   | `127.0.0.1` | Bind host for `python -m cogitatome_agents`.                   |
| `AGENTS_PORT`   | `8000`      | Bind port for `python -m cogitatome_agents`.                   |

CORS credentials are only enabled when a specific origin (not `*`) is configured,
because cookies and wildcard origins cannot be combined.

### Request id & structured logging

Every response carries an `X-Request-ID` header. If the caller supplies an
inbound `X-Request-ID` it is honoured; otherwise a 16-hex id is minted. Middleware
emits **one JSON object per access line** (`level`, `event`, `request_id`,
`http`, `duration_ms`), and application handlers can attach `request_id` to their
own logs via the same contextvar. Secret-looking attributes are filtered out.

---

## How the web app calls it (and the TypeScript SDK mirror)

The web app and a generated TypeScript client talk to the same contract. The
client mirrors `cogitatome_agents.schemas` one-to-one: request/response types,
the `/v1` prefixes, and the `X-Request-ID` round-trip. A typical call:

```ts
// packages/sdk (illustrative) — the worker is mounted at AGENTS_BASE_URL.
const base = process.env.AGENTS_BASE_URL ?? "http://127.0.0.1:8000";

export async function trainSae(body: {
  activations: number[][];
  n_features: number;
  l1?: number;
  epochs?: number;
  seed?: number;
}) {
  const res = await fetch(`${base}/v1/sae/train`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`sae/train failed: ${res.status}`);
  return res.json();
}
```

Because responses are deterministic, the SDK can cache results keyed by the exact
request body (including the SAE `seed`), which keeps the UI snappy and re-runs
reproducible.

---

## Docker

A multi-stage `Dockerfile` (slim base, non-root user, healthcheck) is provided.
Build and run:

```bash
docker build -t cogitatome-agents services/agents
docker run --rm -p 8000:8000 -e CORS_ORIGINS=http://localhost:3000 cogitatome-agents
```

> **Note:** Docker is **not installed** in the environment this service was
> authored in, so the image has **not been built or run locally**. The Dockerfile
> targets the pinned versions in `requirements.txt`; validate it with the first
> `docker build` in your environment.

---

## Testing

```bash
cd services/agents
pytest -q          # 46 tests
ruff check .       # lint
```

The suite (`tests/`) uses `fastapi.testclient.TestClient` and asserts
determinism (same seed → identical output), `422` on malformed shapes, probe
accuracy ≈ 1.0 on separable synthetic data, and BM25 ranking sanity.

---

## Layout

```
services/agents/
  pyproject.toml        project metadata + pinned deps + ruff/pytest config
  requirements.txt      pinned mirror for reproducible / Docker installs
  Dockerfile            multi-stage, slim, non-root
  README.md             this file
  corpus.json           ~35 verified interpretability/safety papers (offline)
  cogitatome_agents/
    __init__.py  __main__.py  main.py  config.py  schemas.py
    sae.py  attribution.py  probes.py  patching.py
    corpus.py  search.py  mathx.py  logs.py
  tests/
    conftest.py  test_healthz.py  test_sae.py  test_attribution.py
    test_probes.py  test_patch.py  test_corpus.py
```

Every module has a docstring and no dead code; shared numerical kernels live in
`mathx.py`, wire contracts in `schemas.py`, and cross-cutting logging/request-id
plumbing in `logs.py`.
