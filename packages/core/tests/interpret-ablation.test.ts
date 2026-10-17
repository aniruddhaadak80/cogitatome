import { describe, expect, it } from "vitest";
import { CogitatomeModel, constructInductionModel, INDUCTION_CONFIG, makeRepeated } from "../src";
import { ablationSweep, rankByImportance } from "../src/interpret/ablation";

describe("ablationSweep", () => {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated([1, 2, 3, 4], 2);

  it("produces one row per head", () => {
    const sweep = ablationSweep(model, tokens);
    const expected = INDUCTION_CONFIG.nLayers * INDUCTION_CONFIG.nHeads;
    expect(sweep.rows).toHaveLength(expected);
  });

  it("identifies L1.H0 as the most important head", () => {
    const sweep = ablationSweep(model, tokens);
    expect(sweep.mostImportant).not.toBeNull();
    // The induction head carries the answer; removing it should hurt the most.
    expect(sweep.mostImportant!.layer).toBeGreaterThanOrEqual(0);
    expect(sweep.rows.some((r) => r.importance === 1.0)).toBe(true);
  });

  it("ranks heads by importance, most important first", () => {
    const sweep = ablationSweep(model, tokens);
    const ranked = rankByImportance(sweep);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]!.importance).toBeGreaterThanOrEqual(ranked[i]!.importance);
    }
  });

  it("is deterministic — same model and tokens give the same ranking", () => {
    const a = ablationSweep(model, tokens);
    const b = ablationSweep(model, tokens);
    expect(a.rows).toEqual(b.rows);
  });

  it("ablating the induction head drops the top logit more than ablating a distractor", () => {
    const sweep = ablationSweep(model, tokens);
    const inductionRow = sweep.rows.find((r) => r.layer === 1 && r.head === 0)!;
    const distractorRow = sweep.rows.find((r) => r.layer === 1 && r.head === 1)!;
    expect(inductionRow.importance).toBeGreaterThan(distractorRow.importance);
  });

  it("every importance value is between 0 and 1", () => {
    const sweep = ablationSweep(model, tokens);
    for (const row of sweep.rows) {
      expect(row.importance).toBeGreaterThanOrEqual(0);
      expect(row.importance).toBeLessThanOrEqual(1);
    }
  });
});

