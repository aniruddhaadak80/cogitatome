/**
 * Neurons, features and heatmaps.
 *
 * Where `heads.ts` is about the *attention* side of the model, this module is
 * about the *values* side: which MLP neurons fire, on which tokens, how loudly,
 * and how two positions in the residual stream relate to each other. It is
 * deliberately presentation-shaped — everything it returns is a plain,
 * serialisable record that a dissect view can render without post-processing.
 */
import { cosine, topK } from "../math";
import type { ActivationRecord, AtlasCell, ForwardTrace, NeuronStat } from "../types";
import { tokenSymbol } from "./heads";

/** One head's attention rows, raw and normalised for display. */
export interface AttentionHeatmap {
  /** `rows[i][j]` = P(attend to j | query i), causal (zero above the diagonal). */
  readonly rows: Float64Array[];
  /** The same rows divided by the global maximum, so every entry is 0..1. */
  readonly normalized: Float64Array[];
}

/**
 * Per-neuron summary of one layer's MLP pre-activations.
 *
 * Pre-activations, not post-GELU activations: they are the part that keeps its
 * sign, so a neuron that fires on "token a but not token b" is visible as a
 * signed bimodal distribution rather than two identical positive bumps.
 */
export function neuronStats(trace: ForwardTrace, layer: number): NeuronStat[] {
  const record = trace.layers[layer];
  if (!record) throw new RangeError(`neuronStats: trace has no layer ${layer}`);
  const seq = record.mlpPre.length;
  const neurons = record.mlpPre[0]?.length ?? 0;
  const out: NeuronStat[] = [];
  for (let n = 0; n < neurons; n += 1) {
    const values: number[] = [];
    for (let i = 0; i < seq; i += 1) values.push(record.mlpPre[i]?.[n] ?? 0);
    const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, values.length);
    let max = -Infinity;
    let min = Infinity;
    let zero = 0;
    for (const v of values) {
      if (v > max) max = v;
      if (v < min) min = v;
      if (Math.abs(v) <= 1e-8) zero += 1;
    }
    out.push({
      index: n,
      mean,
      std: Math.sqrt(variance),
      max: values.length === 0 ? 0 : max,
      min: values.length === 0 ? 0 : min,
      sparsity: values.length === 0 ? 0 : zero / values.length
    });
  }
  return out;
}

/**
 * The `topN` loudest neurons of a layer, each with its `topN` best positions.
 *
 * "Loudest" is measured by the neuron's maximum firing over the sequence, so
 * the atlas is dominated by the neurons that actually say something on this
 * stimulus. Ties are broken by neuron index, which keeps the export stable
 * when a layer is dead (the constructed model's MLPs are all zero) — the atlas
 * then reports zeros rather than an arbitrary subset.
 */
export function activationAtlas(trace: ForwardTrace, layer: number, topN = 8): AtlasCell[] {
  const stats = neuronStats(trace, layer);
  const record = trace.layers[layer];
  if (!record) throw new RangeError(`activationAtlas: trace has no layer ${layer}`);
  const cells = Math.max(0, Math.min(topN, stats.length));
  const loudest = [...stats]
    .sort((a, b) => b.max - a.max || a.index - b.index)
    .slice(0, cells);
  return loudest.map((stat) => {
    const positions = topK(
      record.mlpPre.map((row) => row?.[stat.index] ?? 0),
      Math.max(0, Math.min(topN, record.mlpPre.length))
    );
    const topActivating: readonly ActivationRecord[] = positions.map((item) => ({
      neuron: stat.index,
      activation: item.value,
      tokenIndex: item.index,
      token: tokenSymbol(trace.tokens[item.index] ?? -1)
    }));
    return { neuron: stat.index, topActivating };
  });
}

/**
 * A head's attention pattern as two aligned matrices: the probabilities and a
 * 0..1 copy for colouring. The normalised copy is what a heatmap wants; the
 * raw copy is what every other function in this file consumes.
 */
export function attentionHeatmap(trace: ForwardTrace, layer: number, head: number): AttentionHeatmap {
  const record = trace.layers[layer];
  if (!record) throw new RangeError(`attentionHeatmap: trace has no layer ${layer}`);
  const rows = record.attention[head];
  if (!rows) throw new RangeError(`attentionHeatmap: trace has no head ${head} in layer ${layer}`);
  const copy = rows.map((row) => Float64Array.from(row));
  let max = 0;
  for (const row of copy) for (const value of row) if (value > max) max = value;
  const normalized = copy.map((row) => {
    const out = new Float64Array(row.length);
    for (let j = 0; j < row.length; j += 1) out[j] = max > 0 ? (row[j] ?? 0) / max : 0;
    return out;
  });
  return { rows: copy, normalized };
}

/**
 * Cosine similarity between the residual streams at two positions.
 *
 * A high similarity means "the model has collapsed these two contexts into the
 * same internal state", which is the qualitative signature of a position that
 * an induction head has already resolved.
 */
export function embeddingSimilarity(trace: ForwardTrace, i: number, j: number): number {
  const a = trace.finalResidual[i];
  const b = trace.finalResidual[j];
  if (!a || !b) throw new RangeError(`embeddingSimilarity: position outside the trace`);
  return cosine(a, b);
}

/** The n loudest (neuron, position, activation) triples in a layer. */
export function topActivatingNeurons(trace: ForwardTrace, layer: number, n: number): ActivationRecord[] {
  const record = trace.layers[layer];
  if (!record) throw new RangeError(`topActivatingNeurons: trace has no layer ${layer}`);
  const all: ActivationRecord[] = [];
  for (let i = 0; i < record.mlpPre.length; i += 1) {
    const row = record.mlpPre[i];
    if (!row) continue;
    for (let neuron = 0; neuron < row.length; neuron += 1) {
      all.push({
        neuron,
        activation: row[neuron] ?? 0,
        tokenIndex: i,
        token: tokenSymbol(trace.tokens[i] ?? -1)
      });
    }
  }
  all.sort((a, b) => b.activation - a.activation || a.neuron - b.neuron || a.tokenIndex - b.tokenIndex);
  return all.slice(0, Math.max(0, n));
}
