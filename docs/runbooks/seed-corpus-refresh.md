# Runbook: corpus refresh

For "the literature moved on" — quarterly, or when a landmark lands.

1. **Harvest.** `bun scripts/harvest-arxiv.ts --queries 25 --per 25`. Respects
   arXiv's rate limit (~3s between requests); takes ~10 minutes. Never invents
   identifiers — every entry comes from the API response.
2. **Verify.** `bun scripts/verify-links.ts` (network) + `--offline` (parse).
   New entries need non-empty title, URL, year ≥ 2016.
3. **Curate media.** Add talks/posts to `packages/seed/data/corpus.media.ts`
   only with individually verified URLs. No URL, no entry.
4. **Reseed.** `bun run seed` regenerates activations + manifest. Deterministic:
   same seed, byte-identical output.
5. **Test.** `bunx vitest run packages/core/tests/domain.corpus.test.ts
   packages/core/tests/domain.search.test.ts` — count, dedup, ordering, and
   the known-top-result assertions must hold.
