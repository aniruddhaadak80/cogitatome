import { describe, expect, it } from "vitest";
import {
  CogitatomeModel,
  SUBSPACE,
  constructInductionModel,
  randomWeights
} from "../src/model";
import {
  ALPHABET_SIZE,
  ANCHOR_TOKEN,
  USABLE_TOKENS,
  controlStimulus,
  makeRepeated
} from "../src/tokenizer";
import { argMax } from "../src/math";

const MOTIF = [1, 2, 3, 4];
const tokens = makeRepeated(MOTIF, 6);

function argMaxOf(row: readonly number[]): number {
  return argMax(row);
}

describe("the tokenizer", () => {
  it("reserves symbol 0 as the anchor and leaves 15 usable symbols", () => {
    expect(ANCHOR_TOKEN).toBe(0);
    expect(USABLE_TOKENS).toHaveLength(ALPHABET_SIZE - 1);
    expect(USABLE_TOKENS).not.toContain(ANCHOR_TOKEN);
  });

  it("prefixes every stimulus with the anchor", () => {
    expect(tokens[0]).toBe(ANCHOR_TOKEN);
    expect(tokens).toHaveLength(1 + 6 * MOTIF.length);
    expect(controlStimulus(20)).toHaveLength(20);
  });
});

describe("the constructed induction transformer", () => {
  const model = new CogitatomeModel(constructInductionModel());
  const trace = model.forward(tokens);

  it("is a two-layer attention-only model with a known label", () => {
    expect(model.config.nLayers).toBe(2);
    expect(model.weights.useMlp).toBe(false);
    expect(model.weights.useLayerNorm).toBe(false);
    expect(model.weights.label).toContain("induction");
  });

  it("predicts the continuation of a repeated motif on every learnable position", () => {
    const predicted = trace.logits.map((l) => argMaxOf(Array.from(l)));
    // Position i is learnable only if the current token already appeared once
    // before it, which first happens at i = motifLength + 1 (the second copy of
    // the last motif symbol). Before that there is genuinely nothing to attend
    // back to, so those predictions cannot be right.
    const cutoff = MOTIF.length + 1;
    const learnable = tokens.length - 1 - cutoff;
    let hits = 0;
    for (let i = cutoff; i < tokens.length - 1; i += 1) {
      if (predicted[i] === tokens[i + 1]) hits += 1;
    }
    expect(learnable).toBeGreaterThan(15);
    expect(hits).toBe(learnable);
  });

  it("puts a previous-token head in layer 0", () => {
    const row = trace.layers[0]?.attention[0];
    expect(row).toBeDefined();
    let mass = 0;
    let count = 0;
    row?.forEach((weights, q) => {
      if (q > 0) {
        mass += weights[q - 1] ?? 0;
        count += 1;
      }
    });
    expect(count).toBeGreaterThan(0);
    expect(mass / count).toBeGreaterThan(0.85);
  });

  it("routes layer 1 head 0's attention to earlier occurrences of the current token", () => {
    const row = trace.layers[1]?.attention[0];
    let induction = 0;
    let total = 0;
    row?.forEach((weights, q) => {
      for (let k = 1; k < q; k += 1) {
        const w = weights[k] ?? 0;
        total += w;
        if (tokens[k - 1] === tokens[q]) induction += w;
      }
    });
    expect(total).toBeGreaterThan(0);
    expect(induction / total).toBeGreaterThan(0.5);
  });

  it("writes the previous-token code into the shifted subspace only", () => {
    const afterL0 = trace.layers[0]?.residual;
    const at3 = afterL0?.[3];
    expect(at3).toBeDefined();
    if (!at3) return;
    // At position 3 the previous token is tokens[2] = 2, so the shifted lane
    // must hold the code for symbol 2 and nothing else.
    expect(at3[SUBSPACE.shiftedStart + 2]).toBeGreaterThan(0.85);
    for (let d = SUBSPACE.shiftedStart; d < SUBSPACE.shiftedEnd; d += 1) {
      if (d !== SUBSPACE.shiftedStart + 2) expect(Math.abs(at3[d] ?? 0)).toBeLessThan(0.1);
    }
    // The token lane still holds the current token (symbol 3).
    expect(at3[SUBSPACE.tokenStart + 3]).toBeGreaterThan(0.85);
    for (let d = SUBSPACE.tokenStart; d < SUBSPACE.tokenEnd; d += 1) {
      if (d !== SUBSPACE.tokenStart + 3) expect(Math.abs(at3[d] ?? 0)).toBeLessThan(0.1);
    }
    // Layer 0 writes nothing into the noise lane.
    expect(at3[SUBSPACE.noiseStart]).toBe(0);
  });

  it("keeps the random model from learning anything on this stimulus", () => {
    const random = new CogitatomeModel(randomWeights());
    const predicted = random.forward(tokens).logits.map((l) => argMaxOf(Array.from(l)));
    const learnable = tokens.length - 1 - (MOTIF.length + 1);
    const hits = predicted.filter((p, i) => i >= MOTIF.length + 1 && p === tokens[i + 1]).length;
    expect(hits).toBeLessThan(learnable);
  });

  it("ablating the induction head destroys the learnable predictions", () => {
    const ablated = model.ablateHead(tokens, 1, 0);
    const predicted = ablated.logits.map((l) => argMaxOf(Array.from(l)));
    const cutoff = MOTIF.length + 1;
    const learnable = tokens.length - 1 - cutoff;
    const hits = predicted.filter((p, i) => i >= cutoff && p === tokens[i + 1]).length;
    expect(hits).toBeLessThan(learnable * 0.5);
  });

  it("recovers the same trace on every run", () => {
    const again = model.forward(tokens);
    expect(again.logits[7]?.[2]).toBeCloseTo(trace.logits[7]?.[2] ?? 0, 12);
  });

  it("rejects out-of-vocabulary tokens and over-long sequences", () => {
    expect(() => model.forward([ALPHABET_SIZE])).toThrow(RangeError);
    expect(() => model.forward(new Array(64).fill(1))).toThrow(RangeError);
  });
});
