# ADR 0004 — Analytic weights, no training loop

- Status: accepted
- Date: 2026-10-11

## Context

Follows from ADR 0003: if weights are set by hand, there is no optimizer, no
checkpoints, no training telemetry to maintain.

## Decision

Weights are closed-form formulas over positions and subspaces (sinusoidal
position codes, lane-structured projections, ALiBi-style distance biases).
Layer norm off, MLPs zeroed in the constructed model, so the circuit algebra
is exact.

## Consequences

- Forward pass is ~200 lines of readable arithmetic. Auditable by hand.
- No training docs, no checkpoint hosting, no GPU CI. Good.
- The random model covers "unknown structure" without training anything.

## Alternatives considered

- Gradient-descent toy training in-repo: nondeterminism risk, CI cost, and the
  learned circuit would still need verifying by hand. Rejected.
