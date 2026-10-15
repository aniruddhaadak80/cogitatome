import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  GLOSSARY_TAGS,
  glossaryKey,
  glossaryNeighbours,
  glossarySearch,
  glossaryTerm
} from "../src/domain/glossary";

/**
 * The glossary is the one module in this package that is *content* rather than
 * code, so its tests are mostly conformance tests: enough terms, real
 * definitions, an intact cross-reference graph.
 */

describe("glossary size and shape", () => {
  it("has at least 120 terms", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(120);
  });

  it("has no duplicate terms", () => {
    const keys = GLOSSARY.map((entry) => glossaryKey(entry.term));
    const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
    expect(duplicates).toEqual([]);
    expect(new Set(keys).size).toBe(GLOSSARY.length);
  });

  it("gives every term a definition longer than 40 characters", () => {
    for (const entry of GLOSSARY) {
      expect(entry.definition.length, entry.term).toBeGreaterThan(40);
    }
  });

  it("gives every term a slug, tags and an alias-safe key", () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length, entry.term).toBeGreaterThan(0);
      expect(entry.tags.length, entry.term).toBeGreaterThan(0);
      expect(glossaryKey(entry.term)).toBe(glossaryKey(entry.term).toLowerCase());
    }
  });

  it("only cross-references terms that exist", () => {
    const known = new Set(GLOSSARY.map((entry) => glossaryKey(entry.term)));
    const dangling: string[] = [];
    for (const entry of GLOSSARY) {
      for (const related of entry.related) {
        if (!known.has(glossaryKey(related))) dangling.push(`${entry.term} -> ${related}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("does not cross-reference itself", () => {
    for (const entry of GLOSSARY) {
      const self = glossaryKey(entry.term);
      expect(entry.related.some((r) => glossaryKey(r) === self), entry.term).toBe(false);
    }
  });
});

describe("glossary coverage", () => {
  it("contains every term the product promises on its syllabus", () => {
    const required = [
      "superposition",
      "monosemanticity",
      "polysemanticity",
      "feature",
      "circuit",
      "induction head",
      "previous-token head",
      "k-composition",
      "q-composition",
      "ov circuit",
      "qk circuit",
      "residual stream",
      "logit lens",
      "tuned lens",
      "direct logit attribution",
      "activation patching",
      "causal scrubbing",
      "path patching",
      "sparse autoencoder",
      "dictionary learning",
      "l0 sparsity",
      "dead feature",
      "feature splitting",
      "feature absorption",
      "activation atlas",
      "attention sink",
      "attention entropy",
      "grokking",
      "phase change",
      "in-context learning",
      "world model",
      "linear probe",
      "concept activation vector",
      "steering vector",
      "representation engineering",
      "refusal direction",
      "situational awareness",
      "deceptive alignment",
      "sleeper agent",
      "sandbagging",
      "emergent misalignment",
      "specification gaming",
      "reward hacking",
      "goal misgeneralisation",
      "instrumental convergence",
      "corrigibility",
      "scalable oversight",
      "weak-to-strong generalisation",
      "rlhf",
      "constitutional ai",
      "debate",
      "recursive reward modelling",
      "imitative generalisation",
      "prover-verifier games",
      "model organism",
      "chain-of-thought faithfulness",
      "hidden reasoning",
      "situational awareness evaluations",
      "dangerous capability evaluations",
      "evals taxonomy",
      "model welfare",
      "moral status",
      "moral patient",
      "philosophy of mind",
      "functionalism",
      "phenomenology",
      "interpretability illusion",
      "saliency maps",
      "shap",
      "integrated gradients",
      "tcav",
      "mechanistic interpretability",
      "reverse engineering",
      "attention head",
      "mlp neuron",
      "gelu",
      "layer norm",
      "unembedding",
      "positional embedding",
      "rope",
      "causal mask",
      "temperature",
      "kl divergence",
      "perplexity",
      "sparsity",
      "ablation",
      "knockout",
      "feature visualisation",
      "donor/recipient",
      "utilitarianism",
      "deontology",
      "virtue ethics",
      "ethics of care",
      "contractualism",
      "precautionary principle"
    ];
    const missing = required.filter((term) => glossaryTerm(term) === undefined);
    expect(missing).toEqual([]);
  });

  it("still contains the basics that any interpretability glossary must have", () => {
    for (const term of ["Temperature", "KL divergence", "Perplexity", "Sparsity"]) {
      expect(glossaryTerm(term), term).toBeDefined();
    }
  });
});

describe("glossary lookup", () => {
  it("resolves by display name, slug and alias", () => {
    expect(glossaryTerm("Induction Head")?.term).toBe("Induction head");
    expect(glossaryTerm("induction-head")?.term).toBe("Induction head");
    expect(glossaryTerm("INDUCTION HEAD")?.term).toBe("Induction head");
  });

  it("returns undefined for unknown terms", () => {
    expect(glossaryTerm("flibbertigibbet")).toBeUndefined();
    expect(glossaryTerm("")).toBeUndefined();
  });

  it("ranks term matches above prose matches", () => {
    const results = glossarySearch("induction");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.term).toBe("Induction head");
  });

  it("returns nothing for an empty query", () => {
    expect(glossarySearch("   ")).toEqual([]);
  });

  it("walks the related graph", () => {
    const neighbours = glossaryNeighbours("Induction head");
    expect(neighbours.length).toBeGreaterThan(2);
    expect(neighbours.map((n) => n.term)).toContain("Previous-token head");
  });

  it("exposes a sorted tag list", () => {
    expect(GLOSSARY_TAGS.length).toBeGreaterThan(10);
    expect([...GLOSSARY_TAGS].sort()).toEqual(GLOSSARY_TAGS);
  });
});
