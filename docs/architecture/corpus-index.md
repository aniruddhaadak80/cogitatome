# The corpus index

~640 entries, two sources, one index. Papers (`corpus.papers.json`) are
harvested from the arXiv API by a committed script — deterministic ordering,
content hashing, no invented identifiers. Media (`corpus.media.ts`) is
hand-curated with individually verified URLs.

The index (`packages/core/src/domain/search.ts`) is an inverted index with
BM25 (k1 1.2, b 0.75) over four weighted fields (title 3, tags 2.5, one-liner
2, abstract 0.6), a small stopword list, and prefix `suggest()` over the
vocabulary. It builds in well under a second (tested) and memoises on array
identity, so server renders share one build.

Ordering is newest-first by year, then code-unit title order — deliberately
not `localeCompare`, so server and client renders agree byte-for-byte (no
hydration flicker). Facets are tag histograms with humanised labels. See
`docs/diagrams/15-corpus-pipeline.mmd` and `docs/guides/corpus-search.md`.
