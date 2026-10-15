/**
 * Attention head analysis — "who is looking at what, and what happens if they
 * stop looking".
 *
 * Heads are the unit of interpretability, so this module answers three
 * questions about every one of them:
 *
 *  - what does it look at    (`profileHeads`)
 *  - what job is it doing    (`classifyHead`)
 *  - what does removing it do (`ablationEffect`)
 *
 * Everything is derived from a `ForwardTrace`, which means the analysis is
 * reproducible, side-effect free and safe to run inside a server component.
 * No weights are needed for the statistics; `inductionScore` needs the model
 * only to assert that the trace being scored came from that model.
 */
import { normalizedEntropy, topK, type NumberVector } from "../math";
import type { CogitatomeModel } from "../model";
import type { ForwardTrace, HeadProfile, HeadRole } from "../types";
import { ALPHABET } from "../tokenizer";

// ---------------------------------------------------------------------------
// Tunables — kept as module constants so a reviewer can find every threshold
// in one place and reason about the whole classifier at once.
// ---------------------------------------------------------------------------

/** How many attended positions to report per head. */
const TOP_KEYS = 5;

/** Above this mean previous-token mass a head is a previous-token head. */
const PREV_TOKEN_THRESHOLD = 0.5;

/** Attention sinks route more than this fraction of their mass to token 0. */
const FIRST_TOKEN_THRESHOLD = 0.4;

/** Above this concentration (1 = one token) a head reads as positional. */
const FOCUS_THRESHOLD = 0.7;

/**
 * A head counts as an induction head when the mass it places on
 * "positions whose predecessor is my token" is at least this multiple of the
 * mass a uniform-over-the-causal-window head would place there. 1.0 means the
 * head is exactly as good as uniform, so the threshold sits safely above it.
 */
const INDUCTION_LIFT = 1.5;

/** The printable symbol for a token id — the toy alphabet when it fits. */
export function tokenSymbol(token: number): string {
  return token >= 0 && token < ALPHABET.length ? (ALPHABET[token] ?? "?") : `#${token}`;
}

/** A head, named by its coordinates in the model. */
export interface HeadRef {
  readonly layer: number;
  readonly head: number;
}

// ---------------------------------------------------------------------------
// Induction scoring
// ---------------------------------------------------------------------------

/** Per-head strength of the "previous token matches me" signal. */
export interface InductionScore {
  readonly layer: number;
  readonly head: number;
  /**
   * Attention mass on matched positions divided by the mass uniform attention
   * would put there. >= 1 means "at least as good as uniform".
   */
  readonly score: number;
  /** Raw matched mass, averaged over query positions. */
  readonly matchedMass: number;
  /** The uniform baseline the score is normalised against. */
  readonly uniformMass: number;
  /** Number of (query, key) pairs the stimulus offers where token[j-1] == token[i]. */
  readonly nMatched: number;
}

/**
 * How much of each head's attention lands on positions `j` whose *predecessor*
 * is the query's own token — the K-composition signature of an induction head.
 *
 * The head does not need to know about tokens: it only needs a key at `j` that
 * carries "the token before me", which is exactly what a previous-token head
 * in an earlier layer writes. That is why this ratio, and not the raw mass, is
 * the diagnostic: a head that simply attends everywhere gets 1.0, a head that
 * attends *because* the tokens match gets a large value.
 *
 * `model` is required so a trace cannot be scored against a different model's
 * configuration by accident; it is otherwise unused.
 */
export function inductionScore(model: CogitatomeModel, trace: ForwardTrace): InductionScore[] {
  if (trace.config !== model.config) {
    throw new RangeError("inductionScore: the trace was not produced by this model");
  }
  return scoreInduction(trace);
}

/** The trace-only worker behind {@link inductionScore}. */
function scoreInduction(trace: ForwardTrace): InductionScore[] {
  const seq = trace.tokens.length;
  const out: InductionScore[] = [];
  if (seq === 0) return out;
  const tokens = trace.tokens;
  for (let l = 0; l < trace.config.nLayers; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;
    for (let h = 0; h < trace.config.nHeads; h += 1) {
      const rows = record.attention[h];
      if (!rows) continue;
      let matched = 0;
      let uniform = 0;
      let nMatched = 0;
      for (let i = 0; i < seq; i += 1) {
        const row = rows[i];
        if (!row) continue;
        const support = i + 1;
        let rowMatchedPairs = 0;
        let rowMatchedMass = 0;
        for (let j = 1; j < support; j += 1) {
          if (tokens[j - 1] !== tokens[i]) continue;
          rowMatchedPairs += 1;
          rowMatchedMass += row[j] ?? 0;
        }
        matched += rowMatchedMass / seq;
        uniform += rowMatchedPairs / support / seq;
        nMatched += rowMatchedPairs;
      }
      out.push({
        layer: l,
        head: h,
        score: uniform > 0 ? matched / uniform : 0,
        matchedMass: matched,
        uniformMass: uniform,
        nMatched
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Head profiles
// ---------------------------------------------------------------------------

/** Signals a `HeadProfile` cannot express on its own. */
export interface HeadSignals {
  /** Induction lift — see {@link InductionScore.score}. */
  readonly induction: number;
}

/**
 * One statistical summary per (layer, head) of the model.
 *
 * `prevTokenScore` and `firstTokenScore` average over query positions only
 * where the denominator exists (position 0 has no previous token), so a sharp
 * previous-token head reports 1 rather than being diluted by 1/n.
 */
export function profileHeads(trace: ForwardTrace): HeadProfile[] {
  const seq = trace.tokens.length;
  const induction = new Map<string, number>();
  for (const score of scoreInduction(trace)) {
    induction.set(`${score.layer}:${score.head}`, score.score);
  }
  const out: HeadProfile[] = [];
  if (seq === 0) return out;
  for (let l = 0; l < trace.config.nLayers; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;
    for (let h = 0; h < trace.config.nHeads; h += 1) {
      const rows = record.attention[h];
      if (!rows) continue;
      // Mean attention distribution over key positions. Causal rows are
      // zero-padded, so dividing by the sequence length keeps this a
      // distribution that sums to one.
      const meanRow = new Float64Array(seq);
      let prevSum = 0;
      let prevCount = 0;
      let firstSum = 0;
      for (let i = 0; i < seq; i += 1) {
        const row = rows[i];
        if (!row) continue;
        firstSum += row[0] ?? 0;
        if (i >= 1) {
          prevSum += row[i - 1] ?? 0;
          prevCount += 1;
        }
        for (let j = 0; j <= i; j += 1) meanRow[j] = (meanRow[j] ?? 0) + (row[j] ?? 0) / seq;
      }
      const entropy = normalizedEntropy(meanRow);
      const profile: HeadProfile = {
        layer: l,
        head: h,
        prevTokenScore: prevCount > 0 ? prevSum / prevCount : 0,
        focus: 1 - entropy,
        entropy,
        firstTokenScore: firstSum / seq,
        role: "diffuse",
        topKeys: topK(meanRow, TOP_KEYS).map((item) => ({
          token: trace.tokens[item.index] ?? -1,
          weight: item.value
        }))
      };
      out.push({
        ...profile,
        role: classifyHead(profile, { induction: induction.get(`${l}:${h}`) ?? 0 })
      });
    }
  }
  return out;
}

/**
 * The rule-based head classifier.
 *
 * The rules are ordered and the order is the intent: a previous-token head is
 * the most specific claim, then the induction head (which needs the structural
 * K-composition signal supplied by {@link HeadSignals}, because the aggregated
 * statistics in a `HeadProfile` cannot distinguish "attends to the token before
 * me" from "attends wherever the previous-token head wrote"), then the
 * attention sink, then the purely positional heads, then everything else.
 *
 * `HeadRole` also admits `"copying"`, which is an OV-side statement about what
 * a head *writes* rather than what it reads; this classifier never emits it
 * and the circuit graph reports it instead.
 */
export function classifyHead(profile: HeadProfile, signals?: HeadSignals): HeadRole {
  if (profile.prevTokenScore > PREV_TOKEN_THRESHOLD) return "previous-token";
  if (profile.layer >= 1 && (signals?.induction ?? 0) >= INDUCTION_LIFT) return "induction";
  if (profile.firstTokenScore > FIRST_TOKEN_THRESHOLD) return "attention-sink";
  if (profile.focus > FOCUS_THRESHOLD) return "positional";
  return "diffuse";
}

// ---------------------------------------------------------------------------
// Ablation
// ---------------------------------------------------------------------------

/** The behavioural cost of removing one head. */
export interface AblationEffect {
  readonly layer: number;
  readonly head: number;
  /** Greedy next-token prediction at every position, before the ablation. */
  readonly baselineArgmax: readonly number[];
  /** ... and after. */
  readonly ablatedArgmax: readonly number[];
  readonly positionsChanged: readonly number[];
  readonly baselineTopLogit: number;
  readonly ablatedTopLogit: number;
  readonly topLogitDelta: number;
  /** Per-position change in the top logit, for a heatmap. */
  readonly topLogitDeltaPerPosition: readonly number[];
}

/** The top (maximum) logit of a logit vector — the model's confidence. */
function topLogit(logits: NumberVector): number {
  let best = -Infinity;
  for (const value of logits) if (value > best) best = value;
  return best === -Infinity ? 0 : best;
}

function argmaxOf(values: NumberVector): number {
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i] ?? 0) > bestValue) {
      bestValue = values[i] ?? 0;
      best = i;
    }
  }
  return best;
}

/**
 * Zero one head's output and re-run the model.
 *
 * This is the cheapest causal intervention available and the one every other
 * tool in the package is checked against: if a head matters, removing it must
 * move the prediction, and if nothing moves the head was decorative.
 */
export function ablationEffect(
  model: CogitatomeModel,
  tokens: readonly number[],
  layer: number,
  head: number
): AblationEffect {
  const baseline = model.forward(tokens);
  const ablated = model.ablateHead(tokens, layer, head);
  const baselineArgmax = baseline.logits.map((l) => argmaxOf(l));
  const ablatedArgmax = ablated.logits.map((l) => argmaxOf(l));
  const positionsChanged: number[] = [];
  const deltas: number[] = [];
  for (let i = 0; i < baselineArgmax.length; i += 1) {
    if (baselineArgmax[i] !== ablatedArgmax[i]) positionsChanged.push(i);
    deltas.push(topLogit(ablated.logits[i] ?? []) - topLogit(baseline.logits[i] ?? []));
  }
  const last = baseline.logits.length - 1;
  return {
    layer,
    head,
    baselineArgmax,
    ablatedArgmax,
    positionsChanged,
    baselineTopLogit: topLogit(baseline.logits[last] ?? []),
    ablatedTopLogit: topLogit(ablated.logits[last] ?? []),
    topLogitDelta: topLogit(ablated.logits[last] ?? []) - topLogit(baseline.logits[last] ?? []),
    topLogitDeltaPerPosition: deltas
  };
}
