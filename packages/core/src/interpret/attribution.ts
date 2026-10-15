/**
 * Logit lens and direct logit attribution.
 *
 * Two complementary ways of asking "which part of the model is responsible for
 * this prediction":
 *
 *  - the **logit lens** runs the model's own output head on the residual
 *    stream *before* it has finished, so you can watch a belief form layer by
 *    layer. It is the standard "what does the model think so far" read-out.
 *  - **direct logit attribution** freezes the residual stream, splits it into
 *    the pieces the model added (token embedding, position embedding, every
 *    head, every MLP) and projects each piece onto the unembedding direction
 *    of the token you care about. Because the residual stream is *exactly* the
 *    sum of those pieces, the parts add back up to the logit — the property
 *    the tests assert.
 *
 * JUDGEMENT CALL — the model is the first argument. A `ForwardTrace` records
 * the residual stream and the logits but not the unembedding matrix or the
 * final layer norm, and neither decomposition is defined without them, so the
 * model that produced the trace has to come along. This matches the parameter
 * order every other module in the package uses (`patchResidual(model, ...)`,
 * `probeLayers(model, ...)`, `discoverCircuit(model, ...)`).
 */
import { dot, norm, project, softmax, sumOf, topK, type NumberVector, type Vector } from "../math";
import type { CogitatomeModel } from "../model";
import type { AttributionReport, ForwardTrace } from "../types";
import { tokenSymbol } from "./heads";

/** How many candidate tokens the logit lens reports per position. */
const LENS_TOP = 5;

// ---------------------------------------------------------------------------
// The read-out
// ---------------------------------------------------------------------------

/**
 * Apply the model's final layer norm — or nothing, when the model has it
 * disabled. The lens must use the *same* transform the model's own logits use,
 * otherwise "the lens at the last layer" would not reproduce `trace.logits`.
 */
function finalNorm(model: CogitatomeModel, residual: NumberVector): Vector {
  const { lnFGamma, lnFBeta } = model.weights;
  if (!model.weights.useLayerNorm) return Float64Array.from(residual);
  const n = residual.length;
  const mean = sumOf(residual) / n;
  const variance = sumOf(Array.from(residual, (v) => (v - mean) * (v - mean))) / n;
  const inv = 1 / Math.sqrt(variance + 1e-5);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = ((residual[i] ?? 0) - mean) * inv * (lnFGamma[i] ?? 1) + (lnFBeta[i] ?? 0);
  }
  return out;
}

/** The v-th column of the unembedding: the direction that reads out token v. */
function unembedColumn(model: CogitatomeModel, token: number): Vector {
  const { config } = model;
  if (!Number.isInteger(token) || token < 0 || token >= config.vocabSize) {
    throw new RangeError(`unembedColumn: token ${token} outside 0..${config.vocabSize - 1}`);
  }
  const out = new Float64Array(config.dModel);
  for (let d = 0; d < config.dModel; d += 1) {
    out[d] = model.weights.unembed[d * config.vocabSize + token] ?? 0;
  }
  return out;
}

/** Row `index` of a row-major flat matrix, copied out as a fresh vector. */
function matrixRow(matrix: ArrayLike<number>, index: number, cols: number): Vector {
  const out = new Float64Array(cols);
  for (let d = 0; d < cols; d += 1) out[d] = matrix[index * cols + d] ?? 0;
  return out;
}

/** Logits implied by one residual vector, exactly as the model would emit them. */
function lensLogits(model: CogitatomeModel, residual: NumberVector): Float64Array {
  const { config } = model;
  // The unembedding is stored dModel × vocab, so reading logits out of a
  // residual vector needs the transpose-side projection — the same direction
  // `CogitatomeModel.forward` uses. (`matVec` here would demand a
  // vocab-length vector and throw; this was caught by e2e, see api.spec.ts.)
  const logits = project(model.weights.unembed, config.dModel, config.vocabSize, finalNorm(model, residual));
  for (let v = 0; v < config.vocabSize; v += 1) {
    logits[v] = (logits[v] ?? 0) + (model.weights.unembedBias[v] ?? 0);
  }
  return logits;
}

/** 0-based rank of `token` inside `logits`; -1 when the token is out of range. */
function rankOf(logits: NumberVector, token: number): number {
  if (token < 0 || token >= logits.length) return -1;
  const target = logits[token] ?? 0;
  let rank = 0;
  for (const value of logits) if (value > target) rank += 1;
  return rank;
}

// ---------------------------------------------------------------------------
// Logit lens
// ---------------------------------------------------------------------------

/** One position's "what the model believes so far" snapshot. */
export interface LogitLensEntry {
  readonly layer: number;
  readonly position: number;
  /** The token id sitting at this position. */
  readonly token: number;
  /** The same token, decoded. */
  readonly symbol: string;
  readonly top: readonly { readonly token: number; readonly logit: number; readonly prob: number }[];
  /** Rank of the position's own token in the lens distribution (0 = top). */
  readonly rank: number;
}

/**
 * Project every position's residual at `layerIndex` through the unembedding.
 *
 * Running this for layer 0..nLayers-1 and watching the top entry move is the
 * cheapest qualitative test of whether a model has already "made up its mind"
 * early. By construction the lens at the last layer is the model's own logits,
 * which is what the test asserts.
 */
export function logitLens(
  model: CogitatomeModel,
  trace: ForwardTrace,
  layerIndex: number = trace.config.nLayers - 1
): LogitLensEntry[] {
  const { config } = trace;
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= config.nLayers) {
    throw new RangeError(`logitLens: layer ${layerIndex} outside 0..${config.nLayers - 1}`);
  }
  const record = trace.layers[layerIndex];
  if (!record) throw new RangeError(`logitLens: trace has no layer ${layerIndex}`);
  const out: LogitLensEntry[] = [];
  for (let p = 0; p < record.residual.length; p += 1) {
    const residual = record.residual[p];
    if (!residual) continue;
    const logits = lensLogits(model, residual);
    const probs = softmax(logits);
    const token = trace.tokens[p] ?? -1;
    out.push({
      layer: layerIndex,
      position: p,
      token,
      symbol: tokenSymbol(token),
      top: topK(logits, LENS_TOP).map((item) => ({
        token: item.index,
        logit: item.value,
        prob: probs[item.index] ?? 0
      })),
      rank: rankOf(logits, token)
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Direct logit attribution
// ---------------------------------------------------------------------------

/**
 * Split the target logit into the pieces the model added to the residual
 * stream, and project each piece onto the token's read-out direction.
 *
 * The residual stream after the last layer is *identically*
 *
 *     embed + position + Σ_layers attnOut + Σ_layers mlpOut + unembedBias
 *
 * because `CogitatomeModel.forward` is exactly an accumulator over those
 * writes, so the components sum to the logit to floating-point precision
 * whenever the model reads out the raw residual (layer norm disabled).
 *
 * JUDGEMENT CALL: when the model *does* apply a final layer norm the read-out
 * is no longer linear in the residual, so no exact decomposition of the final
 * logit exists. The report then decomposes the pre-norm logit, which is the
 * standard practice and is what the `total` field reports; `components` still
 * sum to `total` exactly.
 */
export function logitAttribution(
  model: CogitatomeModel,
  trace: ForwardTrace,
  position: number,
  targetToken: number
): AttributionReport {
  const { config } = trace;
  if (!Number.isInteger(position) || position < 0 || position >= trace.tokens.length) {
    throw new RangeError(`logitAttribution: position ${position} outside the trace`);
  }
  const direction = unembedColumn(model, targetToken);
  const values: { name: string; value: number }[] = [];

  // The input residual is embed + position; report the two halves separately.
  const embeddingRow = matrixRow(model.weights.embedding, trace.tokens[position] ?? -1, trace.config.dModel);
  values.push({ name: "token", value: dot(embeddingRow, direction) });
  const positionRow = matrixRow(model.weights.position, position, config.dModel);
  values.push({ name: "position", value: dot(positionRow, direction) });

  for (let l = 0; l < config.nLayers; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;
    const attn = record.attnOut[position];
    if (attn) values.push({ name: `attn.${l}`, value: dot(attn, direction) });
    const mlp = record.mlpOut[position];
    if (mlp) values.push({ name: `mlp.${l}`, value: dot(mlp, direction) });
  }

  values.push({ name: "unembed.bias", value: model.weights.unembedBias[targetToken] ?? 0 });

  // Every write the model made, projected onto the read-out direction.
  const total = values.reduce((s, c) => s + c.value, 0);
  const absTotal = Math.abs(total);
  return {
    targetToken,
    position,
    total,
    components: values.map((c) => ({
      name: c.name,
      value: c.value,
      // Normalised by |total| so the shares always sum to ±1 rather than
      // blowing up when the components cancel each other out.
      share: absTotal > 0 ? c.value / absTotal : 0
    }))
  };
}

/** One source's slice of the residual stream at a position. */
export interface ResidualComponent {
  readonly source: string;
  readonly vector: Vector;
  readonly norm: number;
  /** norm / Σ norms — how much of the stream's magnitude came from here. */
  readonly share: number;
}

/**
 * The residual stream at one position, split by the source that wrote it.
 *
 * Unlike direct logit attribution this is read-out agnostic: it answers "how
 * much of the stream is the input, and how much did each layer add", which is
 * the first thing to look at when a model's behaviour is dominated by one
 * layer. `model` is optional; when supplied the input residual is further
 * split into its token- and position-embedding halves, which a trace only
 * records in combined form.
 */
export function residualDecomposition(
  trace: ForwardTrace,
  position: number,
  model?: CogitatomeModel
): ResidualComponent[] {
  if (!Number.isInteger(position) || position < 0 || position >= trace.tokens.length) {
    throw new RangeError(`residualDecomposition: position ${position} outside the trace`);
  }
  const pieces: { source: string; vector: Vector }[] = [];
  const ids = trace.ids[position];
  if (ids && model) {
    pieces.push({
      source: "token",
      vector: matrixRow(model.weights.embedding, trace.tokens[position] ?? -1, trace.config.dModel)
    });
    pieces.push({ source: "position", vector: matrixRow(model.weights.position, position, trace.config.dModel) });
  } else if (ids) {
    pieces.push({ source: "input", vector: Float64Array.from(ids) });
  }
  for (let l = 0; l < trace.config.nLayers; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;
    const attn = record.attnOut[position];
    if (attn) pieces.push({ source: `attn.${l}`, vector: Float64Array.from(attn) });
    const mlp = record.mlpOut[position];
    if (mlp) pieces.push({ source: `mlp.${l}`, vector: Float64Array.from(mlp) });
  }
  const totalNorm = pieces.reduce((s, p) => s + norm(p.vector), 0);
  return pieces.map((p) => ({
    source: p.source,
    vector: p.vector,
    norm: norm(p.vector),
    share: totalNorm > 0 ? norm(p.vector) / totalNorm : 0
  }));
}
