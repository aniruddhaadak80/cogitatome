# ADR 0001 — Turborepo monorepo

- Status: accepted
- Date: 2026-10-11

## Context

One product, five deployables (web app, four packages, three polyglot
services). Separate repos would drift within weeks; a single Next.js repo
would strangle the pure engine code with framework concerns.

## Decision

Turborepo with `apps/*` + `packages/*`, Bun workspaces, one lint/type/test
gate each. Polyglot services keep their own toolchains but share CI shape.

## Consequences

- `bun run typecheck` verifies six workspaces in ~10s. Good.
- Build takes 2–10 min (Next compiles the engine source). Acceptable; CI
  caches it.
- Contributors learn one command set. Good.

## Alternatives considered

- pnpm + Nx: heavier, no Bun-native lockfile story.
- Monolith Next app: engine code would import React transitively within a
  month. Rejected explicitly.
