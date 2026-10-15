# ADR 0007 — Optional persistence with file-backed fallback

- Status: accepted
- Date: 2026-10-11

## Context

Saved dissections and bookmarks are nice, but a database requirement would
break the zero-setup promise.

## Decision

Prisma + SQLite schema committed (`packages/db`), `DATABASE_URL` optional.
`@repo/db` never throws at import — it reports availability. No database
configured → deterministic in-memory store. Postgres is a one-line switch for
production (documented in the schema header).

## Consequences

- Fresh clone runs with zero setup. The promise holds.
- Saved-state features degrade gracefully, documented per route.
- One more package in the workspace; typechecked, near-empty by design.

## Alternatives considered

- Required Postgres via compose: kills the 5-minute quickstart. Rejected.
- localStorage-only: no cross-device, no sharing. Kept as fallback, not the
  design.
