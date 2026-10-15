# ADR 0002 — Deterministic simulation over live LLM calls

- Status: accepted
- Date: 2026-10-11

## Context

Every "AI" behaviour in the product could call a model provider. That would
require keys, money, network, and would make every number unreproducible.

## Decision

All behaviour is deterministic local simulation: seeded PRNG, analytic
weights, pure functions. No API keys exist anywhere in the product. The README
documents how to plug a real LLM later (replace `CogitatomeModel.forward`),
but the demo never needs one.

## Consequences

- 19/19 vs 0/19 is checkable on any machine. The product's core claim.
- No streaming bills, no rate limits, e2e runs offline. Good.
- The toy is small: findings don't transfer 1:1 to frontier models. Stated
  wherever it matters.

## Alternatives considered

- Live provider calls with caching: irreproducible, key-gated, rejected.
- ONNX in-browser inference: 100MB+ download, same toy anyway. Rejected.
