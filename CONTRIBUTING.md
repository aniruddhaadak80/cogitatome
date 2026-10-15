# Contributing to cogitatome

Thanks for reading this. cogitatome is a working interpretability lab, and the
most useful contributions are ones that make a claim checkable: a new analysis
that runs against the constructed model, a scenario with a visible trace, a
corpus entry with a verified URL.

## Clone → run → test

```powershell
git clone https://github.com/aniruddhaadak80/cogitatome.git
cd cogitatome
bun install
bun run seed          # generate the offline world (deterministic, seed 60602)
bun run dev           # http://localhost:3000
```

Gates (all must pass before a PR):

```powershell
bun run typecheck     # turbo: strict TS in every workspace
bun run lint          # eslint, zero warnings
bun run test          # vitest: 106+ unit tests
bun run e2e           # playwright against a production build
bun run build         # next build must succeed
bun run check:induction  # the 19/19 proof must hold
```

## How to contribute

1. **Pick an issue.** `good first issue`-labelled ones are scoped to one file
   and one test. Ask to be assigned before starting.
2. **Branch.** `git checkout -b feat/<slug>` from `develop`. One logical change
   per branch.
3. **Code.** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`,
   `chore:`). Small diffs. No `any`, no `eslint-disable`, no API keys.
4. **Test.** Every feature ships with its tests: unit in `packages/core`,
   integration for API routes, e2e for user-visible flows.
5. **PR.** Fill the template: what changed, why, how you tested it, and the
   gate output. A maintainer reviews within a week.

## Code style

- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- Server Components by default; `"use client"` only at interactive leaves.
- Domain logic lives in `packages/core` as pure functions. Route handlers are
  thin adapters: parse with zod → call core → shape response.
- kebab-case files, PascalCase components, `SCREAMING_SNAKE` constants.
- Comments explain *why*; docs explain *how it fits*.

## What makes a good PR here

- A new interpretability analysis must run against **both** models (constructed
  + random) and show the numbers differ for a stated reason.
- A new scenario must be deterministic (same seed → same trace) with ≥5
  reasoning steps and concrete mitigations.
- A corpus addition must have a verified URL — run `bun scripts/verify-links.ts`.
- Docs changes should include the command or diagram that backs the claim.

## Branch strategy

`main` is always deployable. `develop` integrates features. Feature branches
merge into `develop`; releases merge `develop` into `main` with a tag `v*`.
See `docs/diagrams/08-branching.mmd`.
