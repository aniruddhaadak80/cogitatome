/**
 * `@repo/seed` — the offline world.
 *
 * Everything the demo renders comes from here, and everything here is either
 * harvested from a public API by a committed script, or generated from a fixed
 * seed. Nothing is fetched at runtime, which is why the product runs with no
 * network and no keys.
 */
import papers from "../data/corpus.papers.json";
import { MEDIA_CORPUS } from "../data/corpus.media";
import type { CorpusEntry } from "@repo/core";

export const PAPER_CORPUS = papers as unknown as readonly CorpusEntry[];
export const MEDIA = MEDIA_CORPUS;

/** The seed everything is generated from. Recorded so the world is reproducible. */
export const SEED = 60602;

export const DATASETS = {
  papers: PAPER_CORPUS.length,
  media: MEDIA_CORPUS.length,
  total: PAPER_CORPUS.length + MEDIA_CORPUS.length
} as const;

export * from "../data/corpus.media";
