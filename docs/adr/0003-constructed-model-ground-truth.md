# ADR 0003 — A hand-constructed induction model as ground truth

- Status: accepted
- Date: 2026-10-11

## Context

Interpretability tools are usually demonstrated on models whose internals are
unknown — so a tool that finds nothing still looks fine. Demos become tests
only when the answer is known in advance.

## Decision

Ship `constructInductionModel`: a two-layer attention-only transformer with
analytically set weights implementing a genuine previous-token → induction
circuit (K-composition lift 3.0, 19/19 learnable accuracy). The seeded random
model is the control condition.

## Consequences

- `bun run check:induction` is the repo's load-bearing proof.
- Every analysis (heads, circuits, probes, SAE, patching) is validated against
  known structure before it is trusted.
- The model is tiny (16 symbols, dModel 64). Stated openly; the method is what
  transfers, not the weights.

## Alternatives considered

- Training a small model: weeks of compute for unknown internals. Rejected.
- Using a public checkpoint: no ground truth, 100MB+ download. Rejected.
