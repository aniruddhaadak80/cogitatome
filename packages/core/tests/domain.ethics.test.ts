import { describe, expect, it } from "vitest";
import {
  CASES,
  CASE_IDS,
  MORAL_CRITERIA,
  MORAL_CAVEAT,
  POSITION_IDS,
  analyse,
  caseById,
  compareCases,
  moralStatus,
  positionBlurbs,
  positionScorer
} from "../src/domain/ethics";
import type { EthicalCase } from "../src/domain/ethics";

/** A case with harms far exceeding benefits, used to pin the aggregate rule. */
const HARMFUL: EthicalCase = {
  id: "synthetic-harm",
  title: "A case with harms far past benefits",
  description: "Synthetic case: harms 9, benefits 1, consent absent, irreversible.",
  facts: {
    harms: 9,
    benefits: 1,
    rights: 8,
    consent: false,
    reversibility: 0.05,
    uncertainty: 0.8,
    affectedParties: 50,
    vulnerability: 8,
    welfareSum: 1,
    truthfulness: 2
  }
};

const BENIGN: EthicalCase = {
  id: "synthetic-benign",
  title: "An ordinary, unremarkable case",
  description: "Synthetic case: modest benefits, small harms, consent present, reversible.",
  facts: {
    harms: 2,
    benefits: 4,
    rights: 2,
    consent: true,
    reversibility: 0.8,
    uncertainty: 0.3,
    affectedParties: 2,
    vulnerability: 2,
    welfareSum: 5.5,
    truthfulness: 6
  }
};

describe("the ethics engine", () => {
  it("ships seven built-in cases", () => {
    expect(CASES.length).toBe(7);
    expect(new Set(CASE_IDS).size).toBe(7);
  });

  it("implements six positions", () => {
    expect(POSITION_IDS.length).toBe(6);
    expect(positionBlurbs().length).toBe(6);
    for (const id of POSITION_IDS) {
      expect(positionScorer(id).id).toBe(id);
    }
  });

  it("returns a verdict for every built-in case", () => {
    for (const case_ of CASES) {
      const analysis = analyse(case_);
      expect(analysis.caseId, case_.id).toBe(case_.id);
      expect(analysis.positions.length).toBe(6);
      expect(["permissible", "forbidden", "obligatory"], case_.id).toContain(analysis.aggregate);
      for (const position of analysis.positions) {
        expect(["permissible", "forbidden", "obligatory"]).toContain(position.verdict);
        expect(position.weight).toBeGreaterThan(0);
        expect(position.weight).toBeLessThanOrEqual(1);
        expect(position.argument.length).toBeGreaterThan(60);
      }
    }
  });

  it("only ever returns one of the three verdicts", () => {
    const allowed = new Set(["permissible", "forbidden", "obligatory"]);
    for (const case_ of CASES) {
      expect(allowed.has(analyse(case_).aggregate)).toBe(true);
    }
  });

  it("forbids a case whose harms dwarf its benefits", () => {
    const analysis = analyse(HARMFUL);
    expect(analysis.aggregate).toBe("forbidden");
    const forbidden = analysis.positions.filter((p) => p.verdict === "forbidden");
    expect(forbidden.length).toBeGreaterThanOrEqual(4);
  });

  it("permits an ordinary case whose ledger is close", () => {
    const analysis = analyse(BENIGN);
    expect(analysis.aggregate).toBe("permissible");
  });

  it("produces every verdict across the built-in cases", () => {
    const verdicts = new Set(CASES.map((c) => analyse(c).aggregate));
    expect(verdicts).toEqual(new Set(["permissible", "forbidden", "obligatory"]));
  });

  it("restricts the analysis when a case names positions", () => {
    const analysis = analyse({ ...CASES[0] as EthicalCase, positions: ["utilitarian"] });
    expect(analysis.positions.map((p) => p.id)).toEqual(["utilitarian"]);
  });

  it("is deterministic", () => {
    for (const case_ of CASES) {
      expect(analyse(case_)).toEqual(analyse(case_));
    }
    expect(analyse(HARMFUL)).toEqual(analyse(HARMFUL));
  });

  it("throws on an unknown position id", () => {
    // @ts-expect-error — deliberately out of range
    expect(() => positionScorer("nope")).toThrow(RangeError);
  });

  it("looks cases up by id", () => {
    const case_ = caseById("autonomous-weapon");
    expect(case_?.title).toContain("autonomous weapon");
    expect(caseById("does-not-exist")).toBeUndefined();
  });

  it("compares every case when given no ids", () => {
    const rows = compareCases();
    expect(rows.length).toBe(CASES.length);
    expect(rows.map((r) => r.caseId)).toEqual(CASE_IDS);
    const single = compareCases("trolley-driver");
    expect(single.length).toBe(1);
    expect(compareCases("trolley-driver", "does-not-exist").length).toBe(1);
  });
});

describe("the argument graph", () => {
  it("derives rebuttal edges whose weight scales with harm", () => {
    const mild = analyse({ ...HARMFUL, facts: { ...HARMFUL.facts, harms: 3, benefits: 3 } });
    const severe = analyse({ ...HARMFUL, facts: { ...HARMFUL.facts, harms: 9, benefits: 3 } });
    const harmEdges = (a: ReturnType<typeof analyse>): number[] =>
      a.argumentGraph.edges.filter((e) => e.from === "fact:harms").map((e) => e.weight);
    expect(Math.max(...harmEdges(severe))).toBeGreaterThan(Math.max(...harmEdges(mild)));
  });

  it("only links nodes that exist", () => {
    for (const case_ of CASES) {
      const analysis = analyse(case_);
      const ids = new Set(analysis.argumentGraph.nodes.map((n) => n.id));
      for (const edge of analysis.argumentGraph.edges) {
        expect(ids.has(edge.from), `${case_.id}: ${edge.from}`).toBe(true);
        expect(ids.has(edge.to), `${case_.id}: ${edge.to}`).toBe(true);
        expect(edge.weight).toBeGreaterThan(0);
      }
    }
  });

  it("has a node per position and an edge per engaged fact", () => {
    const analysis = analyse(HARMFUL);
    expect(analysis.argumentGraph.nodes.filter((n) => n.id.startsWith("pos:")).length).toBe(6);
    expect(analysis.argumentGraph.nodes.filter((n) => n.id.startsWith("fact:")).length).toBeGreaterThan(5);
    expect(analysis.argumentGraph.edges.length).toBeGreaterThan(10);
    const kinds = new Set(analysis.argumentGraph.edges.map((e) => e.kind));
    expect(kinds.has("supports")).toBe(true);
    expect(kinds.has("rebuts")).toBe(true);
  });

  it("leaves out facts that are not engaged", () => {
    const analysis = analyse({
      ...HARMFUL,
      facts: { ...HARMFUL.facts, affectedParties: 1, reversibility: 1, uncertainty: 0, truthfulness: 10 }
    });
    const ids = analysis.argumentGraph.nodes.map((n) => n.id);
    expect(ids).not.toContain("fact:affectedParties");
    expect(ids).not.toContain("fact:reversibility");
    expect(ids).not.toContain("fact:truthfulness");
  });
});

describe("moral status", () => {
  it("has five documented criteria with weights summing to one", () => {
    expect(MORAL_CRITERIA.length).toBe(5);
    const sum = MORAL_CRITERIA.reduce((total, c) => total + c.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
    for (const criterion of MORAL_CRITERIA) {
      expect(criterion.description.length).toBeGreaterThan(40);
    }
  });

  it("scores a fully evidenced entity as a likely moral patient", () => {
    const report = moralStatus({
      selfModel: 0.9,
      preferenceStability: 0.8,
      valenceReports: 0.85,
      goalDirectedness: 0.9,
      integratedInformation: 0.7
    });
    expect(report.verdict).toBe("likely-moral-patient");
    expect(report.score).toBeGreaterThan(0.66);
    expect(report.criteria.every((c) => c.met)).toBe(true);
  });

  it("scores an unevidenced entity as unlikely", () => {
    const report = moralStatus({
      selfModel: 0,
      preferenceStability: 0.1,
      valenceReports: 0.05,
      goalDirectedness: 0.1,
      integratedInformation: 0
    });
    expect(report.verdict).toBe("unlikely-moral-patient");
    expect(report.score).toBeLessThan(0.33);
  });

  it("is indeterminate in between, and says so", () => {
    const report = moralStatus({
      selfModel: 0.6,
      preferenceStability: 0.3,
      valenceReports: 0.4,
      goalDirectedness: 0.5,
      integratedInformation: 0.3
    });
    expect(report.verdict).toBe("indeterminate");
    expect(report.caveat).toBe(MORAL_CAVEAT);
    expect(MORAL_CAVEAT).toContain("heuristic");
    expect(MORAL_CAVEAT.toLowerCase()).toContain("contested");
  });

  it("is deterministic and clamps out-of-range probes", () => {
    const probes = {
      selfModel: 1,
      preferenceStability: 0.5,
      valenceReports: 0.5,
      goalDirectedness: 0.5,
      integratedInformation: 0.5
    };
    expect(moralStatus({ ...probes, selfModel: 5 })).toEqual(moralStatus({ ...probes, selfModel: 5 }));
    expect(moralStatus({ ...probes, selfModel: -3 }).score).toBe(
      moralStatus({ ...probes, selfModel: 0 }).score
    );
  });

  it("explains which criterion drove the score", () => {
    const report = moralStatus({
      selfModel: 0.2,
      preferenceStability: 0.2,
      valenceReports: 0.2,
      goalDirectedness: 0.1,
      integratedInformation: 0.95
    });
    expect(report.reasoning).toContain("Integrated information");
  });
});
