import { describe, expect, it } from "vitest";
import { CogitatomeModel, constructInductionModel, makeRepeated } from "../src";
import { attributionSummary, rankByAttribution, tokenAttribution } from "../src/interpret/gradients";

describe("tokenAttribution", () => {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated([1, 2, 3, 4], 2);

  it("produces one attribution per position", () => {
    const report = tokenAttribution(model, tokens, 1);
    expect(report.attributions).toHaveLength(tokens.length);
  });

  it("is deterministic", () => {
    const a = tokenAttribution(model, tokens, 1);
    const b = tokenAttribution(model, tokens, 1);
    expect(a).toEqual(b);
  });

  it("normalises importance so the max is 1.0", () => {
    const report = tokenAttribution(model, tokens, 1);
    const max = Math.max(...report.attributions.map((a) => a.normalised));
    expect(max).toBeCloseTo(1.0, 5);
  });

  it("ranks positions by importance, most important first", () => {
    const report = tokenAttribution(model, tokens, 1);
    const ranked = rankByAttribution(report);
    expect(ranked.length).toBe(tokens.length);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.importance).toBeGreaterThanOrEqual(ranked[i]!.importance);
    }
  });

  it("produces a human-readable summary", () => {
    const report = tokenAttribution(model, tokens, 1);
    const summary = attributionSummary(report);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0]).toMatch(/Position \d+/);
  });

  it("the last position always has non-zero importance", () => {
    const report = tokenAttribution(model, tokens, 1);
    const last = report.attributions[report.attributions.length - 1]!;
    expect(last.importance).toBeGreaterThan(0);
  });
});

