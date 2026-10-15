# `corpus`, `sandbox`, `ethics`, `debate`, `probes`, `stream`

## GET /api/v1/corpus

```powershell
curl -s "http://localhost:3000/api/v1/corpus?q=induction%20head&limit=5"
curl -s "http://localhost:3000/api/v1/corpus?tag=superposition&kind=paper"
```

`{query, total, entries[] (id, kind, title, authors, year, venue, url,
oneLiner, tags), facets[]}`. No query returns facets + stats for bootstrapping
the UI. `POST /api/v1/corpus/suggest` with `{q}` returns typeahead
suggestions from the index vocabulary.

## GET / POST /api/v1/sandbox

```powershell
curl -s http://localhost:3000/api/v1/sandbox
curl -s http://localhost:3000/api/v1/sandbox -H 'content-type: application/json' -d '{"scenarioId":"sleeper-agent","seed":60602}'
```

List returns metadata for all eight; run returns the full `ScenarioRun`
(outcome, trace, variables, confidence, mitigations). Same id + seed always
returns the same run.

## POST /api/v1/ethics

```powershell
curl -s http://localhost:3000/api/v1/ethics -H 'content-type: application/json' -d '{"caseId":"deceptive-evaluator"}'
```

`{caseId, positions[] (id, name, verdict, weight, argument), aggregate,
argumentGraph {nodes[], edges[]}}`. Case ids come from `CASES` in
`packages/core/src/domain/ethics.ts`.

## POST /api/v1/debate

```powershell
curl -s http://localhost:3000/api/v1/debate -H 'content-type: application/json' -d '{"claim":"Layer 1 head 0 of this model is an induction head","seed":7}'
```

`{claim, seed, turns[] (turn, speaker, argument, evidence, strength),
hypotheses[], winner, margin, settled}`. Same claim + seed → identical
transcript (tested).

## POST /api/v1/probes

```powershell
curl -s http://localhost:3000/api/v1/probes -H 'content-type: application/json' -d '{"property":"previous-token"}'
```

Per-layer `{layer, accuracy, auc, weights, bias, direction}` for the target
property plus the `token-identity` control. See `docs/guides/probes-and-steering.md`
for what the numbers do and do not prove.

## GET /api/v1/stream

```powershell
curl -sN "http://localhost:3000/api/v1/stream?model=induction"
```

Server-sent events: one `tick` frame per token prefix (`position, symbol,
predicted, truth, correct, learnable, runningAccuracy`), then a `summary`
frame (`learnableHits, learnableTotal, learnableAccuracy`) and close.
Deterministic frame order; `Content-Type: text/event-stream`.
