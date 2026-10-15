# API overview

Same-origin, no auth, no keys. Every route is a thin adapter: parse with zod,
call `packages/core`, shape the response. Failures are machine-readable:
`{error: {code, message, details?}}` with 400 (bad JSON) or 422 (failed
validation).

| Route | Method | What it does |
| ----- | ------ | ------------ |
| `/healthz` | GET | Liveness: `{status, service, version, time}` |
| `/api/v1/interpret` | POST | Full forward trace + heads + logit lens |
| `/api/v1/heads` | GET | Every head profiled |
| `/api/v1/circuits` | GET | Discovered circuit, JSON or DOT |
| `/api/v1/metrics` | GET | The whole metric battery at once |
| `/api/v1/corpus` | GET/POST | BM25 search + suggestions |
| `/api/v1/sandbox` | GET/POST | List scenarios / run one |
| `/api/v1/ethics` | POST | Ethical analysis + argument graph |
| `/api/v1/debate` | POST | Deterministic three-agent debate |
| `/api/v1/probes` | POST | Per-layer linear probes |
| `/api/v1/stream` | GET | The forward pass as SSE frames |

The machine-readable contract is `packages/sdk/src/openapi.ts`; the typed
client is `packages/sdk` (`client.heads()`, `client.searchCorpus()`, …).
`bun scripts/generate-sdk.ts --check` fails CI when the generated route table
drifts from the contract.

## Errors

```json
{ "error": { "code": "invalid_request", "message": "tokens must be an array of 1..32 integers in 0..15", "details": [{ "path": ["tokens"], "message": "Too small" }] } }
```

Codes: `invalid_json` (400), `invalid_request` (422). The Python worker also
returns 422 on bad tensor shapes; the Go relay returns 400/503 with the same
envelope shape.
