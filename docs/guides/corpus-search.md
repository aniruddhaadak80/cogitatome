# Corpus search

573 arXiv papers plus hand-verified talks, essays, and threads — searchable
offline with BM25. No network, no keys, works on a plane.

## What's inside

- **Papers** (`corpus.papers.json`, 573): harvested from the public arXiv API
  by `scripts/harvest-arxiv.ts` across 25 relevance-sorted queries
  (interpretability, alignment, safety, ethics, philosophy). Every id, title,
  and URL comes from the API response — nothing is invented.
- **Media** (`corpus.media.ts`): ~22 talks, ~35 posts, 7 tweets/hubs, each URL
  verified against a search result during curation. `scripts/verify-links.ts`
  re-checks them.

Total: ~640 entries across 29 facet tags.

## Searching

`searchCorpus(query, {kind?, tags?, limit?, offset?})` in
`packages/core/src/domain/search.ts`: BM25 with k1 1.2, b 0.75, field weights
title 3, tags 2.5, one-liner 2, abstract 0.6. A small stopword list, prefix
`suggest()` for typeahead. Indexing 600+ entries takes well under a second
(tested).

Try: `induction head` → the top result mentions induction in the title.
`sleeper agents` → Hubinger et al. `superposition` → the toy-models paper.

## Refreshing

```powershell
bun scripts/harvest-arxiv.ts --queries 25 --per 25
bun scripts/seed.ts
```

Deterministic ordering and content hashing: same inputs, identical file. The
weekly `link-check` workflow re-verifies every URL.

## The honest limits

- arXiv relevance ranking is the selection bias. The corpus is "what the API
  returns for these queries", not "the literature".
- Media entries are hand-curated and frozen at curation time (2026-10).
- Abstracts are truncated to one-liners for the UI; the full abstract ships in
  the JSON for the API.
