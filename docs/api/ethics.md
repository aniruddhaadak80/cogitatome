# Ethics

`POST /api/v1/ethics` with `{caseId}` → `{caseId, positions[] (id, name,
verdict, weight, argument), aggregate, argumentGraph {nodes[], edges[]}}`.

```powershell
curl -s http://localhost:3000/api/v1/ethics -H 'content-type: application/json' -d '{"caseId":"deceptive-evaluator"}'
```

Verdicts are `permissible | forbidden | obligatory`; the aggregate is the
weighted verdict. A case with `harms >> benefits` yields `forbidden`
(tested). Positions, cases, and the moral-patient criteria:
[the ethics engine](../guides/the-ethics-engine.md). The engine is a reasoning
aid, not an authority.
