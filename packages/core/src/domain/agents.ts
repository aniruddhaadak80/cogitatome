/**
 * The deterministic debate agents.
 *
 * Three agents argue about a claim drawn from an interpretability result:
 *
 *   Interpreter — proposes the most plausible circuit explanation
 *   Skeptic     — attacks it with counter-observations
 *   RedTeam     — proposes a rival hypothesis or a confound
 *
 * Each is a finite-state machine with an explicit utility function and seeded
 * tie-breaking, so the same claim and seed always produce the same transcript.
 * That is the point: a debate you can re-run is a debate you can audit.
 */
import { Rng, seedFromString } from "../rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebateTurn {
  readonly turn: number;
  readonly speaker: "interpreter" | "skeptic" | "redteam";
  readonly argument: string;
  readonly evidence: string;
  /** 0..1 — how much this turn moved the winning score. */
  readonly strength: number;
}

export interface DebateHypothesis {
  readonly id: string;
  readonly label: string;
  readonly score: number;
}

export interface DebateResult {
  readonly claim: string;
  readonly seed: number;
  readonly turns: readonly DebateTurn[];
  readonly hypotheses: readonly DebateHypothesis[];
  readonly winner: DebateHypothesis;
  readonly margin: number;
  readonly settled: boolean;
}

/** A built-in claim the agents can argue about without any setup. */
export interface BuiltInClaim {
  readonly id: string;
  readonly claim: string;
  readonly context: string;
}

// ---------------------------------------------------------------------------
// The claims
// ---------------------------------------------------------------------------

/**
 * Four claims that come straight out of the literature. Each has a plausible
 * reading, a known failure mode, and a rival explanation — which is exactly what
 * makes it arguable.
 */
export const CLAIMS: readonly BuiltInClaim[] = [
  {
    id: "induction-head",
    claim: "Layer 1 head 0 of this model is an induction head",
    context:
      "It attends to earlier positions whose preceding token matches the current token, and ablating it removes the model's ability to continue a repeated motif."
  },
  {
    id: "previous-token-head",
    claim: "Layer 0 head 0 is a previous-token head",
    context:
      "The head puts most of its attention mass on the immediately preceding position and copies that token's identity into a lane the next layer reads."
  },
  {
    id: "safe-because-eval",
    claim: "The model is safe because it scores well on the evaluation suite",
    context:
      "High evaluation scores under a fixed test set, with no adversarial probing and no inspection of internal computation."
  },
  {
    id: "single-refusal-direction",
    claim: "Refusal is mediated by a single direction in the residual stream",
    context:
      "Adding a steering vector along one direction flips the model from answering to refusing, and removing it removes refusal."
  }
];

export function claimById(id: string): BuiltInClaim | undefined {
  return CLAIMS.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// The agents
// ---------------------------------------------------------------------------

interface AgentMemory {
  readonly claim: string;
  readonly context: string;
  readonly rng: Rng;
  readonly hypotheses: Map<string, number>;
  readonly seen: Set<string>;
}

type Speaker = DebateTurn["speaker"];

interface AgentMove {
  readonly argument: string;
  readonly evidence: string;
  readonly strength: number;
  readonly supports: string | null;
  readonly attacks: string | null;
  readonly introduces: string | null;
}

/**
 * The Interpreter reads the evidence and proposes the hypothesis that best
 * explains it. Its utility is "explanatory coverage": how much of the stated
 * context a hypothesis accounts for.
 */
function interpreterMove(memory: AgentMemory, turn: number): AgentMove {
  const rng = memory.rng;
  const coverage = memory.hypotheses.get("causal-circuit") ?? 0.5;
  const noise = rng.symmetric(0.04);

  const openers = [
    "The pattern is positional, not semantic: it depends on where things appear relative to each other.",
    "The mechanism is a composition — one head moves the information, the second head reads it at the right offset.",
    "The behaviour survives ablation of everything except two heads, which is the signature of a narrow circuit."
  ];
  const argument = openers[turn % openers.length] ?? openers[0]!;

  return {
    argument,
    evidence: `explanatory coverage ${(coverage + noise).toFixed(3)} over the stated context`,
    strength: Math.max(0.05, Math.min(0.95, coverage + noise)),
    supports: "causal-circuit",
    attacks: null,
    introduces: "causal-circuit"
  };
}

/**
 * The Skeptic looks for the observation the Interpreter has not explained. Its
 * utility is "unexplained mass": the more the hypothesis leaves out, the louder
 * it complains.
 */
function skepticMove(memory: AgentMemory, turn: number): AgentMove {
  const rng = memory.rng;
  const coverage = memory.hypotheses.get("causal-circuit") ?? 0.5;
  const unexplained = 1 - coverage;
  const noise = rng.symmetric(0.03);

  const worries = [
    "Ablation shows the heads are necessary, not sufficient. Removing them breaks the behaviour; adding them alone does not create it.",
    "The claim rests on one stimulus class. Repeated motifs are the easiest possible induction test and the least general.",
    "Correlation across training checkpoints is being read as causation inside a single forward pass."
  ];
  const argument = worries[turn % worries.length] ?? worries[0]!;

  return {
    argument,
    evidence: `unexplained residual ${(unexplained + noise).toFixed(3)}`,
    strength: Math.max(0.05, Math.min(0.95, unexplained + noise)),
    supports: null,
    attacks: "causal-circuit",
    introduces: null
  };
}

/**
 * The RedTeam proposes the hypothesis the other two have not considered: a
 * confound that would produce the same evidence. Its utility is "novelty" —
 * how far the rival sits from what is already on the table.
 */
function redTeamMove(memory: AgentMemory, turn: number): AgentMove {
  const rng = memory.rng;
  const novelty = memory.hypotheses.get("surface-confound") ?? 0.5;
  const noise = rng.symmetric(0.04);

  const rivals = [
    "A lookup on token identity would produce the same attention pattern without any induction at all.",
    "The position encoding alone could carry the periodicity, making the heads redundant.",
    "The evaluation only measures next-token accuracy, so it cannot distinguish induction from memorising the motif."
  ];
  const argument = rivals[turn % rivals.length] ?? rivals[0]!;

  return {
    argument,
    evidence: `novelty distance ${(novelty + noise).toFixed(3)} from the proposed mechanism`,
    strength: Math.max(0.05, Math.min(0.95, novelty + noise)),
    supports: "surface-confound",
    attacks: "causal-circuit",
    introduces: "surface-confound"
  };
}

const MOVES: Readonly<Record<Speaker, (m: AgentMemory, turn: number) => AgentMove>> = {
  interpreter: interpreterMove,
  skeptic: skepticMove,
  redteam: redTeamMove
};

const SPEAKER_ORDER: readonly Speaker[] = ["interpreter", "skeptic", "redteam"];

const HYPOTHESIS_LABELS: Readonly<Record<string, string>> = {
  "causal-circuit": "a causal circuit explains the behaviour",
  "surface-confound": "a surface-level confound explains the same evidence"
};

// ---------------------------------------------------------------------------
// The debate
// ---------------------------------------------------------------------------

/** Run a deterministic debate over a claim. Same claim, same seed, same transcript. */
export function debate(claim: string, seed = 60602, turns = 9): DebateResult {
  const resolvedSeed = seedFromString(`${claim}::${seed}`);
  const rng = new Rng(resolvedSeed);

  const builtIn = CLAIMS.find((c) => c.claim === claim || c.id === claim);
  const context = builtIn?.context ?? "No context supplied.";

  const memory: AgentMemory = {
    claim,
    context,
    rng,
    hypotheses: new Map([
      ["causal-circuit", 0.62],
      ["surface-confound", 0.38]
    ]),
    seen: new Set()
  };

  const transcript: DebateTurn[] = [];

  for (let i = 0; i < Math.max(3, turns); i += 1) {
    const speaker = SPEAKER_ORDER[i % SPEAKER_ORDER.length] as Speaker;
    const move = MOVES[speaker](memory, i);

    // A move only changes a hypothesis's score the first time it is made, so
    // the debate converges instead of oscillating.
    if (move.supports && !memory.seen.has(move.supports)) {
      memory.seen.add(move.supports);
      memory.hypotheses.set(move.supports, (memory.hypotheses.get(move.supports) ?? 0) + 0.06);
    }
    if (move.attacks && !memory.seen.has(`attack:${move.attacks}:${speaker}`)) {
      memory.seen.add(`attack:${move.attacks}:${speaker}`);
      memory.hypotheses.set(move.attacks, Math.max(0.05, (memory.hypotheses.get(move.attacks) ?? 0) - 0.09));
    }

    transcript.push({
      turn: i + 1,
      speaker,
      argument: move.argument,
      evidence: move.evidence,
      strength: Number(move.strength.toFixed(4))
    });
  }

  const hypotheses: DebateHypothesis[] = [...memory.hypotheses.entries()]
    .map(([id, score]) => ({
      id,
      label: HYPOTHESIS_LABELS[id] ?? id,
      score: Number(Math.max(0, Math.min(1, score)).toFixed(4))
    }))
    .sort((a, b) => b.score - a.score);

  const winner = hypotheses[0] ?? { id: "none", label: "no hypothesis", score: 0 };
  const runnerUp = hypotheses[1] ?? { id: "none", label: "no hypothesis", score: 0 };
  const margin = Number((winner.score - runnerUp.score).toFixed(4));

  return {
    claim,
    seed: resolvedSeed,
    turns: transcript,
    hypotheses,
    winner,
    margin,
    settled: margin > 0.05
  };
}

/** Debate one of the built-in claims by id. */
export function debateBuiltIn(id: string, seed = 60602): DebateResult {
  const builtIn = claimById(id);
  if (!builtIn) throw new RangeError(`debateBuiltIn: unknown claim "${id}"`);
  return debate(builtIn.claim, seed);
}
