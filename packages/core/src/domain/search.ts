/**
 * BM25 search over the corpus.
 *
 * The corpus explorer needs to feel instant and — more importantly — the same
 * query must return the same order on every machine, in every render pass. So:
 * an inverted index built once at module load, a textbook Okapi BM25 scorer with
 * no learning-to-rank, and a total order on ties that falls back to the corpus
 * ordering rather than to insertion order in a hash map.
 *
 * Field weights exist because a title hit is worth far more than an abstract
 * hit: `induction head` in a paper title is the thesis, `induction head` in an
 * abstract is one paragraph of it. Titles 3, one-liners 2, tags 2.5, abstracts
 * 0.6. Abstracts are also the only field that is *not* always present, so the
 * weighted-document-length normalisation quietly handles papers without one.
 */

import { CORPUS, corpusFacets } from "./corpus";
import type { CorpusEntry, CorpusSearchResult } from "../types";

/** The four indexed fields, in the order they are weighted. */
export type IndexField = "title" | "oneLiner" | "tags" | "abstract";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/**
 * How much a term occurrence in each field counts. Sum of the four weights is
 * 8.1, which is why the weighted term frequency below is not normalised per
 * field: a long abstract at 0.6 can still beat a short one-liner at 2 when the
 * term repeats, which is the behaviour we want.
 */
export const FIELD_WEIGHTS: Readonly<Record<IndexField, number>> = {
  title: 3,
  oneLiner: 2,
  tags: 2.5,
  abstract: 0.6
};

/**
 * Function words plus the handful of tokens that are in 90% of arXiv titles and
 * therefore carry no discriminative signal ("arxiv", "via", "towards"). Keeping
 * this list short and fixed is what keeps BM25's idf meaningful.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could", "did",
  "do", "does", "for", "from", "had", "has", "have", "how", "if", "in", "into", "is", "it", "its",
  "may", "might", "must", "no", "not", "of", "on", "or", "our", "shall", "should", "so", "such",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "to", "towards", "under", "until", "use", "used", "using", "via", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "why", "will", "with", "within",
  "would", "you", "your", "arxiv", "paper", "papers", "preprint"
]);

/** The indexed text of one entry, per field, with the field's own tokens. */
export interface DocTerms {
  readonly fieldLengths: Readonly<Record<IndexField, number>>;
  readonly fieldTerms: Readonly<Record<IndexField, ReadonlyMap<string, number>>>;
  /** Weighted length: Σ weight × tokens(field). */
  readonly weightedLength: number;
  /** Weighted term frequency: Σ weight × tf(field). */
  readonly weightedTerms: ReadonlyMap<string, number>;
}

/**
 * Split text into indexable terms: lowercase, cut on anything that is not a
 * letter or a digit, drop stopwords.
 *
 * We do *not* stem. "head"/"heads" are different terms in BM25's view, and for
 * a corpus of titles that is usually right — but it means a query for
 * "induction heads" will not match "induction head" as strongly. The UI works
 * around this by suggesting completions rather than relying on fuzzy matching.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length === 0) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

function fieldText(entry: CorpusEntry, field: IndexField): string {
  switch (field) {
    case "title":
      return entry.title;
    case "oneLiner":
      return entry.oneLiner;
    case "tags":
      return entry.tags.join(" ");
    case "abstract":
      return entry.abstract ?? "";
  }
}

/** Build the per-field term maps for one entry. */
export function indexDoc(entry: CorpusEntry): DocTerms {
  const fieldLengths = {} as Record<IndexField, number>;
  const fieldTerms = {} as Record<IndexField, ReadonlyMap<string, number>>;
  let weightedLength = 0;
  for (const field of ["title", "oneLiner", "tags", "abstract"] as const) {
    const tokens = tokenize(fieldText(entry, field));
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    fieldLengths[field] = tokens.length;
    fieldTerms[field] = counts;
    weightedLength += FIELD_WEIGHTS[field] * tokens.length;
  }
  const weightedTerms = new Map<string, number>();
  for (const field of ["title", "oneLiner", "tags", "abstract"] as const) {
    const counts = fieldTerms[field];
    const weight = FIELD_WEIGHTS[field];
    if (counts === undefined || weight === 0) continue;
    for (const [term, tf] of counts) {
      weightedTerms.set(term, (weightedTerms.get(term) ?? 0) + weight * tf);
    }
  }
  return { fieldLengths, fieldTerms, weightedLength, weightedTerms };
}

/** The immutable inverted index. One instance is cached for the whole app. */
export class CorpusIndex {
  readonly entries: readonly CorpusEntry[];
  readonly docs: readonly DocTerms[];
  /** term → ascending doc indices that contain it. */
  readonly postings: ReadonlyMap<string, readonly number[]>;
  readonly docFrequency: ReadonlyMap<string, number>;
  readonly avgLength: number;
  /** Full vocabulary, most frequent first then alphabetical. */
  readonly vocabulary: readonly string[];

  constructor(entries: readonly CorpusEntry[]) {
    this.entries = entries;
    this.docs = entries.map((entry) => indexDoc(entry));
    const postings = new Map<string, number[]>();
    let total = 0;
    entries.forEach((_, i) => {
      const doc = this.docs[i];
      if (doc === undefined) return;
      total += doc.weightedLength;
      for (const term of doc.weightedTerms.keys()) {
        const list = postings.get(term);
        if (list === undefined) postings.set(term, [i]);
        else list.push(i);
      }
    });
    this.postings = postings;
    this.docFrequency = new Map([...postings].map(([term, list]) => [term, list.length]));
    this.avgLength = entries.length === 0 ? 0 : total / entries.length;
    const withCounts = [...postings].map(([term, list]) => ({ term, count: list.length }));
    withCounts.sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : 1));
    this.vocabulary = withCounts.map((v) => v.term);
  }

  /** Robertson/Sparck-Jones idf with the +1 smoothing, floored at 0. */
  idf(term: string): number {
    const df = this.docFrequency.get(term) ?? 0;
    const n = this.entries.length;
    if (n === 0 || df === 0) return 0;
    return Math.max(0, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  /** BM25 score of one document against a de-duplicated query term list. */
  scoreDoc(docIndex: number, queryTerms: readonly string[]): number {
    const doc = this.docs[docIndex];
    if (doc === undefined) return 0;
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.weightedTerms.get(term) ?? 0;
      if (tf === 0) continue;
      const norm = tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.weightedLength / (this.avgLength || 1)));
      score += this.idf(term) * ((tf * (BM25_K1 + 1)) / norm);
    }
    return score;
  }

  /** Score every document that shares at least one term with the query. */
  scoreAll(queryTerms: readonly string[]): Map<number, number> {
    const out = new Map<number, number>();
    const seen = new Set<number>();
    for (const term of queryTerms) {
      const list = this.postings.get(term);
      if (list === undefined) continue;
      for (const docIndex of list) {
        if (seen.has(docIndex)) continue;
        seen.add(docIndex);
        out.set(docIndex, this.scoreDoc(docIndex, queryTerms));
      }
    }
    return out;
  }
}

export interface SearchOptions {
  readonly kind?: CorpusEntry["kind"];
  /** Entries must carry *every* listed tag (intersection, not union). */
  readonly tags?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
}

let cachedIndex: CorpusIndex | null = null;
let cachedSource: readonly CorpusEntry[] | null = null;

/**
 * Build (or reuse) the inverted index over `entries`.
 *
 * Memoised on the *identity* of the array: passing `CORPUS` twice builds once,
 * passing a fresh array rebuilds. Indexing ~650 entries — about 250k tokens once
 * abstracts are included — takes a few tens of milliseconds, so a rebuild is
 * never a stall, but it should not happen per keystroke either.
 */
export function buildIndex(entries: readonly CorpusEntry[] = CORPUS): CorpusIndex {
  if (cachedIndex !== null && cachedSource === entries) return cachedIndex;
  const index = new CorpusIndex(entries);
  cachedIndex = index;
  cachedSource = entries;
  return index;
}

/** Distinct query terms in first-seen order, stopwords already removed. */
function queryTermsOf(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of tokenize(query)) {
    if (seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

/**
 * Search the corpus.
 *
 * Returns the page of matching entries plus `facets` computed over *all*
 * matches, not just the page — the facet counts must not shrink when the user
 * turns a page, or the UI lies about the corpus.
 */
export function searchCorpus(query: string, options: SearchOptions = {}): CorpusSearchResult {
  const limit = Math.max(0, options.limit ?? 25);
  const offset = Math.max(0, options.offset ?? 0);
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { entries: [], total: 0, query: trimmed, facets: [] };
  }
  const index = buildIndex();
  const terms = queryTermsOf(trimmed);
  if (terms.length === 0) {
    return { entries: [], total: 0, query: trimmed, facets: [] };
  }
  const wantedTags = (options.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  const ranked: { entry: CorpusEntry; score: number }[] = [];
  for (const [docIndex, score] of index.scoreAll(terms)) {
    if (score <= 0) continue;
    const entry = index.entries[docIndex];
    if (entry === undefined) continue;
    if (options.kind !== undefined && entry.kind !== options.kind) continue;
    if (wantedTags.length > 0) {
      const owned = new Set(entry.tags.map((t) => t.toLowerCase()));
      if (!wantedTags.every((t) => owned.has(t))) continue;
    }
    ranked.push({ entry, score });
  }
  ranked.sort((a, b) => b.score - a.score || sortedOrder(a.entry, b.entry));
  const facets = corpusFacets(
    ranked.map((r) => r.entry),
    24
  );
  const page = ranked.slice(offset, offset + limit).map((r) => r.entry);
  return { entries: page, total: ranked.length, query: trimmed, facets };
}

/** Corpus order as a tie-break, so equal scores never depend on Map order. */
function sortedOrder(a: CorpusEntry, b: CorpusEntry): number {
  if (b.year !== a.year) return b.year - a.year;
  if (a.title === b.title) return 0;
  return a.title < b.title ? -1 : 1;
}

/**
 * Prefix completion over the vocabulary, for the command palette.
 *
 * Ranked by document frequency so typing "in" surfaces "in-context-learning"
 * well before "inward". Exact matches sort first so a completed word does not
 * lose its own entry.
 */
export function suggest(query: string, n = 8): string[] {
  const prefix = query.trim().toLowerCase();
  if (prefix.length === 0) return [];
  const index = buildIndex();
  const matches: { term: string; count: number }[] = [];
  for (const term of index.vocabulary) {
    if (!term.startsWith(prefix)) continue;
    matches.push({ term, count: index.docFrequency.get(term) ?? 0 });
  }
  matches.sort((a, b) => {
    if (a.term === prefix && b.term !== prefix) return -1;
    if (b.term === prefix && a.term !== prefix) return 1;
    return b.count - a.count || (a.term < b.term ? -1 : 1);
  });
  return matches.slice(0, Math.max(0, n)).map((m) => m.term);
}

/** How many distinct terms the index knows about. */
export function vocabularySize(): number {
  return buildIndex().docFrequency.size;
}
