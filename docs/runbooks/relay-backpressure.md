# Runbook: relay backpressure

For "SSE clients miss events / `dropped_total` climbs".

1. **Read `/v1/stats`.** `dropped` vs `published`: some drop under burst load
   is the design (drop-oldest, 256-slot buffers), not a bug.
2. **Sustained drop = slow consumer.** Check client read deadlines; the relay
   never blocks publishers for a slow subscriber by design.
3. **Replay instead.** `GET /v1/events?since=<seq>` replays the ring buffer
   (capacity `RELAY_BUFFER_SIZE`, default 4096). Clients should resume with
   `Last-Event-ID`, which the stream endpoint honours.
4. **Raise the buffer** (`RELAY_BUFFER_SIZE`) only after confirming the
   consumer is healthy — a bigger buffer hides a slow reader for longer, it
   does not fix it.
5. **Tests.** `go test ./... -race -count=1` in `services/relay` covers the
   drop-oldest contract, resume semantics, and the SSE frame shape.
