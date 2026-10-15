## What changed

<!-- One paragraph: which route/module, and what the reader can now do. -->

## Why

<!-- The question this answers, or the issue it fixes: Fixes #<n> -->

## How to test

```powershell
bun run typecheck
bun run lint
bun run test
```

- [ ] `bun run typecheck` green
- [ ] `bun run lint` green (zero warnings)
- [ ] `bun run test` green
- [ ] `bun run build` green (for UI changes)
- [ ] `bun run check:induction` still 19/19 (for engine changes)

## Screenshots / evidence

<!-- Paste the numbers, not adjectives. For UI changes, a screenshot. For engine
changes, the before/after metric. -->

## Checklist

- [ ] No API keys, no network calls, no `any`, no `eslint-disable`
- [ ] Tests added for the new behaviour (unit + e2e where user-visible)
- [ ] Docs updated (`docs/` + README table if a route changed)
- [ ] One logical change per PR (Conventional Commits title)
