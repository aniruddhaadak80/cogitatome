# Runbook: performance regression

For "build takes forever / pages feel slow".

1. **Measure first.** `node scripts/loc-count.mjs` for scale;
   `bun run build` wall time (baseline: ~1–4 min for `next build` alone).
2. **Build budget.** Generated routes must stay lightweight: shared layouts,
   small client components, `force-dynamic` on data-heavy routes. No
   `generateStaticParams` over large sets. If build exceeds ~10 min, cut route
   count and grow docs/components instead (scale-engine guardrail).
3. **Corpus page.** At 374 kB it is the heaviest route (BM25 index ships to
   the client for typeahead). If it grows: move `suggest()` behind the
   `/api/v1/corpus/suggest` endpoint instead of bundling the vocabulary.
4. **Features page.** Trains an SAE (48 features × 220 epochs) server-side per
   request. If slow: cache by seed, or move training to the Python worker as
   a job.
5. **E2E.** Playwright builds in `webServer` — the suite inherits build time.
   Keep spec count flat; assert more per spec rather than adding specs.
