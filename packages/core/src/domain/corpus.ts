/**
 * Corpus loading, merging and faceting.
 *
 * The corpus is the factual spine of cogitatome: every claim the UI makes about
 * "the literature" is backed by one of these entries. Two sources feed it —
 * a harvested arXiv dump (`corpus.papers.json`, 573 real papers) and a
 * hand-curated media file (`corpus.media.ts`, talks / posts / tweets / hubs) —
 * and this module is the only place that knows both exist.
 *
 * Structural decisions worth stating out loud:
 *
 * - Both sources are imported through *relative* paths (`../../../seed/data/...`
 *   — three levels up from `src/domain`). `@repo/seed` does not export
 *   `./data/*.json` (its `exports` field only maps `"."`), and this package
 *   owns no `package.json`/`tsconfig` paths for a workspace alias, so a bare
 *   specifier would not resolve here. `resolveJsonModule` is on in the shared
 *   tsconfig, so the JSON import type-checks.
 * - The arXiv JSON has no `source` field; `CorpusEntry` requires one. Every
 *   paper therefore carries `source: "arxiv"` once it passes through here.
 * - Merging is first-wins by `id`. The two id namespaces never collide
 *   (`arxiv:*` vs `talk:`/`post:`/`tweet:`), so the choice is not load-bearing,
 *   but a rule is better than luck.
 */

import rawPapers from "../../../seed/data/corpus.papers.json";
import { MEDIA_CORPUS } from "../../../seed/data/corpus.media";
import type { CorpusEntry, CorpusFacet, CorpusKind } from "../types";
import { CORPUS_KINDS } from "../types";

/** The raw shape of one record inside `corpus.papers.json`. */
type RawPaper = {
  readonly id: string;
  readonly arxivId: string;
  readonly kind: "paper";
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number;
  readonly published: string;
  readonly venue: string;
  readonly url: string;
  readonly pdf: string;
  readonly abstract: string;
  readonly oneLiner: string;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
};

const PAPER_RECORDS = rawPapers as unknown as readonly RawPaper[];

/**
 * The 573 harvested arXiv papers, normalised into `CorpusEntry`.
 *
 * Returned fresh on every call so callers can sort or filter without touching
 * the shared `CORPUS` array; the mapping is cheap (a few thousand string
 * references) and the cost of accidental shared mutable state is not worth it.
 */
export function loadPapers(): CorpusEntry[] {
  return PAPER_RECORDS.map((p) => ({
    id: p.id,
    kind: "paper",
    title: p.title,
    authors: [...p.authors],
    year: p.year,
    venue: p.venue,
    url: p.url,
    oneLiner: p.oneLiner,
    tags: [...p.tags],
    source: "arxiv",
    abstract: p.abstract,
    arxivId: p.arxivId,
    pdf: p.pdf,
    published: p.published,
    categories: [...p.categories]
  }));
}

/** The curated talks, posts, tweets and hubs, as `CorpusEntry[]`. */
export function loadMedia(): CorpusEntry[] {
  return MEDIA_CORPUS.map((entry) => ({ ...entry }));
}

/** Total document count across both sources, before deduplication. */
const RAW_COUNT = PAPER_RECORDS.length + MEDIA_CORPUS.length;

function mergeEntries(groups: readonly (readonly CorpusEntry[])[]): CorpusEntry[] {
  const seen = new Set<string>();
  const out: CorpusEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Deterministic order: newest first, then ascending by title.
 *
 * Deliberately *not* `localeCompare` — ICU collation differs between the Node
 * build in CI and the browser, and a corpus whose order shifts between the
 * server render and the client render is a hydration bug. Plain code-unit
 * comparison is stable everywhere.
 */
function compareEntries(a: CorpusEntry, b: CorpusEntry): number {
  if (b.year !== a.year) return b.year - a.year;
  if (a.title === b.title) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.title < b.title ? -1 : 1;
}

/** The merged, deduplicated, stably ordered corpus. */
export const CORPUS: readonly CorpusEntry[] = mergeEntries([loadPapers(), loadMedia()]).sort(
  compareEntries
);

/** How many entries each source contributed — used by the stats panel. */
export function corpusSourceCounts(): {
  readonly papers: number;
  readonly media: number;
  readonly merged: number;
  readonly raw: number;
} {
  return {
    papers: PAPER_RECORDS.length,
    media: MEDIA_CORPUS.length,
    merged: CORPUS.length,
    raw: RAW_COUNT
  };
}

/**
 * `reward-hacking` → `Reward Hacking`.
 *
 * The corpus tags are kebab-case slugs because they double as URL fragments in
 * the corpus explorer; this is the display form, so the raw tag is preserved on
 * `CorpusFacet` for routing while `label` is what a human reads. Every
 * separator-delimited word is title-cased, because that is what the corpus
 * explorer's facet rail expects.
 */
export function tagLabel(tag: string): string {
  const words = tag
    .split(/[\s\-_]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  if (words.length === 0) return tag;
  return words.join(" ");
}

/**
 * Tag histogram over `entries`, most frequent first, capped at `limit`.
 *
 * Ties break alphabetically so the facet rail never flickers between renders.
 * `counts` sum to the total number of tag *occurrences*, not entries — one
 * entry with four tags contributes four.
 */
export function corpusFacets(entries: readonly CorpusEntry[], limit = 32): CorpusFacet[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const facets: { tag: string; count: number }[] = [];
  for (const [tag, count] of counts) facets.push({ tag, count });
  facets.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return facets
    .slice(0, Math.max(0, limit))
    .map((f) => ({ tag: f.tag, count: f.count, label: tagLabel(f.tag) }));
}

/** Aggregate numbers for the corpus landing page. */
export interface CorpusStats {
  readonly total: number;
  readonly byKind: Readonly<Record<CorpusKind, number>>;
  readonly yearMin: number;
  readonly yearMax: number;
  readonly tagCount: number;
  readonly authorCount: number;
  readonly topAuthors: readonly { readonly name: string; readonly count: number }[];
}

/** Every kind the corpus type system admits, for a zero-filled histogram. */
function emptyKindCounts(): Record<CorpusKind, number> {
  const out = {} as Record<CorpusKind, number>;
  for (const kind of CORPUS_KINDS) out[kind] = 0;
  return out;
}

/** Total entries, per-kind counts, the year span, tag count and top authors. */
export function corpusStats(entries: readonly CorpusEntry[] = CORPUS): CorpusStats {
  const byKind = emptyKindCounts();
  const authors = new Map<string, number>();
  const tags = new Set<string>();
  let yearMin = Number.POSITIVE_INFINITY;
  let yearMax = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    byKind[entry.kind] += 1;
    for (const author of entry.authors) {
      const name = author.trim();
      if (name.length === 0) continue;
      authors.set(name, (authors.get(name) ?? 0) + 1);
    }
    for (const tag of entry.tags) tags.add(tag);
    if (entry.year < yearMin) yearMin = entry.year;
    if (entry.year > yearMax) yearMax = entry.year;
  }
  const topAuthors = [...authors.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
    .slice(0, 12);
  return {
    total: entries.length,
    byKind,
    yearMin: Number.isFinite(yearMin) ? yearMin : 0,
    yearMax: Number.isFinite(yearMax) ? yearMax : 0,
    tagCount: tags.size,
    authorCount: authors.size,
    topAuthors
  };
}

/** Linear lookup is fine at this size and keeps the function pure. */
export function entryById(id: string, entries: readonly CorpusEntry[] = CORPUS): CorpusEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/** Entries carrying `tag`, in the canonical corpus order. */
export function entriesByTag(tag: string, entries: readonly CorpusEntry[] = CORPUS): CorpusEntry[] {
  const wanted = tag.trim().toLowerCase();
  return entries.filter((entry) => entry.tags.some((t) => t.toLowerCase() === wanted));
}

/**
 * Nearest neighbours of `entry` by shared-tag Jaccard overlap.
 *
 * Ties break on `year` (newer first) and then on title, so the "related" rail
 * is reproducible from the corpus alone with no randomness anywhere.
 */
export function relatedEntries(entry: CorpusEntry, n = 5, entries: readonly CorpusEntry[] = CORPUS): CorpusEntry[] {
  const own = new Set(entry.tags.map((t) => t.toLowerCase()));
  if (own.size === 0 || entry.id.length === 0) return [];
  const scored: { entry: CorpusEntry; score: number }[] = [];
  for (const candidate of entries) {
    if (candidate.id === entry.id) continue;
    const theirs = candidate.tags.map((t) => t.toLowerCase());
    let shared = 0;
    for (const tag of theirs) if (own.has(tag)) shared += 1;
    if (shared === 0) continue;
    const union = new Set([...own, ...theirs]).size;
    scored.push({ entry: candidate, score: shared / Math.max(1, union) });
  }
  scored.sort(
    (a, b) => b.score - a.score || b.entry.year - a.entry.year || (a.entry.title < b.entry.title ? -1 : 1)
  );
  return scored.slice(0, Math.max(0, n)).map((s) => s.entry);
}
