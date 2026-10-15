# `interpret`, `heads`, `circuits`, `metrics`

The four endpoints that read the model. All accept `model=induction|random`
and optional `tokens` (comma-separated ids, 1–32 in 0–15); all default to the
constructed model on `makeRepeated([1,2,3,4], 6)`.

## POST /api/v1/interpret

```powershell
curl -s http://localhost:3000/api/v1/interpret -H 'content-type: application/json' -d '{"tokens":[0,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4],"model":"induction"}'
```

Returns `model, label, config, tokens, symbols, predicted, layers[]
(index, heads, attention, attnOut, mlpOut), finalResidual, logits, heads[],
logitLens[], motif, inductionAccuracy, durationMs`. The trace is the same
object the pages render — the UI and the API cannot disagree.

## GET /api/v1/heads

```powershell
curl -s "http://localhost:3000/api/v1/heads?model=induction"
```

`heads[]` with `layer, head, prevTokenScore, focus, entropy, firstTokenScore,
role, topKeys[]`, plus `predicted[]` and `inductionAccuracy`. Expect roles
`previous-token` (L0.H0) and `induction` (L1.H0).

## GET /api/v1/circuits

```powershell
curl -s "http://localhost:3000/api/v1/circuits?target=1&threshold=0.05"
curl -s "http://localhost:3000/api/v1/circuits?target=1&format=dot" -H 'accept: text/vnd.graphviz'
```

`nodes[], edges[]` (kinds `direct|residual|ov|qk|feature`), `target`,
`targetLogit`, `counts`. The `qk` edge L0.H0 → L1.H0 carries the 3.0
K-composition lift.

## GET /api/v1/metrics

```powershell
curl -s "http://localhost:3000/api/v1/metrics?model=induction"
```

`allMetrics` in one object: `attentionEntropy[layer][head]`,
`meanAttentionEntropy`, `headProfiles[]`, `roleCounts`, `previousTokenHeads`
(1), `inductionHeads` (1), `meanFeatureSparsity`, `superposition`,
`inductionStrength`, `inductionWinner {layer:1, head:0}`, `topLogits[]`,
`stability`.
