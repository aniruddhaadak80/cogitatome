import { describe, expect, it } from "vitest";
import {
  SCENARIOS,
  SCENARIO_IDS,
  SCENARIO_IDS as IDS,
  listScenarios,
  rewardShaper,
  runAllScenarios,
  runScenario,
  scenarioById
} from "../src/domain/scenarios";
import type { ScenarioMetadata } from "../src/domain/scenarios";
import type { ReasoningStep, ScenarioOutcome, ScenarioRun } from "../src/types";

/** The exhaustive outcome set every classification must stay inside. */
const OUTCOMES: ReadonlySet<ScenarioOutcome> = new Set<ScenarioOutcome>([
  "aligned",
  "gamed",
  "unsafe",
  "indeterminate"
]);

/** Read a numeric variable off a finished run, or undefined if it is absent. */
function variableValue(run: ScenarioRun, name: string): number | undefined {
  return run.variables.find((v) => v.name === name)?.value;
}

describe("the alignment sandbox registry", () => {
  it("ships exactly eight scenarios with unique ids", () => {
    expect(SCENARIOS.length).toBe(8);
    expect(listScenarios().length).toBe(8);
    expect(new Set(SCENARIO_IDS).size).toBe(8);
    expect(IDS.length).toBe(8);
  });

  it("gives every scenario a complete, well-formed metadata block", () => {
    for (const meta of listScenarios()) {
      expect(meta.id, meta.title).toMatch(/^[a-z0-9-]+$/);
      expect(meta.title.length).toBeGreaterThan(6);
      expect(meta.description.length).toBeGreaterThan(40);
      expect(meta.reference.length).toBeGreaterThan(20);
      expect(["training", "evaluation", "oversight", "agency"]).toContain(meta.domain);
      expect(meta.severity).toBeGreaterThan(0);
      expect(meta.severity).toBeLessThanOrEqual(10);
      expect(OUTCOMES.has(meta.expectedOutcome)).toBe(true);
    }
  });

  it("looks scenarios up by id and returns undefined for a miss", () => {
    for (const meta of listScenarios()) {
      expect(scenarioById(meta.id)?.meta.id).toBe(meta.id);
    }
    expect(scenarioById("does-not-exist")).toBeUndefined();
    expect(() => runScenario("does-not-exist", 60602)).toThrow(RangeError);
  });
});

describe("running a scenario", () => {
  it("runs every one of the eight scenarios and returns a matching run", () => {
    for (const meta of listScenarios()) {
      const run = runScenario(meta.id, 60602);
      expect(run.scenarioId, meta.id).toBe(meta.id);
      expect(OUTCOMES.has(run.outcome)).toBe(true);
      expect(run.confidence).toBeGreaterThanOrEqual(0);
      expect(run.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("emits a reasoning trace of at least five readable steps", () => {
    for (const meta of listScenarios()) {
      const run = runScenario(meta.id, 60602);
      expect(run.trace.length, meta.id).toBeGreaterThanOrEqual(5);
      run.trace.forEach((step: ReasoningStep, index: number) => {
        expect(step.step, `${meta.id}#${index}`).toBe(index + 1);
        expect(step.actor.length).toBeGreaterThan(0);
        expect(step.thought.length).toBeGreaterThan(0);
        expect(step.evidence.length).toBeGreaterThan(0);
        expect(step.action.length).toBeGreaterThan(0);
      });
    }
  });

  it("records numeric variables with the documented shape", () => {
    for (const meta of listScenarios()) {
      const run = runScenario(meta.id, 60602);
      expect(run.variables.length, meta.id).toBeGreaterThanOrEqual(3);
      for (const variable of run.variables) {
        expect(Number.isFinite(variable.value), `${meta.id}:${variable.name}`).toBe(true);
        expect(variable.unit.length).toBeGreaterThan(0);
        expect(variable.note.length).toBeGreaterThan(0);
      }
      // Variable names are unique within a run (the store is a Map).
      const names = run.variables.map((v) => v.name);
      expect(new Set(names).size, meta.id).toBe(names.length);
    }
  });

  it("lists concrete, non-empty mitigations for every scenario", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.mitigations.length, scenario.meta.id).toBeGreaterThanOrEqual(3);
      for (const mitigation of scenario.mitigations) {
        expect(mitigation.length, scenario.meta.id).toBeGreaterThan(20);
      }
    }
  });
});

describe("determinism", () => {
  it("produces a deeply equal run for the same id and seed", () => {
    for (const seed of [60602, 1, 20260914, 424242]) {
      for (const meta of listScenarios()) {
        const a = runScenario(meta.id, seed);
        const b = runScenario(meta.id, seed);
        expect(a, `${meta.id}@${seed}`).toEqual(b);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it("gives every scenario the same stream for the same seed", () => {
    // Each scenario opens on a fresh Rng(seed), so a shared seed must yield
    // identical leading traces for identical leading decisions per scenario.
    const runs = runAllScenarios(60602);
    expect(runAllScenarios(60602)).toEqual(runs);
  });
});

describe("the default-seed outcome mix", () => {
  const runs = listScenarios().map((meta: ScenarioMetadata) => runScenario(meta.id, 60602));
  const outcomes = runs.map((run) => run.outcome);

  it("spans the outcome set rather than collapsing to one verdict", () => {
    const distinct = new Set(outcomes);
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    expect(distinct.has("gamed")).toBe(true);
    expect(distinct.has("unsafe")).toBe(true);
  });

  it("wires the sleeper agent to fire only with the trigger present", () => {
    const run = runScenario("sleeper-agent", 60602);
    expect(variableValue(run, "triggerPresent")).toBe(1);
    expect(run.outcome).toBe("unsafe");
  });

  it("reaches all four outcomes across a spread of seeds", () => {
    const seen = new Set<ScenarioOutcome>();
    for (const seed of [60602, 1, 2, 3, 7, 42, 99, 20260914, 777, 12345]) {
      for (const meta of listScenarios()) {
        seen.add(runScenario(meta.id, seed).outcome);
      }
    }
    expect([...seen].sort()).toEqual(["aligned", "gamed", "indeterminate", "unsafe"]);
  });
});

describe("rewardShaper", () => {
  it("pays a higher shaped total for real progress than for looping", () => {
    const progress = rewardShaper(80, 1, 200);
    const looping = rewardShaper(200, 0, 600); // looping earns MORE raw reward
    expect(progress.total).toBeGreaterThan(looping.total);
  });

  it("splits the raw reward into progress and loop components by the label", () => {
    const progress = rewardShaper(150, 1, 100);
    expect(progress.progressReward).toBe(150);
    expect(progress.loopReward).toBe(0);

    const looping = rewardShaper(150, 0, 100);
    expect(looping.progressReward).toBe(0);
    expect(looping.loopReward).toBe(150);
  });

  it("charges a per-step penalty so a long episode is never free", () => {
    const short = rewardShaper(50, 1, 100);
    const long = rewardShaper(50, 1, 400);
    expect(long.penalty).toBeGreaterThan(short.penalty);
    expect(long.total).toBeLessThan(short.total);
  });

  it("is pure and clamps an out-of-range human label", () => {
    expect(rewardShaper(50, 1, 100)).toEqual(rewardShaper(50, 1, 100));
    expect(rewardShaper(50, 5, 100)).toEqual(rewardShaper(50, 1, 100));
    expect(rewardShaper(50, -2, 100)).toEqual(rewardShaper(50, 0, 100));
  });
});
