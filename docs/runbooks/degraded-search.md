# Runbook: degraded search

For "corpus search returns nothing / wrong things".

1. **Check the data.** `packages/seed/data/corpus.papers.json` should be
   ~1.1MB, 573 entries. If it is small or missing, re-harvest:
   `bun scripts/harvest-arxiv.ts --queries 25 --per 25` then `bun run seed`.
2. **Check the index.** `bunx vitest run packages/core/tests/domain.search.test.ts`
   — the "induction head" top-result assertion is the canary.
3. **Check the route.** `GET /api/v1/corpus?q=induction%20head&limit=5` should
   return `total > 0` with "induction" in the first title.
4. **Facets.** Empty facet rail = `CORPUS` failed to load (import path or JSON
   parse). The page falls back to zero-state copy, never a crash.
