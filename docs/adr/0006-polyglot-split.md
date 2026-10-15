# ADR 0006 — Polyglot services split (Rust / Python / Go)

- Status: accepted
- Date: 2026-10-11

## Context

Heavy numerics (Rust), ML-ecosystem interop (Python), and fan-out telemetry
(Go) each have a natural language. One language for all three would be worse
at two of them.

## Decision

- `crates/engine` (Rust): tensor-lite numerics + interpretability primitives,
  std-only, wasm feature-gated. Own CI job.
- `services/agents` (Python/FastAPI): SAE training, attribution, probes,
  patching sweeps, BM25 corpus search. numpy-only, deterministic. Own CI job.
- `services/relay` (Go): SSE fan-out hub, ring-buffer replay, deterministic
  simulator, Prometheus metrics. Stdlib-first. Own CI job.

Each has its own README, tests, Dockerfile, and a real reason to exist
(called by the web app or the pipeline, not decorative).

## Consequences

- Three toolchains in CI. Cost accepted; each job is path-scoped.
- Rust can't link on machines without MSVC Build Tools (like this one) —
  documented, CI verifies.
- The web app works fully without any service running. Services extend, never
  gate.

## Alternatives considered

- TypeScript-only: gives up numpy interop and Go's fan-out ergonomics.
  Rejected.
- Microservices-everything (one service per analysis): operational theatre.
  Rejected.
