# Stream

`GET /api/v1/stream?model=induction` → `text/event-stream`. One `tick` frame
per token prefix, then `summary`, then close. Deterministic order; the Go
relay (`services/relay`) serves the same shape over WebSocket-style
fan-out for live dashboards.

```powershell
curl -sN "http://localhost:3000/api/v1/stream?model=induction" | Select-Object -First 12
```

Frame: `id, event: tick, data: {position, symbol, predicted, truth, correct,
learnable, runningAccuracy}`. The header `Cache-Control: no-cache,
no-transform` is set in `next.config.ts` so proxies don't buffer the stream.
