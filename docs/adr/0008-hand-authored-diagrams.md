# ADR 0008 — Hand-authored diagrams over generated images

- Status: accepted
- Date: 2026-10-11

## Context

The product needs architecture communication that stays correct as code
changes. Generated PNGs rot silently; Mermaid diffs reviewably.

## Decision

Sixteen Mermaid sources in `docs/diagrams/*.mmd` (nineteen after the ablation,
rollout and attribution additions), embedded as code blocks in README and docs
(GitHub renders them). Two use custom `themeVariables` in the
repo palette; the forward-pass sequence uses `autonumber`. Brand/screenshot
art is deterministic SVG from `scripts/gen-assets.mjs` (seeded, idempotent,
`--check` in CI).

## Consequences

- Diagram changes review as text diffs. Good.
- No binary assets except favicons. Repo stays greppable.
- Authors must learn basic Mermaid. Acceptable; the playbook documents types.

## Alternatives considered

- Excalidraw PNGs: pretty, instantly stale, undiffable. Rejected.
- Auto-generated diagrams from code: precise, unreadable. Rejected.
