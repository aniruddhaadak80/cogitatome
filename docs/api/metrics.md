# Metrics

`GET /api/v1/metrics?model=induction&tokens=0,1,2,3,4` → `allMetrics` in one
object. One forward pass, every number — a dashboard needing three numbers
calls this once, not three times.

Reference values on the default stimulus (asserted in tests where stable):

| Field | Value | Meaning |
| ----- | ----- | ------- |
| `layers` / `heads` | 2 / 2 | the constructed model's shape |
| `previousTokenHeads` | 1 | L0.H0 |
| `inductionHeads` | 1 | L1.H0 |
| `inductionWinner` | `{layer:1, head:0}` | strongest K-signal |
| `meanAttentionEntropy` | ~0.4 | between one-hot (0) and uniform (1) |
| `stability` | ~0.9 | top logits barely vary after the motif locks |

See [interpret](interpret.md) for the shared query params and
`docs/diagrams/11-metrics-quadrant.mmd` for where each technique sits on
effort vs payoff.
