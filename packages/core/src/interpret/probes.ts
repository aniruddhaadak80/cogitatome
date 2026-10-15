/**
 * Linear probes — trained for real.
 *
 * A probe is the cheapest honest test of "is this information *present* in the
 * residual stream?": fit a logistic regression on the layer's activations and
 * see whether it separates the two classes. The probe is trained here by plain
 * gradient descent from a seeded initialisation, so the whole procedure is
 * reproducible — there is no library call and no shuffling that depends on
 * insertion order.
 *
 * A probe that fails has told you the information is not linearly available at
 * that depth. That is a real result, not a bug: information that exists only
 * non-linearly (or not yet, or no longer) is what makes depth interesting.
 */
import { norm } from "../math";
import type { CogitatomeModel } from "../model";
import { Rng } from "../rng";
import type { ForwardTrace, ProbeResult } from "../types";

/** Gradient-descent knobs for {@link fitProbe}. */
export interface ProbeOptions {
  readonly epochs?: number;
  readonly lr?: number;
  readonly l2?: number;
  readonly seed?: number;
}

export const DEFAULT_PROBE_OPTIONS: Required<ProbeOptions> = {
  epochs: 300,
  lr: 0.5,
  l2: 1e-4,
  seed: 60602
};

/** A trained probe, with the diagnostics you need to trust it. */
export interface ProbeFit {
  readonly weights: readonly number[];
  readonly bias: number;
  readonly accuracy: number;
  /** ROC-AUC from the rank/Mann-Whitney formula — 0.5 is chance. */
  readonly auc: number;
  readonly epochs: number;
  readonly dimensions: number;
  readonly samples: number;
}

/** Label builder: token id, position, and the whole sequence for context. */
export type PositionLabelFn = (token: number, index: number, tokens: readonly number[]) => number;

/** Which layers to probe. */
export interface LayerFilter {
  readonly from?: number;
  readonly to?: number;
}

/** Numerically safe logistic function. */
function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * ROC-AUC by the Mann-Whitney rank formula.
 *
 * AUC is the probability that a randomly chosen positive scores above a
 * randomly chosen negative. Ties get the average of the ranks they span, which
 * is what makes the number exact for discrete scores rather than dependent on
 * sort order.
 */
export function rocAuc(scores: readonly number[], labels: readonly number[]): number {
  if (scores.length !== labels.length) throw new RangeError("rocAuc: length mismatch");
  const order = scores.map((_, i) => i).sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0) || a - b);
  const ranks = new Float64Array(scores.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && Math.abs((scores[order[j + 1] ?? 0] ?? 0) - (scores[order[i] ?? 0] ?? 0)) < 1e-12) {
      j += 1;
    }
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k] ?? 0] = average;
    i = j + 1;
  }
  let positives = 0;
  for (const label of labels) if (label === 1) positives += 1;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  let sumPositiveRanks = 0;
  for (let k = 0; k < labels.length; k += 1) {
    if (labels[k] === 1) sumPositiveRanks += ranks[k] ?? 0;
  }
  const auc = (sumPositiveRanks - (positives * (positives + 1)) / 2) / (positives * negatives);
  return Math.min(1, Math.max(0, auc));
}

/**
 * Logistic regression by full-batch gradient descent.
 *
 * L2 regularisation is applied to the weights but not the bias, the usual
 * choice: regularising the bias would make the fitted class prior depend on
 * the penalty, which is the opposite of what you want from a probe.
 */
export function fitProbe(
  activations: readonly Float64Array[],
  labels: readonly number[],
  options: ProbeOptions = {}
): ProbeFit {
  if (activations.length !== labels.length) {
    throw new RangeError(`fitProbe: ${activations.length} activations but ${labels.length} labels`);
  }
  const samples = activations.length;
  if (samples === 0) throw new RangeError("fitProbe: no samples");
  const dimension = activations[0]?.length ?? 0;
  if (dimension === 0) throw new RangeError("fitProbe: zero-dimensional activations");
  const { epochs, lr, l2, seed } = { ...DEFAULT_PROBE_OPTIONS, ...options };
  const rng = new Rng(seed);

  const classes = new Set<number>();
  const binary = labels.map((label) => {
    const value = Math.round(label);
    if (value !== 0 && value !== 1) {
      throw new RangeError(`fitProbe: label ${label} is not 0 or 1`);
    }
    classes.add(value);
    return value;
  });

  const weights = new Float64Array(dimension);
  for (let d = 0; d < dimension; d += 1) weights[d] = rng.symmetric(1 / Math.sqrt(dimension));
  let bias = 0;
  const gradW = new Float64Array(dimension);
  let gradB = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    gradW.fill(0);
    gradB = 0;
    for (let s = 0; s < samples; s += 1) {
      const x = activations[s];
      if (!x || x.length !== dimension) {
        throw new RangeError(`fitProbe: sample ${s} has the wrong dimension`);
      }
      let z = bias;
      for (let d = 0; d < dimension; d += 1) z += (weights[d] ?? 0) * (x[d] ?? 0);
      const error = sigmoid(z) - (binary[s] ?? 0);
      gradB += error;
      for (let d = 0; d < dimension; d += 1) gradW[d] = (gradW[d] ?? 0) + error * (x[d] ?? 0);
    }
    for (let d = 0; d < dimension; d += 1) {
      weights[d] = (weights[d] ?? 0) - lr * ((gradW[d] ?? 0) / samples + l2 * (weights[d] ?? 0));
    }
    bias -= lr * (gradB / samples);
  }

  const scores = activations.map((x) => {
    let z = bias;
    for (let d = 0; d < dimension; d += 1) z += (weights[d] ?? 0) * (x?.[d] ?? 0);
    return z;
  });
  let hits = 0;
  for (let s = 0; s < samples; s += 1) {
    const predicted = (scores[s] ?? 0) >= 0 ? 1 : 0;
    if (predicted === binary[s]) hits += 1;
  }
  return {
    weights: Array.from(weights),
    bias,
    accuracy: classes.size < 2 ? 1 : hits / samples,
    auc: rocAuc(scores, binary),
    epochs,
    dimensions: dimension,
    samples
  };
}

// ---------------------------------------------------------------------------
// Layer-by-layer probing
// ---------------------------------------------------------------------------

/**
 * Probe every layer's residual stream for the same property.
 *
 * The interesting shape of the output is a *curve*: accuracy that rises and
 * then falls says the model wrote the information down and later overwrote it
 * with something else. Accuracy that is flat at chance says the property is
 * simply not represented there.
 */
export function probeLayers(
  model: CogitatomeModel,
  tokens: readonly number[],
  labelFn: PositionLabelFn,
  layerFilter: LayerFilter = {},
  probeOptions: ProbeOptions = {}
): ProbeResult[] {
  const trace = model.forward(tokens);
  return probeLayersFromTrace(trace, labelFn, layerFilter, probeOptions);
}

/** {@link probeLayers} for callers that already hold a trace. */
export function probeLayersFromTrace(
  trace: ForwardTrace,
  labelFn: PositionLabelFn,
  layerFilter: LayerFilter = {},
  probeOptions: ProbeOptions = {}
): ProbeResult[] {
  const from = Math.max(0, layerFilter.from ?? 0);
  const to = Math.min(trace.config.nLayers - 1, layerFilter.to ?? trace.config.nLayers - 1);
  const out: ProbeResult[] = [];
  const epochs = probeOptions.epochs ?? DEFAULT_PROBE_OPTIONS.epochs;
  for (let l = from; l <= to; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;
    const activations = record.residual;
    const labels = activations.map((_, i) => labelFn(trace.tokens[i] ?? -1, i, trace.tokens));
    const fit = fitProbe(activations, labels, {
      ...probeOptions,
      epochs,
      seed: (probeOptions.seed ?? DEFAULT_PROBE_OPTIONS.seed) + l * 7919
    });
    const weights = Float64Array.from(fit.weights);
    const scale = norm(weights);
    out.push({
      layer: l,
      accuracy: fit.accuracy,
      auc: fit.auc,
      weights: fit.weights,
      bias: fit.bias,
      // The probe direction in the model's own coordinates: a unit vector in
      // the residual stream at that depth, directly comparable to the
      // unembedding row space.
      direction: scale > 0 ? Array.from(weights, (v) => v / scale) : Array.from(weights)
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The separable sanity check
// ---------------------------------------------------------------------------

/** The result of the synthetic-control probe check. */
export interface SeparableProbeCheck {
  readonly fit: ProbeFit;
  /** Did the *data* have a positive margin in every dimension? */
  readonly separable: boolean;
  readonly samples: number;
  readonly dimensions: number;
  readonly margin: number;
}

/**
 * A trivially separable synthetic dataset and the probe fitted to it.
 *
 * This exists so a broken probe cannot masquerade as a discovery: if a probe
 * cannot reach accuracy 1.0 on two clusters three standard deviations apart,
 * the training loop — not the model — is what is wrong. The margin reported is
 * the gap between the two class means, a property of the data rather than of
 * the fit.
 */
export function separableProbeTest(
  options: ProbeOptions = {},
  samples = 60,
  dimensions = 8,
  margin = 3
): SeparableProbeCheck {
  const rng = new Rng(options.seed ?? DEFAULT_PROBE_OPTIONS.seed ^ 0x5eed);
  const activations: Float64Array[] = [];
  const labels: number[] = [];
  for (let s = 0; s < samples; s += 1) {
    const positive = s % 2 === 1;
    const row = new Float64Array(dimensions);
    for (let d = 0; d < dimensions; d += 1) {
      row[d] = (positive ? margin : 0) + rng.normal(0, 1);
    }
    activations.push(row);
    labels.push(positive ? 1 : 0);
  }
  const fit = fitProbe(activations, labels, options);
  let observed = Infinity;
  for (let d = 0; d < dimensions; d += 1) {
    let p = 0;
    let q = 0;
    for (let s = 0; s < samples; s += 1) {
      if (labels[s] === 1) p += activations[s]?.[d] ?? 0;
      else q += activations[s]?.[d] ?? 0;
    }
    observed = Math.min(observed, Math.abs(p / (samples / 2) - q / (samples / 2)));
  }
  return {
    fit,
    separable: Number.isFinite(observed) && observed > 0,
    samples,
    dimensions,
    margin: Number.isFinite(observed) ? observed : 0
  };
}
