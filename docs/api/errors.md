# Errors

Machine-readable, never a bare string: `{error: {code, message, details?}}`.

| Status | Code | Meaning |
| ------ | ---- | ------- |
| 400 | `invalid_json` | Body is not valid JSON |
| 422 | `invalid_request` | Body/query failed zod validation; `details[]` has `{path, message}` |

```powershell
curl -s http://localhost:3000/api/v1/interpret -H 'content-type: application/json' -d '{"tokens":[]}'
# {"error":{"code":"invalid_request","message":"tokens must be an array of 1..32 integers in 0..15","details":[…]}}
```

The Python worker returns 422 on bad tensor shapes with the same envelope.
The Go relay returns 400 (bad event) / 503 (draining) likewise. Clients should
switch on `error.code`, not the status alone.
