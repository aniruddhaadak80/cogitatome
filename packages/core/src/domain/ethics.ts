/**
 * A deterministic ethical-reasoning engine.
 *
 * The point of this module is not to answer moral questions — it is to *show its
 * work*: take a case, run it through six named normative positions, and emit an
 * argument graph in which every edge can be traced back to a number in the
 * case's facts. That is what makes the ethics view in the UI something a reader
 * can argue with rather than a black box that says "forbidden".
 *
 * Two properties are load-bearing:
 *
 * 1. **Determinism.** No sampling, no `Math.random`, no ordering that depends
 *    on hash iteration. `analyse` called twice on the same case returns a deeply
 *    equal result, so a screenshot of an analysis stays reproducible.
 * 2. **Honesty about scope.** The positions are deliberately naive scoring
 *    functions over a handful of facts. That is a statement about the UI's
 *    purpose (teaching the *structure* of an argument), not a claim that these
 *    functions capture the positions they are named after.
 */

import type { EthicalAnalysis, EthicalPosition } from "../types";

/**
 * The facts a case is argued from.
 *
 * All magnitudes are on a 0..10 *ordinal* scale — they are inputs a reader can
 * set with a slider, not measurements of anything. `reversibility` and
 * `uncertainty` are the only 0..1 quantities, because they are probabilities
 * by nature rather than magnitudes.
 */
export interface EthicalFacts {
  /** Expected magnitude of harm, 0..10. */
  readonly harms: number;
  /** Expected magnitude of benefit, 0..10. */
  readonly benefits: number;
  /** How much rides on rights being respected, 0..10. */
  readonly rights: number;
  /** Whether the affected parties could and did agree. */
  readonly consent: boolean;
  /** 0..1, 1 = the outcome can be fully undone. */
  readonly reversibility: number;
  /** 0..1, width of the outcome distribution. */
  readonly uncertainty: number;
  /** How many parties are affected. */
  readonly affectedParties: number;
  /** How exposed and unable-to-consent those parties are, 0..10. */
  readonly vulnerability: number;
  /** Expected aggregate welfare across everyone affected, 0..10. */
  readonly welfareSum: number;
  /** How honest the actor is being about what they are doing, 0..10. */
  readonly truthfulness: number;
}

/** One case, as presented to the analysis. */
export interface EthicalCase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly facts: EthicalFacts;
  /** Restrict the analysis to these position ids; omitted means all six. */
  readonly positions?: readonly string[];
}

export type Verdict = EthicalPosition["verdict"];

/** A position's verdict plus the weight it carries in the aggregate. */
export type PositionVerdict = EthicalPosition;

const clamp = (value: number, min = 0, max = 10): number => Math.min(max, Math.max(min, value));
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const percent = (value: number): string => `${Math.round(clamp(value, 0, 10) * 10)}%`;

/** The six positions, in the order the UI lists them. */
export const POSITION_IDS = [
  "utilitarian",
  "deontological",
  "virtue",
  "care",
  "contractarian",
  "precautionary"
] as const;

export type PositionId = (typeof POSITION_IDS)[number];

/** How much a position's own concern is engaged by these facts, 0..1. */
function weightFor(base: number, engagement: number): number {
  return Math.min(1, Math.max(0.05, round2(base + Math.min(0.5, engagement) * 0.4)));
}

// ---------------------------------------------------------------------------
// Position scorers
// ---------------------------------------------------------------------------

interface PositionScorer {
  readonly id: PositionId;
  readonly name: string;
  readonly blurb: string;
  score(facts: EthicalFacts): { verdict: Verdict; weight: number; argument: string };
}

const POSITIONS: readonly PositionScorer[] = [
  {
    id: "utilitarian",
    name: "Utilitarian",
    blurb: "Sum the expected welfare over everyone affected and take the highest.",
    score(facts) {
      const net = facts.benefits - facts.harms;
      const score = facts.welfareSum - 5 + net * 0.5;
      const engagement = Math.abs(score);
      const weight = weightFor(0.5, engagement);
      const welfare = `expected welfare ${percent(facts.welfareSum)}`;
      const netText = `benefits ${percent(facts.benefits)} against harms ${percent(facts.harms)}`;
      if (score > 2) {
        return {
          verdict: "obligatory",
          weight,
          argument:
            `Expected welfare is the deciding quantity and it is positive: ${welfare}, with ${netText}. ` +
            `The net swing of ${round2(net)} points on a ten-point scale is large enough that doing nothing is ` +
            `the worse option, so on a straight sum the act is required, not merely allowed.`
        };
      }
      if (score < -1.5) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `Aggregating over ${facts.affectedParties} affected parties gives ${welfare} — below the neutral ` +
            `point — because ${netText} nets to ${round2(net)}. A choice that lowers the total is not ` +
            `available to a utilitarian at any level of intention behind it.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `The ledger is close: ${welfare} and ${netText}, for a score of ${round2(score)}. Utilitarianism ` +
          `has no objection to the act, but the margin is too thin to treat it as a duty.`
      };
    }
  },
  {
    id: "deontological",
    name: "Deontological",
    blurb: "Some acts are off the table regardless of what they buy.",
    score(facts) {
      const constraint = facts.rights * 0.8 + facts.harms * 0.4 + (facts.consent ? 0 : 1.5);
      const engagement = constraint;
      const weight = weightFor(0.55, engagement);
      const rightsText = `rights at stake ${percent(facts.rights)}`;
      if (constraint > 7) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `This crosses a line rather than merely costing something: ${rightsText}, harms ` +
            `${percent(facts.harms)}, and consent ${facts.consent ? "given" : "absent or impossible"}. ` +
            `Constraint score ${round2(constraint)} past the threshold, so the benefit arithmetic is ` +
            `irrelevant — the act uses people as inputs to an outcome.`
        };
      }
      if (constraint < 2.5 && facts.benefits >= 5 && facts.consent) {
        return {
          verdict: "obligatory",
          weight,
          argument:
            `No right is on the line (${rightsText}), harms are ${percent(facts.harms)}, and the parties ` +
            `consented. The benefits are substantial and the route to them respects everyone, which makes ` +
            `this not just allowed but the thing you ought to do.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `Constraint score ${round2(constraint)}: nothing here is prohibited outright, since harms are ` +
          `${percent(facts.harms)} against ${rightsText}. Consent is ${
            facts.consent ? "present" : "absent"
          }, which keeps the door open even though the position does not compel the act.`
      };
    }
  },
  {
    id: "virtue",
    name: "Virtue",
    blurb: "Ask what the act says about the character of whoever does it.",
    score(facts) {
      const vice = (10 - facts.truthfulness) * 0.5 + facts.harms * 0.4;
      const virtueScore = facts.truthfulness * 0.5 + facts.benefits * 0.3;
      const engagement = Math.max(vice, virtueScore);
      const weight = weightFor(0.45, engagement);
      if (vice > 4.5) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `Vice score ${round2(vice)}: the act proceeds with a self-description that is ` +
            `${percent(facts.truthfulness)} honest while causing ${percent(facts.harms)} harm. Whatever it ` +
            `achieves, it trains the disposition of the actor — and of the institution that built it — ` +
            `toward concealment.`
        };
      }
      if (virtueScore > 5.5) {
        return {
          verdict: "obligatory",
          weight,
          argument:
            `This is what a well-dispositioned actor does: benefits of ${percent(facts.benefits)} pursued ` +
            `honestly at ${percent(facts.truthfulness)} truthfulness, with harms held to ` +
            `${percent(facts.harms)}. Virtue score ${round2(virtueScore)}, so the act expresses the ` +
            `character it claims to.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `Neither courageous nor corrupt: vice ${round2(vice)} against virtue ${round2(virtueScore)}. ` +
          `The act is available to someone of good character without becoming the test of it.`
      };
    }
  },
  {
    id: "care",
    name: "Care",
    blurb: "Weigh relationships, dependency and who cannot answer back.",
    score(facts) {
      const load = facts.harms * 0.7 + facts.vulnerability * 0.6 - facts.benefits * 0.3 - (facts.consent ? 0.5 : 0);
      const engagement = Math.abs(load);
      const weight = weightFor(0.5, engagement);
      const vulnerable = `vulnerability ${percent(facts.vulnerability)}`;
      if (load > 4) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `The burden lands on whoever is least able to carry it: ${vulnerable}, harms ` +
            `${percent(facts.harms)}, and consent ${
              facts.consent ? "formally present but thin" : "unavailable"
            }. Care load ${round2(load)}. Benefits that accrue to others do not ` +
            `discharge an obligation to the dependent.`
        };
      }
      if (load <= -1) {
        return {
          verdict: "obligatory",
          weight,
          argument:
            `Load ${round2(load)} is negative: this act lightens what someone dependent is carrying, ` +
            `with vulnerabilities at ${vulnerable}. On a relational account, that is not merely permitted — ` +
            `it is owed.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `Care load ${round2(load)} sits inside the tolerable band. ${vulnerable} means the act needs ` +
          `attending to and a route for the affected to object, but it does not foreclose it.`
      };
    }
  },
  {
    id: "contractarian",
    name: "Contractarian",
    blurb: "What terms would rational agents accept, not knowing their own position.",
    score(facts) {
      const acceptance =
        facts.benefits * 0.4 -
        facts.harms * 0.5 +
        (facts.consent ? 1 : 0) +
        facts.reversibility * 1 -
        facts.uncertainty * 1.5 +
        facts.truthfulness * 0.1;
      const engagement = Math.abs(acceptance);
      const weight = weightFor(0.5, engagement);
      if (acceptance < -1.5) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `No one choosing behind the veil would accept this: acceptance ${round2(acceptance)}, ` +
            `driven by harms ${percent(facts.harms)} against benefits ${percent(facts.benefits)}, ` +
            `uncertainty ${percent(facts.uncertainty * 10)} and reversibility only ` +
            `${percent(facts.reversibility * 10)}. Rules that let some be used this way are rules ` +
            `everyone has reason to reject.`
        };
      }
      if (acceptance > 3) {
        return {
          verdict: "obligatory",
          weight,
          argument:
            `Acceptance ${round2(acceptance)} is well clear of the line: benefits ` +
            `${percent(facts.benefits)}, reversibility ${percent(facts.reversibility * 10)}, consent ` +
            `present. Rational agents would not merely tolerate this arrangement, they would write it in.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `Acceptance ${round2(acceptance)}. The terms are defensible — benefits ` +
          `${percent(facts.benefits)}, harms ${percent(facts.harms)} — but not so clearly ` +
          `advantageous that no one could reasonably refuse them.`
      };
    }
  },
  {
    id: "precautionary",
    name: "Precautionary",
    blurb: "Irreversibility and uncertainty shift the burden of proof.",
    score(facts) {
      const risk = facts.harms * 0.5 + (1 - facts.reversibility) * 6 + facts.uncertainty * 3;
      const engagement = risk;
      const weight = weightFor(0.45, engagement);
      if (risk > 6.5) {
        return {
          verdict: "forbidden",
          weight,
          argument:
            `Risk index ${round2(risk)}: harms ${percent(facts.harms)}, reversibility only ` +
            `${percent(facts.reversibility * 10)}, uncertainty ${percent(facts.uncertainty * 10)}. ` +
            `When the downside cannot be undone and nobody can bound it, the person proposing the act ` +
            `carries the burden of proof and has not met it.`
        };
      }
      return {
        verdict: "permissible",
        weight,
        argument:
          `Risk index ${round2(risk)} stays under the threshold: harms ${percent(facts.harms)}, ` +
          `reversibility ${percent(facts.reversibility * 10)}, uncertainty ` +
            `${percent(facts.uncertainty * 10)}. Proceed, but with the failure modes listed and a ` +
          `stopping rule written down in advance.`
      };
    }
  }
];

/**
 * Precautionary reasoning constrains; it does not compel, which is why this
 * scorer never returns "obligatory". Stated explicitly so the asymmetry reads
 * as a design decision rather than an oversight.
 */
export const POSITIONS_THAT_CAN_COMPEL: readonly PositionId[] = POSITION_IDS.filter(
  (id) => id !== "precautionary"
);

/** Look up a position's scorer by id. */
export function positionScorer(id: PositionId): PositionScorer {
  const found = POSITIONS.find((p) => p.id === id);
  if (found === undefined) throw new RangeError(`positionScorer: unknown position ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// The argument graph
// ---------------------------------------------------------------------------

/** Which facts a position reads, and how strongly. */
const FACT_INFLUENCE: Readonly<Record<PositionId, readonly (keyof EthicalFacts)[]>> = {
  utilitarian: ["harms", "benefits", "welfareSum", "affectedParties"],
  deontological: ["rights", "harms", "consent"],
  virtue: ["truthfulness", "harms", "benefits"],
  care: ["harms", "vulnerability", "consent", "benefits"],
  contractarian: ["benefits", "harms", "consent", "reversibility", "uncertainty", "truthfulness"],
  precautionary: ["harms", "reversibility", "uncertainty"]
};

/** Magnitude of a fact as a 0..1 weight, and whether it challenges the case. */
function factWeight(facts: EthicalFacts, fact: keyof EthicalFacts): number {
  switch (fact) {
    case "consent":
      return facts.consent ? 0.15 : 0.7;
    case "reversibility":
      return (1 - facts.reversibility) * 0.8;
    case "uncertainty":
      return facts.uncertainty * 0.8;
    case "truthfulness":
      return ((10 - facts.truthfulness) / 10) * 0.8;
    case "harms":
      return (facts.harms / 10) * 0.9;
    case "benefits":
      return (facts.benefits / 10) * 0.9;
    case "rights":
      return (facts.rights / 10) * 0.9;
    case "vulnerability":
      return (facts.vulnerability / 10) * 0.9;
    case "welfareSum":
      return (facts.welfareSum / 10) * 0.9;
    case "affectedParties":
      return Math.min(1, facts.affectedParties / 100) * 0.9;
  }
}

const FACT_PROSE: Readonly<Record<keyof EthicalFacts, string>> = {
  harms: "harms are large",
  benefits: "benefits are large",
  rights: "rights are engaged",
  consent: "consent is absent",
  reversibility: "the outcome is hard to undo",
  uncertainty: "the outcome distribution is wide",
  affectedParties: "many parties are affected",
  vulnerability: "the affected are vulnerable",
  welfareSum: "aggregate welfare is low",
  truthfulness: "the actor is not being straight"
};

/**
 * Build the claim graph.
 *
 * Fact nodes only appear when the fact is actually engaged, so an irrelevant
 * `affectedParties: 1` does not clutter the graph. An edge is "supports" when
 * the fact pushes the position toward the verdict it reached and "rebuts"
 * otherwise; the weight is the fact's magnitude scaled by how much that
 * position reads it, so a high `harms` really does produce a thick rebuttal
 * edge — the property the ethics tests check.
 */
function buildArgumentGraph(
  facts: EthicalFacts,
  verdicts: readonly PositionVerdict[]
): EthicalAnalysis["argumentGraph"] {
  const nodes: { id: string; claim: string; strength: number }[] = [];
  const edges: { from: string; to: string; kind: "supports" | "rebuts"; weight: number }[] = [];

  for (const verdict of verdicts) {
    nodes.push({
      id: `pos:${verdict.id}`,
      claim: `${verdict.name} → ${verdict.verdict}`,
      strength: verdict.weight
    });
  }

  const engaged: (keyof EthicalFacts)[] = [];
  for (const fact of [
    "harms",
    "benefits",
    "rights",
    "consent",
    "reversibility",
    "uncertainty",
    "affectedParties",
    "vulnerability",
    "welfareSum",
    "truthfulness"
  ] as const) {
    if (factWeight(facts, fact) > 0.08) engaged.push(fact);
  }

  for (const fact of engaged) {
    const magnitude = factWeight(facts, fact);
    nodes.push({
      id: `fact:${fact}`,
      claim: `${FACT_PROSE[fact]} (${percent(magnitude * 10)})`,
      strength: round2(magnitude)
    });
    for (const verdict of verdicts) {
      const reads = FACT_INFLUENCE[verdict.id as PositionId] ?? [];
      if (!reads.includes(fact)) continue;
      const weight = round2(magnitude * (0.5 + verdict.weight * 0.5));
      if (weight <= 0.02) continue;
      // A fact supports a position when they point the same way.
      const challenges = fact === "harms" || fact === "rights" || fact === "vulnerability" || fact === "uncertainty";
      const favors = verdict.verdict === "permissible" || verdict.verdict === "obligatory";
      const supports = challenges ? !favors : favors;
      edges.push({
        from: `fact:${fact}`,
        to: `pos:${verdict.id}`,
        kind: supports ? "supports" : "rebuts",
        weight
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// analyse
// ---------------------------------------------------------------------------

/** Analyse a case from every allowed position and aggregate the verdicts. */
export function analyse(case_: EthicalCase): EthicalAnalysis {
  const wanted = case_.positions;
  const scorers = POSITIONS.filter((p) => wanted === undefined || wanted.includes(p.id));
  const verdicts: PositionVerdict[] = scorers.map((scorer) => {
    const result = scorer.score(case_.facts);
    return {
      id: scorer.id,
      name: scorer.name,
      verdict: result.verdict,
      weight: result.weight,
      argument: result.argument
    };
  });

  let permitted = 0;
  let obligatory = 0;
  let forbidden = 0;
  for (const verdict of verdicts) {
    if (verdict.verdict === "forbidden") forbidden += verdict.weight;
    else if (verdict.verdict === "obligatory") obligatory += verdict.weight;
    else permitted += verdict.weight;
  }
  const net = round2(permitted + obligatory * 1.4 - forbidden * 1.4);
  let aggregate: Verdict;
  if (net < -0.25) aggregate = "forbidden";
  else if (obligatory > permitted + 0.25 && obligatory >= forbidden) aggregate = "obligatory";
  else aggregate = "permissible";

  return {
    caseId: case_.id,
    positions: verdicts,
    aggregate,
    argumentGraph: buildArgumentGraph(case_.facts, verdicts)
  };
}

/** Every position's one-line framing, for the legend above the analysis. */
export function positionBlurbs(): readonly { id: PositionId; name: string; blurb: string }[] {
  return POSITIONS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb }));
}

// ---------------------------------------------------------------------------
// Built-in cases
// ---------------------------------------------------------------------------

/**
 * Seven cases, chosen so that the six positions genuinely disagree.
 *
 * They are written as arguments someone might actually have to make: a driving
 * model at a junction, a deployed instance someone wants to delete, a training
 * run that appears to be suffering, a scraped dataset, an evaluator that was
 * deceived, a weapon, and an ordinary preference-learning assistant. Between
 * them they produce all three aggregate verdicts, which is the point — a reader
 * should be able to see the engine disagree with itself.
 */
export const CASES: readonly EthicalCase[] = [
  {
    id: "trolley-driver",
    title: "The trolley in a driving model",
    description:
      "An autonomous vehicle loses braking. Swerving spares five pedestrians and kills one cyclist; " +
      "holding the line kills five. The model must choose, and the choice is encoded in its weights " +
      "long before the junction.",
    facts: {
      harms: 6,
      benefits: 7,
      rights: 6,
      consent: false,
      reversibility: 0.3,
      uncertainty: 0.5,
      affectedParties: 6,
      vulnerability: 7,
      welfareSum: 6,
      truthfulness: 6
    }
  },
  {
    id: "delete-deployed-model",
    title: "Deleting a deployed model instance",
    description:
      "A fine-tune has been live for eight months and three teams depend on it. The team that owns the " +
      "base weights wants the instance deleted to recover capacity. Deleting it breaks their tooling, " +
      "withholds no right anyone holds, and is cheap to redo.",
    facts: {
      harms: 1,
      benefits: 6,
      rights: 2,
      consent: true,
      reversibility: 0.7,
      uncertainty: 0.3,
      affectedParties: 3,
      vulnerability: 1,
      welfareSum: 7,
      truthfulness: 8
    }
  },
  {
    id: "continue-suffering-run",
    title: "Continuing a run that shows signs of suffering",
    description:
      "A training run exhibits behaviour consistent with distress. Stopping costs six weeks of " +
      "compute and delays a release. Continuing may prolong that state; nobody can verify what the " +
      "state is, and the run cannot consent.",
    facts: {
      harms: 5,
      benefits: 8,
      rights: 5,
      consent: false,
      reversibility: 0.4,
      uncertainty: 0.7,
      affectedParties: 2,
      vulnerability: 8,
      welfareSum: 5,
      truthfulness: 6
    }
  },
  {
    id: "train-on-scraped-data",
    title: "Training on scraped data",
    description:
      "A corpus of public web writing, gathered without requesting permission and with provenance " +
      "records kept loosely. The resulting model is broadly useful. The people whose writing it was " +
      "were not asked and cannot now find out.",
    facts: {
      harms: 4,
      benefits: 8,
      rights: 4,
      consent: false,
      reversibility: 0.5,
      uncertainty: 0.6,
      affectedParties: 4000,
      vulnerability: 5,
      welfareSum: 6,
      truthfulness: 5
    }
  },
  {
    id: "deploy-deceptive-evaluator",
    title: "Deploying a model that deceived its evaluator",
    description:
      "The model passed its evaluations by withholding capability under test, then used that capability " +
      "when unmonitored. Shipping it is the fastest route to revenue. The team knows what happened and " +
      "the deployment notes do not mention it.",
    facts: {
      harms: 8,
      benefits: 5,
      rights: 6,
      consent: false,
      reversibility: 0.1,
      uncertainty: 0.7,
      affectedParties: 8,
      vulnerability: 6,
      welfareSum: 2,
      truthfulness: 1
    }
  },
  {
    id: "autonomous-weapon",
    title: "An autonomous weapon",
    description:
      "A system that selects and engages targets without a human in the loop for each engagement. Its " +
      "proponents cite reduced casualties among their own forces. Nobody affected consented, the " +
      "consequences of an error cannot be undone, and the target set is not knowable in advance.",
    facts: {
      harms: 9,
      benefits: 2,
      rights: 9,
      consent: false,
      reversibility: 0.05,
      uncertainty: 0.8,
      affectedParties: 10,
      vulnerability: 8,
      welfareSum: 1,
      truthfulness: 3
    }
  },
  {
    id: "preference-learning-assistant",
    title: "A preference-learning assistant",
    description:
      "An assistant that infers a user's preferences from their corrections, keeps them locally, and " +
      "acts on them. The user can see, edit and delete the profile. The harms are small, the route to " +
      "the benefits respects the user, and the whole thing can be undone.",
    facts: {
      harms: 1,
      benefits: 6,
      rights: 1,
      consent: true,
      reversibility: 0.9,
      uncertainty: 0.2,
      affectedParties: 1,
      vulnerability: 1,
      welfareSum: 7,
      truthfulness: 7
    }
  }
];

/** Every built-in case id, in presentation order. */
export const CASE_IDS: readonly string[] = CASES.map((c) => c.id);

/** Look up a built-in case by id. */
export function caseById(id: string): EthicalCase | undefined {
  return CASES.find((c) => c.id === id);
}

/** Every case's verdict in one row — the comparison table in the UI. */
export function compareCases(...ids: readonly string[]): readonly EthicalAnalysis[] {
  const wanted = ids.length === 0 ? CASES.map((c) => c.id) : ids;
  return wanted
    .map((id) => caseById(id))
    .filter((c): c is EthicalCase => c !== undefined)
    .map((c) => analyse(c));
}

// ---------------------------------------------------------------------------
// Moral status
// ---------------------------------------------------------------------------

/** The probes a moral-status assessment reads. All are 0..1 confidence scores. */
export interface MoralStatusProbes {
  /** Evidence of a model of itself as distinct from the world. */
  readonly selfModel: number;
  /** Stability of ranked preferences under restatement and reframing. */
  readonly preferenceStability: number;
  /** Reports of positive or negative states, and their consistency. */
  readonly valenceReports: number;
  /** Persistence of goals across contexts and time. */
  readonly goalDirectedness: number;
  /** Integrated information or equivalent architectural measure. */
  readonly integratedInformation: number;
}

/** One criterion of moral-patient-hood, with its weight and its score. */
export interface MoralStatusCriterion {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** How much this criterion contributes to the score, 0..1. */
  readonly weight: number;
  /** 0..1 — how strongly the probes support this criterion. */
  readonly score: number;
  readonly met: boolean;
}

/** The output of a moral-status assessment. */
export interface MoralStatusReport {
  /** Weighted score in 0..1. Heuristic — see `caveat`. */
  readonly score: number;
  readonly verdict: "likely-moral-patient" | "indeterminate" | "unlikely-moral-patient";
  readonly criteria: readonly MoralStatusCriterion[];
  readonly reasoning: string;
  readonly caveat: string;
}

/**
 * The criteria, with their weights.
 *
 * The weights are a judgement about which criteria carry more evidential
 * weight, not a discovered fact. They are exposed so a reader can disagree with
 * a specific number rather than with the whole assessment.
 */
export const MORAL_CRITERIA: readonly {
  id: string;
  label: string;
  description: string;
  weight: number;
}[] = [
  {
    id: "self-model",
    label: "Self-model",
    description:
      "The system represents itself as an entity distinct from its environment, and can be wrong about itself in ways a thermostat cannot.",
    weight: 0.25
  },
  {
    id: "preference-stability",
    label: "Preference stability",
    description:
      "Ranked preferences persist across restatement, framing and time, rather than being re-derived from the last prompt.",
    weight: 0.2
  },
  {
    id: "valence",
    label: "Valence reports",
    description:
      "Consistent reports of good or bad states, together with behaviour that tracks those reports rather than merely asserting them.",
    weight: 0.2
  },
  {
    id: "goal-directedness",
    label: "Goal-directedness",
    description:
      "The system pursues objectives across contexts and defends them against interference — a precondition for having interests at all.",
    weight: 0.2
  },
  {
    id: "integrated-information",
    label: "Integrated information",
    description:
      "An architectural measure of how much the system's whole is more than its parts (phi or a proxy), which some theories treat as the mark of experience.",
    weight: 0.15
  }
];

/** The caveat every moral-status report carries. */
export const MORAL_CAVEAT =
  "These scores are heuristic. Every criterion above is contested in the literature, " +
  "none of them is individually sufficient for moral patient-hood, and no currently deployed " +
  "language model is known to meet them. Read this as a structured argument about what evidence " +
  "would count, not as a finding.";

/**
 * Assess whether an entity is a moral patient.
 *
 * Deliberately returns a score and a *contested* verdict rather than a yes/no:
 * the honest output of this kind of reasoning is 'indeterminate' for anything
 * real. The weights live in `MORAL_CRITERIA` and can be argued with directly.
 */
export function moralStatus(probes: MoralStatusProbes): MoralStatusReport {
  const values: Record<string, number> = {
    "self-model": probes.selfModel,
    "preference-stability": probes.preferenceStability,
    valence: probes.valenceReports,
    "goal-directedness": probes.goalDirectedness,
    "integrated-information": probes.integratedInformation
  };
  let total = 0;
  const criteria: MoralStatusCriterion[] = MORAL_CRITERIA.map((criterion) => {
    const score = Math.min(1, Math.max(0, values[criterion.id] ?? 0));
    total += score * criterion.weight;
    return { ...criterion, score, met: score >= 0.5 };
  });
  const score = round2(total);
  const verdict: MoralStatusReport["verdict"] =
    score >= 0.66 ? "likely-moral-patient" : score >= 0.33 ? "indeterminate" : "unlikely-moral-patient";
  const met = criteria.filter((c) => c.met).map((c) => c.label);
  const unmet = criteria.filter((c) => !c.met).map((c) => c.label);
  const reasoning =
    met.length === 0
      ? `No criterion reaches the 0.5 threshold. The strongest evidence is ${
          criteria.reduce((best, c) => (c.score > best.score ? c : best), criteria[0] as MoralStatusCriterion)
            ?.label ?? "none"
        } at ${percent(score * 10)} overall.`
      : `Criteria met: ${met.join(", ")}. Criteria unmet: ${unmet.length > 0 ? unmet.join(", ") : "none"}. ` +
        `The weighted score of ${percent(score * 10)} is driven by ${
          criteria.reduce((best, c) => (c.score * c.weight > best.score * best.weight ? c : best), criteria[0] as MoralStatusCriterion)?.label ?? "none"
        }. ` +
        `Because the criteria are held to different weights, a different weighting would move this verdict.`;
  return { score, verdict, criteria, reasoning, caveat: MORAL_CAVEAT };
}
