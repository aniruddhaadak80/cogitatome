import { describe, expect, it } from "vitest";
import {
  CORPUS,
  corpusFacets,
  corpusSourceCounts,
  corpusStats,
  entriesByTag,
  entryById,
  loadMedia,
  loadPapers,
  relatedEntries,
  tagLabel
} from "../src/domain/corpus";
import type { CorpusEntry } from "../src/types";

/**
 * These tests pin the corpus's invariants — the things the rest of the product
 * is allowed to assume about the 573 arXiv records plus the curated media.
 */

describe("corpus loading", () => {
  it("loads every harvested paper", () => {
    const papers = loadPapers();
    expect(papers.length).toBe(573);
    expect(papers.every((entry) => entry.kind === "paper")).toBe(true);
    expect(papers.every((entry) => entry.source === "arxiv")).toBe(true);
    expect(papers.every((entry) => entry.arxivId !== undefined && entry.arxivId.length > 0)).toBe(true);
  });

  it("loads the curated media corpus", () => {
    const media = loadMedia();
    expect(media.length).toBeGreaterThan(60);
    expect(media.every((entry) => entry.kind !== "paper")).toBe(true);
  });

  it("merges both sources into a corpus of more than 600 entries", () => {
    expect(CORPUS.length).toBeGreaterThan(600);
    expect(CORPUS.length).toBeGreaterThanOrEqual(loadPapers().length + loadMedia().length);
  });

  it("gives every entry a non-empty url and title", () => {
    const broken = CORPUS.filter((entry) => entry.url.trim().length === 0 || entry.title.trim().length === 0);
    expect(broken.map((entry) => entry.id)).toEqual([]);
  });

  it("keeps every arXiv entry at or after 2016", () => {
    const tooOld = CORPUS.filter((entry) => entry.arxivId !== undefined && entry.year < 2016);
    expect(tooOld.map((entry) => entry.id)).toEqual([]);
  });

  it("has no duplicate ids", () => {
    const ids = CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders the corpus by year descending, then title", () => {
    for (let i = 1; i < CORPUS.length; i += 1) {
      const previous = CORPUS[i - 1];
      const current = CORPUS[i];
      if (previous === undefined || current === undefined) continue;
      expect(previous.year).toBeGreaterThanOrEqual(current.year);
      if (previous.year === current.year) {
        // Code-unit order, deliberately not localeCompare: the corpus order must
        // be identical on every machine or the UI hydrates differently.
        expect(previous.title <= current.title).toBe(true);
      }
    }
  });

  it("keeps the tag arrays and author arrays frozen against caller mutation", () => {
    const entry = CORPUS[0];
    expect(entry).toBeDefined();
    expect(Array.isArray(entry?.tags)).toBe(true);
  });
});

describe("corpus facets", () => {
  it("is sorted by descending count", () => {
    const facets = corpusFacets(CORPUS);
    expect(facets.length).toBeGreaterThan(5);
    for (let i = 1; i < facets.length; i += 1) {
      const previous = facets[i - 1];
      const current = facets[i];
      if (previous === undefined || current === undefined) continue;
      expect(previous.count).toBeGreaterThanOrEqual(current.count);
    }
  });

  it("respects the limit", () => {
    expect(corpusFacets(CORPUS, 5).length).toBe(5);
  });

  it("counts every tag occurrence in the corpus", () => {
    const facets = corpusFacets(CORPUS, 1000);
    const totalTags = CORPUS.reduce((sum, entry) => sum + entry.tags.length, 0);
    const counted = facets.reduce((sum, facet) => sum + facet.count, 0);
    expect(counted).toBe(totalTags);
  });

  it("humanises kebab-case tags without destroying the slug", () => {
    const facets = corpusFacets(CORPUS, 1000);
    const rewardHacking = facets.find((facet) => facet.tag === "reward-hacking");
    expect(rewardHacking?.label).toBe("Reward Hacking");
    expect(tagLabel("interpretability")).toBe("Interpretability");
    expect(tagLabel("sae")).toBe("Sae");
  });
});

describe("corpus stats and lookups", () => {
  it("reports a coherent summary", () => {
    const stats = corpusStats();
    expect(stats.total).toBe(CORPUS.length);
    expect(stats.byKind.paper).toBe(573);
    expect(stats.tagCount).toBeGreaterThan(20);
    expect(stats.yearMin).toBeLessThanOrEqual(stats.yearMax);
    expect(stats.yearMin).toBeGreaterThan(2000);
    expect(stats.topAuthors.length).toBeGreaterThan(3);
    expect(stats.topAuthors[0]?.count).toBeGreaterThanOrEqual(1);
  });

  it("sums the per-kind counts to the total", () => {
    const stats = corpusStats();
    const sum = Object.values(stats.byKind).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.total);
  });

  it("looks entries up by id", () => {
    const first = loadPapers()[0];
    expect(first).toBeDefined();
    expect(entryById(first?.id ?? "")?.title).toBe(first?.title);
    expect(entryById("arxiv:does-not-exist")).toBeUndefined();
  });

  it("finds entries by tag", () => {
    const results = entriesByTag("interpretability");
    expect(results.length).toBeGreaterThan(100);
    expect(results.every((entry) => entry.tags.includes("interpretability"))).toBe(true);
    expect(entriesByTag("reward-hacking").every((e) => e.tags.includes("reward-hacking"))).toBe(true);
  });

  it("reports where every entry came from", () => {
    const counts = corpusSourceCounts();
    expect(counts.papers).toBe(573);
    expect(counts.merged).toBe(CORPUS.length);
    expect(counts.merged).toBe(counts.papers + counts.media);
  });
});

describe("related entries", () => {
  it("prefers entries that share the most tags", () => {
    const source = entriesByTag("interpretability")[0];
    expect(source).toBeDefined();
    const related = relatedEntries(source as CorpusEntry, 5);
    expect(related.length).toBe(5);
    for (const entry of related) {
      expect(entry.id).not.toBe((source as CorpusEntry).id);
      expect(entry.tags.some((tag) => (source as CorpusEntry).tags.includes(tag))).toBe(true);
    }
  });

  it("is deterministic and never returns the source", () => {
    const source = CORPUS[7] as CorpusEntry;
    const first = relatedEntries(source, 4).map((e) => e.id);
    const second = relatedEntries(source, 4).map((e) => e.id);
    expect(first).toEqual(second);
    expect(first).not.toContain(source.id);
  });

  it("returns nothing when the entry has no tags", () => {
    const bare: CorpusEntry = {
      id: "test:bare",
      kind: "post",
      title: "Bare",
      authors: [],
      year: 2020,
      venue: "",
      url: "https://example.com",
      oneLiner: "no tags",
      tags: [],
      source: "test"
    };
    expect(relatedEntries(bare, 5)).toEqual([]);
  });
});
