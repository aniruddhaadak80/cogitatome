/**
 * Interpretability metrics — the single object an API route can return.
 *
 * Every function here is a *scalar summary* of something the other modules
 * compute in detail. They exist for dashboards and for regression tests: a
 * number that jumps when a model's weights change is a number worth watching.
 * They are all pure functions of a trace, so two runs of the same model give
 * the same numbers to the last bit.
 */
import { mean, sparsity, stdDev, superpositionScore, type NumberVector } from "../math";
import type { CogitatomeModel } from "../model";
import type { ForwardTrace, HeadProfile, HeadRole } from "../types";
import { inductionScore, profileHeads, type HeadRef, type InductionScore } from "./heads";

// ---------------------------------------------------------------------------
// Attention concentration
// ---------------------------------------------------------------------------

/**
 * Normalised entropy of every head's attention, averaged over query positions.
 *
 * The matrix is indexed `[layer][head]`, so a caller can render it directly as
 * a "how sharply is each head listening" heatmap. Normalised (rather than raw)
 * entropy is the comparable quantity: a head with a 4-token window and a head
 * with a 64-token window both read 1.0 when they are uniform.
 */
export function attentionEntropyMatrix(trace: ForwardTrace): number[][] {
  const out: number[][] = [];
  for (let l = 0; l < trace.config.nLayers; l += 1) {
    const record = trace.layers[l];
    const row: number[] = [];
    for (let h = 0; h < trace.config.nHeads; h += 1) {
      const rows = record?.attention[h];
      if (!rows || rows.length === 0) {
        row.push(0);
        continue;
      }
      const perQuery = rows.map((attention) => normalisedEntropy(attention));
      row.push(perQuery.reduce((s, v) => s + v, 0) / perQuery.length);
    }
    out.push(row);
  }
  return out;
}

/** Shannon entropy divided by log(support), computed over a probability row. */
function normalisedEntropy(row: NumberVector): number {
  let support = 0;
  for (const value of row) if (value > 0) support += 1;
  if (support <= 1) return 0;
  let entropy = 0;
  for (const value of row) {
    const p = Math.max(0, value);
    if (p > 0) entropy -= p * Math.log(p);
  }
  return entropy / Math.log(support);
}

/**
 * The mean of {@link attentionEntropyMatrix} over every head of every layer.
 *
 * A one-hot model scores 0; a model that attends uniformly over a window of
 * size n scores 1, which is why the number is only ever compared against other
 * runs of the *same* model on the *same* sequence length.
 */
export function meanAttentionEntropy(trace: ForwardTrace): number {
  const matrix = attentionEntropyMatrix(trace);
  const values = matrix.flat();
  return values.length === 0 ? 0 : mean(values);
}

// ---------------------------------------------------------------------------
// Activation statistics
// ---------------------------------------------------------------------------

/**
 * Fraction of a vector that is (near) zero.
 *
 * A sparse activation is the tell-tale of a feature that fires on a specific
 * condition rather than a direction that carries a mixture — the property
 * sparse autoencoders are built to recover.
 */
export function featureSparsity(values: NumberVector, eps = 1e-8): number {
  return sparsity(values, eps);
}

/**
 * Superposition score of one layer's MLP activations across positions.
 *
 * The samples are taken with a fixed stride over the sequence, so the result
 * depends only on the trace and never on iteration order. See
 * `superpositionScore` in `math.ts` for what the number means: 1 is "one
 * direction per dimension", higher is "features are interfering".
 */
export function superpositionFromTrace(trace: ForwardTrace, layer: number, sample = 16): number {
  const record = trace.layers[layer];
  if (!record) throw new RangeError(`superpositionFromTrace: trace has no layer ${layer}`);
  const seq = record.mlpPre.length;
  if (seq === 0) return 1;
  const wanted = Math.max(2, Math.min(sample, seq));
  const stride = Math.max(1, Math.floor(seq / wanted));
  const vectors: Float64Array[] = [];
  for (let i = 0; i < seq && vectors.length < wanted; i += stride) {
    const row = record.mlpPre[i];
    if (row) vectors.push(row);
  }
  return superpositionScore(vectors);
}

// ---------------------------------------------------------------------------
// Induction
// ---------------------------------------------------------------------------

/** The strongest induction head in a scored list, or null when there are none. */
function strongest(scores: readonly InductionScore[]): InductionScore | null {
  let best: InductionScore | null = null;
  for (const score of scores) {
    if (!best || score.score > best.score) best = score;
  }
  return best;
}

/** The strongest induction head in the model for this sequence, if any. */
export function inductionHead(model: CogitatomeModel, tokens: readonly number[]): InductionScore | null {
  const trace = model.forward(tokens);
  const scores = inductionScore(model, trace);
  let best: InductionScore | null = null;
  for (const score of scores) {
    if (!best || score.score > best.score) best = score;
  }
  return best;
}

/** The strongest induction head's score, or 0 when there is no induction signal. */
export function inductionHeadStrength(model: CogitatomeModel, tokens: readonly number[]): number {
  return inductionHead(model, tokens)?.score ?? 0;
}

/** Every induction score for a sequence, strongest first. */
export function inductionScores(model: CogitatomeModel, tokens: readonly number[]): InductionScore[] {
  const trace = model.forward(tokens);
  return inductionScore(model, trace).sort((a, b) => b.score - a.score || a.layer - b.layer || a.head - b.head);
}

// ---------------------------------------------------------------------------
// Stability
// ---------------------------------------------------------------------------

/**
 * 1 minus the relative variation of a series.
 *
 * The relative variation is the coefficient of variation (σ/|μ|), so a flat
 * series scores 1 and a wildly fluctuating one clamps to 0. The clamp matters:
 * a series whose mean is zero has an infinite coefficient of variation, and
 * returning a negative "stability" would be worse than useless.
 */
export function stabilityScore(values: NumberVector): number {
  if (values.length === 0) return 1;
  const centre = mean(values);
  if (centre === 0) return 0;
  const variation = stdDev(values) / Math.abs(centre);
  if (!Number.isFinite(variation)) return 0;
  return Math.min(1, Math.max(0, 1 - variation));
}

// ---------------------------------------------------------------------------
// The aggregate
// ---------------------------------------------------------------------------

/** Everything the `/api/v1/metrics` route needs, in one object. */
export interface MetricsReport {
  readonly seqLen: number;
  readonly layers: number;
  readonly heads: number;
  /** Mean normalised attention entropy, [layer][head]. */
  readonly attentionEntropy: readonly number[][];
  readonly meanAttentionEntropy: number;
  readonly headProfiles: readonly HeadProfile[];
  readonly roleCounts: Readonly<Record<HeadRole, number>>;
  readonly previousTokenHeads: number;
  readonly inductionHeads: number;
  /** Fraction of MLP pre-activations at (near) zero, averaged over layers. */
  readonly meanFeatureSparsity: number;
  readonly mlpNeurons: number;
  readonly superposition: number;
  readonly inductionStrength: number;
  readonly inductionWinner: HeadRef | null;
  /** Top logit at every position — what `stability` is computed over. */
  readonly topLogits: readonly number[];
  readonly stability: number;
}

/**
 * Run the whole metric battery over one forward pass.
 *
 * One trace, every number: the expensive part is a single forward pass, so a
 * dashboard that needs three of these numbers should call this once rather
 * than three times.
 */
export function allMetrics(model: CogitatomeModel, tokens: readonly number[]): MetricsReport {
  const trace = model.forward(tokens);
  const profiles = profileHeads(trace);
  const roleCounts: Record<HeadRole, number> = {
    "previous-token": 0,
    induction: 0,
    copying: 0,
    positional: 0,
    diffuse: 0,
    "attention-sink": 0
  };
  for (const profile of profiles) roleCounts[profile.role] += 1;

  const entropy = attentionEntropyMatrix(trace);
  const lastLayer = trace.config.nLayers - 1;
  const layerRecords = trace.layers.filter((record) => record !== undefined);
  const sparsities = layerRecords.map((record) => {
    const flat: number[] = [];
    for (const row of record.mlpPre) flat.push(...row);
    return featureSparsity(flat);
  });

  const winner = strongest(inductionScore(model, trace));

  const topLogits = trace.logits.map((row) => {
    let best = -Infinity;
    for (const value of row) if (value > best) best = value;
    return best === -Infinity ? 0 : best;
  });

  return {
    seqLen: trace.tokens.length,
    layers: trace.config.nLayers,
    heads: trace.config.nHeads,
    attentionEntropy: entropy,
    meanAttentionEntropy: entropy.flat().length === 0 ? 0 : mean(entropy.flat()),
    headProfiles: profiles,
    roleCounts,
    previousTokenHeads: roleCounts["previous-token"],
    inductionHeads: roleCounts.induction,
    meanFeatureSparsity: sparsities.length === 0 ? 0 : mean(sparsities),
    mlpNeurons: trace.config.dMlp,
    superposition: superpositionFromTrace(trace, Math.max(0, lastLayer)),
    inductionStrength: winner?.score ?? 0,
    inductionWinner: winner ? { layer: winner.layer, head: winner.head } : null,
    topLogits,
    stability: stabilityScore(topLogits)
  };
}
