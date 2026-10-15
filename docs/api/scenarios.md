# Sandbox

`GET /api/v1/sandbox` lists all eight scenarios (id, title, domain, severity,
expectedOutcome, description). `POST /api/v1/sandbox` with
`{scenarioId, seed?}` runs one and returns the `ScenarioRun`.

```powershell
curl -s http://localhost:3000/api/v1/sandbox -H 'content-type: application/json' -d '{"scenarioId":"sandbagging","seed":7}'
```

Seed 60602 outcome mix: `gamed, unsafe, unsafe, indeterminate, gamed, gamed,
aligned, unsafe`. Same id + seed → deep-equal response (tested in
`domain.scenarios.test.ts`). Scenario catalogue and writing guide:
[running the sandbox](../guides/running-the-sandbox.md).
