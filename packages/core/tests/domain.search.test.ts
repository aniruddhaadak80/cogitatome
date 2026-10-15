import { describe, expect, it } from "vitest";
import {
  BM25_B,
  BM25_K1,
  FIELD_WEIGHTS,
  CorpusIndex,
  buildIndex,
  indexDoc,
  searchCorpus,
  suggest,
  tokenize,
  vocabularySize
} from "../src/domain/search";
import { CORPUS } from "../src/domain/corpus";
import type { CorpusEntry } from "../src/types";

/** Every result for `q` must mention `needle` somewhere it can be ranked on. */
function mentions(entry: CorpusEntry, needle: string): boolean {
  const haystack = `${entry.title} ${entry.oneLiner} ${entry.abstract ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

describe("tokenisation", () => {
  it("lowercases, splits on non-alphanumerics and drops stopwords", () => {
    expect(tokenize("In-Context Learning and Induction Heads: the study")).toEqual([
      "context",
      "learning",
      "induction",
      "heads",
      "study"
    ]);
  });

  it("drops purely punctuation input", () => {
    expect(tokenize(" — ... ,, ")).toEqual([]);
  });
});

describe("index construction", () => {
  it("indexes the whole corpus in well under a second", () => {
    const started = Date.now();
    const index = new CorpusIndex(CORPUS);
    const elapsed = Date.now() - started;
    expect(index.entries.length).toBe(CORPUS.length);
    expect(elapsed).toBeLessThan(1000);
  });

  it("memoises on the array identity", () => {
    const first = buildIndex(CORPUS);
    const second = buildIndex(CORPUS);
    expect(first).toBe(second);
    const third = buildIndex(CORPUS.slice(0, 10));
    expect(third).not.toBe(first);
    expect(third.entries.length).toBe(10);
  });

  it("knows a real vocabulary size", () => {
    expect(vocabularySize()).toBeGreaterThan(3000);
  });

  it("weights fields as documented", () => {
    expect(FIELD_WEIGHTS.title).toBe(3);
    expect(FIELD_WEIGHTS.oneLiner).toBe(2);
    expect(FIELD_WEIGHTS.tags).toBe(2.5);
    expect(FIELD_WEIGHTS.abstract).toBe(0.6);
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });
});

describe("corpus search", () => {
  it("returns entries about the query", () => {
    const result = searchCorpus("induction head", { limit: 25 });
    expect(result.entries.length).toBeGreaterThan(5);
    expect(result.total).toBeGreaterThanOrEqual(result.entries.length);
    // Every hit matches at least one query term somewhere rankable.
    for (const entry of result.entries) {
      expect(mentions(entry, "induction") || mentions(entry, "head"), entry.title).toBe(true);
    }
    // The top of the ranking is dominated by the rarer, more specific term.
    for (const entry of result.entries.slice(0, 5)) {
      expect(mentions(entry, "induction"), entry.title).toBe(true);
    }
  });

  it("puts a known paper on top for a known query", () => {
    const result = searchCorpus("induction head", { limit: 5 });
    expect(result.entries[0]).toBeDefined();
    expect(mentions(result.entries[0] as CorpusEntry, "induction")).toBe(true);
    const titles = result.entries.map((e) => e.title).join(" | ");
    expect(titles.toLowerCase()).toContain("induction");
  });

  it("finds sparse autoencoder work", () => {
    const result = searchCorpus("sparse autoencoder", { limit: 10 });
    expect(result.entries.length).toBeGreaterThan(3);
    const top = result.entries[0] as CorpusEntry;
    expect(`${top.title} ${top.oneLiner}`.toLowerCase()).toContain("sparse autoencoder");
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(searchCorpus("", {}).entries).toEqual([]);
    expect(searchCorpus("   ", {}).entries).toEqual([]);
    expect(searchCorpus("").total).toBe(0);
    expect(searchCorpus("").facets).toEqual([]);
  });

  it("returns nothing for a stopword-only query", () => {
    expect(searchCorpus("the of and", {}).entries).toEqual([]);
  });

  it("filters by kind", () => {
    const papers = searchCorpus("induction", { kind: "paper", limit: 100 });
    expect(papers.entries.every((entry) => entry.kind === "paper")).toBe(true);
    const talks = searchCorpus("induction", { kind: "talk", limit: 100 });
    expect(talks.entries.every((entry) => entry.kind === "talk")).toBe(true);
    expect(talks.entries.length).toBeGreaterThan(0);
  });

  it("filters by tag, requiring every listed tag", () => {
    const result = searchCorpus("induction", { tags: ["interpretability"], limit: 100 });
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.tags).toContain("interpretability");
    }
    const both = searchCorpus("induction", {
      tags: ["interpretability", "circuits"],
      limit: 100
    });
    for (const entry of both.entries) {
      expect(entry.tags).toContain("interpretability");
      expect(entry.tags).toContain("circuits");
    }
    expect(both.total).toBeLessThanOrEqual(result.total);
  });

  it("paginates without changing the total", () => {
    const first = searchCorpus("sparse autoencoder", { limit: 5, offset: 0 });
    const second = searchCorpus("sparse autoencoder", { limit: 5, offset: 5 });
    expect(first.total).toBe(second.total);
    const ids = [...first.entries, ...second.entries].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("computes facets over all matches, not just the page", () => {
    const small = searchCorpus("sparse autoencoder", { limit: 2 });
    const large = searchCorpus("sparse autoencoder", { limit: 50 });
    expect(small.facets).toEqual(large.facets);
    const top = small.facets[0];
    expect(top?.label).toBe("Interpretability");
  });

  it("is deterministic across calls", () => {
    const a = searchCorpus("grokking", { limit: 10 });
    const b = searchCorpus("grokking", { limit: 10 });
    expect(a.entries.map((e) => e.id)).toEqual(b.entries.map((e) => e.id));
    expect(a.total).toBe(b.total);
  });

  it("orders results by descending score, breaking ties deterministically", () => {
    const index = buildIndex();
    const result = searchCorpus("induction", { limit: 200 });
    const scores = index.scoreAll(tokenize("induction"));
    for (let i = 1; i < result.entries.length; i += 1) {
      const previous = result.entries[i - 1] as CorpusEntry;
      const current = result.entries[i] as CorpusEntry;
      const prevScore = scores.get(CORPUS.indexOf(previous)) ?? 0;
      const currScore = scores.get(CORPUS.indexOf(current)) ?? 0;
      expect(prevScore).toBeGreaterThanOrEqual(currScore);
    }
  });

  it("indexes every field it claims to", () => {
    const entry: CorpusEntry = {
      id: "test:fields",
      kind: "post",
      title: "Zzxqqk",
      authors: ["A"],
      year: 2024,
      venue: "test",
      url: "https://example.com",
      oneLiner: "Wvunmld",
      tags: ["qqxxzz"],
      source: "test",
      abstract: "Jjhhgg Content Ffddss only here"
    };
    const doc = indexDoc(entry);
    expect(doc.weightedTerms.get("zzxqqk")).toBe(3);
    expect(doc.weightedTerms.get("wvunmld")).toBe(2);
    expect(doc.weightedTerms.get("qqxxzz")).toBe(2.5);
    expect(doc.weightedTerms.get("jjhhgg")).toBe(0.6);
  });
});

describe("suggestions", () => {
  it("completes prefixes over the vocabulary", () => {
    const results = suggest("indu", 10);
    expect(results).toContain("induction");
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("prefers frequent completions", () => {
    const results = suggest("super", 5);
    expect(results[0]).toBeDefined();
    expect(results).toContain("supervision");
    expect(results).toContain("superposition");
  });

  it("returns nothing for an empty prefix", () => {
    expect(suggest("", 5)).toEqual([]);
    expect(suggest("   ", 5)).toEqual([]);
  });

  it("returns nothing for an unknown prefix", () => {
    expect(suggest("zzqqxx", 5)).toEqual([]);
  });

  it("honours the count argument", () => {
    expect(suggest("indu", 2).length).toBe(2);
    expect(suggest("indu", 0)).toEqual([]);
  });
});
