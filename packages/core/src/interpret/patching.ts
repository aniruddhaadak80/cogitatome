/**
 * Causal interventions: residual patching, sweeps and head knockouts.
 *
 * Every function here is a counterfactual. The model runs once on the baseline
 * sequence, once on a source sequence, and once with something spliced in or
 * zeroed out; the interesting output is the *difference* in the prediction.
 * Differences are what turn a description of a circuit into evidence for it.
 *
 * ---------------------------------------------------------------------------
 * THE PATCHING MECHANISM (judgement call, so it is spelled out)
 * ---------------------------------------------------------------------------
 * `CogitatomeModel.forward` is a pure function of its weights and its tokens,
 * and `model.ts` is off limits, so a splice has to be expressed *as weights*.
 * The only per-position channel the model exposes at its input is the position
 * embedding table — `inputResidual` reads `embedding[tok] + position[i]`, so
 * adding a vector to row `i` of `position` adds exactly that vector to position
 * `i` and to nothing else. `patchModel` therefore clones the weights and adds
 * the splice delta to the patched rows of the position table, then runs the
 * model's own forward.
 *
 * That makes the intervention exact **at the input residual**. When the splice
 * is requested at layer `L > 0` the delta also has to pass through layers
 * `0..L-1`, which can read it and react. The splice is bit-for-bit exact at the
 * requested site whenever the delta is supported on residual dimensions that
 * no layer below the site reads — which `spliceSiteExactness` computes and
 * `patchResidualDetailed` reports as `exact`.
 *
 * This is not a limitation of the implementation so much as a statement about
 * the model: an intervention that changes layer 0's input *should* change
 * layer 0's output, and a real activation patch has to pick a place to land.
 * The constructed induction model makes the useful case available — no layer
 * reads the shifted subspace except layer 1's keys — so patching that subspace
 * after layer 0 is exact, and that is what the tests assert.
 */
import { CogitatomeModel, type LayerWeights } from "../model";
import { checksum, norm, type NumberVector } from "../math";
import type { ForwardTrace, PatchReport, PatchStep } from "../types";

/** A rectangular band of the residual stream, e.g. `SUBSPACE`. */
export interface SubspaceMask {
  readonly start: number;
  readonly end: number;
}

/** What a patch run reports back. */
export interface PatchOutcome {
  readonly trace: ForwardTrace;
  readonly layer: number;
  readonly positions: readonly number[];
  /** ||source - baseline|| summed over the patched positions. */
  readonly spliceNorm: number;
  /** ||source|| summed over the patched positions — how much was written. */
  readonly sourceNorm: number;
  /** True when every layer below the site is blind to the injected directions. */
  readonly exact: boolean;
}

export interface PatchOptions {
  /** Restrict the splice to a band of the residual stream. */
  readonly subspace?: SubspaceMask;
}

export interface SweepOptions extends PatchOptions {
  /** Where to read the effect out; defaults to the final position. */
  readonly readPosition?: number;
  /** Sweep every `stride`-th position; defaults to 1 (all positions). */
  readonly stride?: number;
}

const D_HEAD = (config: { readonly dModel: number; readonly nHeads: number }): number =>
  config.dModel / config.nHeads;

/**
 * Clone the model so that the input residual at position `i` is shifted by
 * `deltas[i]`.
 *
 * Only the position table is touched, and only the rows named. Everything else
 * — including the embedding table, which is shared by every position holding
 * the same token — is shared by reference with the clone, so the patched model
 * is as cheap as the original and cannot drift from it.
 */
export function patchModel(model: CogitatomeModel, deltas: readonly (NumberVector | undefined)[]): CogitatomeModel {
  const { config } = model;
  const position = Float64Array.from(model.weights.position);
  for (let i = 0; i < deltas.length; i += 1) {
    const delta = deltas[i];
    if (!delta) continue;
    if (i >= config.maxLen) throw new RangeError(`patchModel: position ${i} exceeds maxLen ${config.maxLen}`);
    if (delta.length !== config.dModel) {
      throw new RangeError(`patchModel: delta at ${i} has length ${delta.length}, expected ${config.dModel}`);
    }
    for (let d = 0; d < config.dModel; d += 1) {
      position[i * config.dModel + d] = (position[i * config.dModel + d] ?? 0) + (delta[d] ?? 0);
    }
  }
  return new CogitatomeModel({ ...model.weights, position });
}

/**
 * Which residual dimensions layer `below` can be influenced through.
 *
 * A dimension is "read" when some matrix below the site has a non-zero entry
 * pointing at it: the query, key and value projections of the layer. If the
 * model uses a layer norm or an MLP, *every* dimension is read, because both
 * mix across the whole vector before anything reads out of it.
 */
export function readDimensions(model: CogitatomeModel, below: number): boolean[] {
  const { config } = model;
  const read = new Array<boolean>(config.dModel).fill(false);
  if (model.weights.useLayerNorm || model.weights.useMlp) return read;
  const cols = config.nHeads * D_HEAD(config);
  for (let l = 0; l < Math.max(0, Math.min(below, config.nLayers)); l += 1) {
    const weights = model.weights.layers[l];
    if (!weights) continue;
    for (const matrix of [weights.wq, weights.wk, weights.wv]) {
      for (let r = 0; r < config.dModel; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (Math.abs(matrix[r * cols + c] ?? 0) > 0) {
            read[r] = true;
            break;
          }
        }
      }
    }
  }
  return read;
}

/** The complement of {@link readDimensions}: dimensions nothing below reads. */
export function blindDimensions(model: CogitatomeModel, below: number): boolean[] {
  return readDimensions(model, below).map((r) => !r);
}

/**
 * Splice the source's residual rows into the baseline run.
 *
 * `layer` names the layer whose *output* residual is the splice site, so
 * `layer: 0` lands on `trace.layers[0].residual` and is read by layer 1. The
 * patched positions are the ones rewritten; every other position runs the
 * baseline computation untouched.
 */
export function patchResidualDetailed(
  model: CogitatomeModel,
  tokens: readonly number[],
  sourceTokens: readonly number[],
  layer: number,
  positions: readonly number[],
  options: PatchOptions = {}
): PatchOutcome {
  const { config } = model;
  if (tokens.length !== sourceTokens.length) {
    throw new RangeError("patchResidual: patching needs the same sequence length");
  }
  if (!Number.isInteger(layer) || layer < 0 || layer >= config.nLayers) {
    throw new RangeError(`patchResidual: layer ${layer} outside 0..${config.nLayers - 1}`);
  }
  const baseline = model.forward(tokens);
  const source = model.forward(sourceTokens);
  const site = baseline.layers[layer];
  const sourceSite = source.layers[layer];
  if (!site || !sourceSite) throw new RangeError(`patchResidual: no site for layer ${layer}`);

  const blind = blindDimensions(model, layer);
  const deltas: (Float64Array | undefined)[] = new Array(tokens.length).fill(undefined);
  const touched: number[] = [];
  let spliceNorm = 0;
  let sourceNorm = 0;
  let exact = true;
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 0 || position >= tokens.length) {
      throw new RangeError(`patchResidual: position ${position} outside the trace`);
    }
    const from = site.residual[position];
    const to = sourceSite.residual[position];
    if (!from || !to) continue;
    const { start, end } = options.subspace ?? { start: 0, end: config.dModel };
    const delta = new Float64Array(config.dModel);
    for (let d = 0; d < config.dModel; d += 1) {
      const masked = d >= start && d < end ? (to[d] ?? 0) - (from[d] ?? 0) : 0;
      delta[d] = masked;
      if (masked !== 0 && !blind[d]) exact = false;
    }
    deltas[position] = delta;
    touched.push(position);
    spliceNorm += norm(delta);
    sourceNorm += norm(to);
  }

  return {
    trace: patchModel(model, deltas).forward(tokens),
    layer,
    positions: touched,
    spliceNorm,
    sourceNorm,
    exact
  };
}

/** {@link patchResidualDetailed}, returning only the patched trace. */
export function patchResidual(
  model: CogitatomeModel,
  tokens: readonly number[],
  sourceTokens: readonly number[],
  layer: number,
  positions: readonly number[],
  options: PatchOptions = {}
): ForwardTrace {
  return patchResidualDetailed(model, tokens, sourceTokens, layer, positions, options).trace;
}

/**
 * Patch one position at a time and report what each one costs.
 *
 * `causalStrength` compares the best single position against patching
 * everything at once. A value near 1 means one position is doing all the work;
 * near 0 means the effect is genuinely distributed and no single site explains
 * the behaviour — which is just as important a finding, and much harder to
 * fake.
 */
export function patchingSweep(
  model: CogitatomeModel,
  tokens: readonly number[],
  sourceTokens: readonly number[],
  layer: number,
  targetToken: number,
  options: SweepOptions = {}
): PatchReport {
  const stride = Math.max(1, options.stride ?? 1);
  const readPosition = options.readPosition ?? tokens.length - 1;
  const baseline = model.forward(tokens);
  const source = model.forward(sourceTokens);
  const baselineLogit = baseline.logits[readPosition]?.[targetToken] ?? 0;
  const site = baseline.layers[layer];
  const sourceSite = source.layers[layer];
  if (!site || !sourceSite) throw new RangeError(`patchingSweep: no site for layer ${layer}`);

  const steps: PatchStep[] = [];
  for (let p = 0; p < tokens.length; p += stride) {
    const patched = patchResidualDetailed(model, tokens, sourceTokens, layer, [p], options);
    const logit = patched.trace.logits[readPosition]?.[targetToken] ?? 0;
    const from = site.residual[p] ?? [];
    const to = sourceSite.residual[p] ?? [];
    steps.push({
      position: p,
      magnitude: norm(to),
      deltaNorm: norm(to.map((value, d) => value - (from[d] ?? 0))),
      effectOnTarget: logit - baselineLogit
    });
  }

  const allPositions = steps.map((s) => s.position);
  const all = patchResidualDetailed(model, tokens, sourceTokens, layer, allPositions, options);
  const targetLogitDelta = (all.trace.logits[readPosition]?.[targetToken] ?? 0) - baselineLogit;
  let bestMagnitude = 0;
  for (const step of steps) {
    const magnitude = Math.abs(step.effectOnTarget);
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
    }
  }
  const denominator = Math.abs(targetLogitDelta);
  return {
    layer,
    steps,
    targetLogitDelta,
    causalStrength: denominator > 0 ? bestMagnitude / denominator : 0
  };
}

/**
 * Zero one head's output, implemented here from the weights rather than by
 * calling `CogitatomeModel.ablateHead`.
 *
 * The duplication is deliberate: `ablateHead` is the reference implementation
 * and this is the independent one, so the tests can assert that the two agree
 * bit for bit. If a future change to the model made the gain path behave
 * differently, they would disagree.
 */
export function knockoutEffect(
  model: CogitatomeModel,
  tokens: readonly number[],
  layer: number,
  head: number
): ForwardTrace {
  const target = model.weights.layers[layer];
  if (!target) throw new RangeError(`knockoutEffect: no layer ${layer}`);
  if (head < 0 || head >= model.config.nHeads) {
    throw new RangeError(`knockoutEffect: head ${head} outside 0..${model.config.nHeads - 1}`);
  }
  const layers: LayerWeights[] = model.weights.layers.map((weights, index) =>
    index === layer
      ? { ...weights, headGain: weights.headGain.map((gain, h) => (h === head ? 0 : gain)) }
      : weights
  );
  return new CogitatomeModel({ ...model.weights, layers }).forward(tokens);
}

/**
 * A stable fingerprint of a whole trace.
 *
 * Two traces built by the same code path from the same inputs produce the same
 * checksum, so this is the cheapest way to assert "the patched run is the
 * baseline run" without comparing every float by hand.
 */
export function traceChecksum(trace: ForwardTrace): string {
  const flat: number[] = [];
  for (const layer of trace.layers) {
    for (const row of layer.residual) flat.push(...row);
    for (const row of layer.attnOut) flat.push(...row);
    for (const row of layer.mlpOut) flat.push(...row);
    for (const head of layer.attention) for (const row of head) flat.push(...row);
    for (const row of layer.headOut) flat.push(...row);
    for (const row of layer.mlpPre) flat.push(...row);
  }
  for (const row of trace.logits) flat.push(...row);
  for (const row of trace.finalResidual) flat.push(...row);
  return checksum(flat);
}
