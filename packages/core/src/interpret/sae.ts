/**
 * A real sparse autoencoder over the MLP pre-activations.
 *
 * Superposition means one neuron fires for several unrelated reasons, so a
 * neuron's activation is a poor unit of explanation. An SAE fights that by
 * learning a *wider* set of directions (nFeatures >> dIn) under an L1 penalty,
 * so a sample activates a handful of features instead of half of them. Each
 * feature then has a decoder direction — a thing you can point at and say
 * "the model means this".
 *
 * This is plain gradient descent, not a library: every number in the report is
 * reproducible from the seed, which is what lets the tests assert that dead
 * features are resampled deterministically.
 */
import { norm } from "../math";
import { Rng } from "../rng";
import type { SaeFeature, SaeReport } from "../types";
import { tokenSymbol } from "./heads";

/** The whole option surface. Deliberately small — these are the only knobs. */
export interface SaeOptions {
  readonly nFeatures?: number;
  readonly l1?: number;
  readonly epochs?: number;
  readonly seed?: number;
  readonly lr?: number;
  readonly resampleEvery?: number;
}

export type ResolvedSaeOptions = Required<SaeOptions>;

export const DEFAULT_SAE_OPTIONS: ResolvedSaeOptions = {
  nFeatures: 64,
  l1: 0.02,
  epochs: 40,
  seed: 60602,
  lr: 0.05,
  resampleEvery: 10
};

/** A trained autoencoder: the report plus the weights that produced it. */
export interface TrainedSae extends SaeReport {
  readonly dIn: number;
  readonly nFeatures: number;
  /** dIn × nFeatures, row-major: `encoder[d * nFeatures + f]`. */
  readonly encoderMatrix: readonly number[];
  /** nFeatures. */
  readonly encoderBias: readonly number[];
  /** nFeatures × dIn, row-major: `decoder[f * dIn + d]`; unit-norm rows. */
  readonly decoderMatrix: readonly number[];
  /** dIn. */
  readonly decoderBias: readonly number[];
  readonly options: ResolvedSaeOptions;
}

/** One feature's entry in an atlas: the report plus what fired it. */
export interface SaeAtlasEntry extends SaeFeature {
  /** Top-activating positions with their decoded tokens. */
  readonly populatingTokens: readonly {
    readonly tokenIndex: number;
    readonly token: string;
    readonly activation: number;
  }[];
}

/** The four tensors an SAE pass needs, as one bundle. */
interface SaeWeights {
  readonly encoder: Float64Array;
  readonly encoderBias: Float64Array;
  readonly decoder: Float64Array;
  readonly decoderBias: Float64Array;
  readonly dIn: number;
  readonly nFeatures: number;
}

/**
 * Encode every sample into a samples × nFeatures buffer.
 *
 * Batching matters here: the naive version of this loop ran once per feature,
 * which is nFeatures times the work for the same answer.
 */
function encodeBatch(activations: readonly Float64Array[], weights: SaeWeights): Float64Array {
  const out = new Float64Array(activations.length * weights.nFeatures);
  for (let s = 0; s < activations.length; s += 1) {
    const x = activations[s];
    if (!x) continue;
    for (let f = 0; f < weights.nFeatures; f += 1) {
      let z = weights.encoderBias[f] ?? 0;
      for (let d = 0; d < weights.dIn; d += 1) z += (weights.encoder[d * weights.nFeatures + f] ?? 0) * (x[d] ?? 0);
      out[s * weights.nFeatures + f] = z > 0 ? z : 0;
    }
  }
  return out;
}

/** Decode every sample back into the activation space. */
function decodeBatch(latent: Float64Array, count: number, weights: SaeWeights): Float64Array {
  const out = new Float64Array(count * weights.dIn);
  for (let s = 0; s < count; s += 1) {
    for (let d = 0; d < weights.dIn; d += 1) {
      let value = weights.decoderBias[d] ?? 0;
      for (let f = 0; f < weights.nFeatures; f += 1) {
        value += (weights.decoder[f * weights.dIn + d] ?? 0) * (latent[s * weights.nFeatures + f] ?? 0);
      }
      out[s * weights.dIn + d] = value;
    }
  }
  return out;
}

/** Mean squared error and L1 mass over the whole dataset. */
function losses(
  activations: readonly Float64Array[],
  latent: Float64Array,
  reconstruction: Float64Array,
  weights: SaeWeights
): { mse: number; l1Mass: number } {
  let mse = 0;
  let l1Mass = 0;
  for (let s = 0; s < activations.length; s += 1) {
    const x = activations[s];
    if (!x) continue;
    for (let f = 0; f < weights.nFeatures; f += 1) l1Mass += latent[s * weights.nFeatures + f] ?? 0;
    for (let d = 0; d < weights.dIn; d += 1) {
      const error = (reconstruction[s * weights.dIn + d] ?? 0) - (x[d] ?? 0);
      mse += error * error;
    }
  }
  return { mse: mse / activations.length, l1Mass: l1Mass / activations.length };
}

/**
 * Train an L1-penalised autoencoder.
 *
 * The loss is `mean over samples of ||x - x̂||²` plus `l1 · mean over samples of
 * Σ|a|`, minimised by plain full-batch gradient descent. The decoder rows are
 * re-normalised to unit length after every epoch — without that the decoder
 * simply inflates to buy a lower reconstruction term for free, and the L1
 * penalty stops biting.
 */
export function trainSae(
  activations: readonly Float64Array[],
  options: SaeOptions = {}
): TrainedSae {
  const opts: ResolvedSaeOptions = { ...DEFAULT_SAE_OPTIONS, ...options };
  const samples = activations.length;
  if (samples === 0) throw new RangeError("trainSae: no activations");
  const dIn = activations[0]?.length ?? 0;
  if (dIn === 0) throw new RangeError("trainSae: zero-dimensional activations");
  for (let s = 0; s < samples; s += 1) {
    if ((activations[s]?.length ?? 0) !== dIn) throw new RangeError(`trainSae: sample ${s} has a different dimension`);
  }
  if (!(opts.nFeatures > 0)) throw new RangeError("trainSae: nFeatures must be positive");
  if (!(opts.epochs > 0)) throw new RangeError("trainSae: epochs must be positive");
  const nFeatures = Math.floor(opts.nFeatures);
  const rng = new Rng(opts.seed);

  // ---- initialisation ----------------------------------------------------
  const enc = new Float64Array(dIn * nFeatures);
  for (let i = 0; i < enc.length; i += 1) enc[i] = rng.symmetric(1 / Math.sqrt(dIn));
  const encBias = new Float64Array(nFeatures);
  const dec = new Float64Array(nFeatures * dIn);
  for (let f = 0; f < nFeatures; f += 1) {
    let scale = 0;
    for (let d = 0; d < dIn; d += 1) {
      const value = rng.normal(0, 1);
      dec[f * dIn + d] = value;
      scale += value * value;
    }
    const length = Math.sqrt(scale) || 1;
    for (let d = 0; d < dIn; d += 1) dec[f * dIn + d] = (dec[f * dIn + d] ?? 0) / length;
  }
  // Start the decoder bias at the data mean so the autoencoder begins from
  // "predict the average activation", which is the best zero-order guess.
  const decBias = new Float64Array(dIn);
  for (let s = 0; s < samples; s += 1) {
    for (let d = 0; d < dIn; d += 1) {
      decBias[d] = (decBias[d] ?? 0) + (activations[s]?.[d] ?? 0) / samples;
    }
  }

  const weights: SaeWeights = { encoder: enc, encoderBias: encBias, decoder: dec, decoderBias: decBias, dIn, nFeatures };
  const gradDec = new Float64Array(nFeatures * dIn);
  const gradDecBias = new Float64Array(dIn);
  const gradEnc = new Float64Array(dIn * nFeatures);
  const gradEncBias = new Float64Array(nFeatures);
  const gradLatent = new Float64Array(nFeatures);
  const lossCurve: number[] = [];

  for (let epoch = 0; epoch < opts.epochs; epoch += 1) {
    gradDec.fill(0);
    gradDecBias.fill(0);
    gradEnc.fill(0);
    gradEncBias.fill(0);
    const latent = encodeBatch(activations, weights);

    for (let s = 0; s < samples; s += 1) {
      const x = activations[s];
      if (!x) continue;
      const error = new Float64Array(dIn);
      for (let d = 0; d < dIn; d += 1) {
        let value = decBias[d] ?? 0;
        for (let f = 0; f < nFeatures; f += 1) value += (dec[f * dIn + d] ?? 0) * (latent[s * nFeatures + f] ?? 0);
        error[d] = value - (x[d] ?? 0);
        gradDecBias[d] = (gradDecBias[d] ?? 0) + 2 * (error[d] ?? 0);
      }
      for (let f = 0; f < nFeatures; f += 1) {
        const a = latent[s * nFeatures + f] ?? 0;
        if (a === 0) continue;
        let dLatent = 0;
        for (let d = 0; d < dIn; d += 1) {
          const twice = 2 * (error[d] ?? 0);
          dLatent += (dec[f * dIn + d] ?? 0) * twice;
          gradDec[f * dIn + d] = (gradDec[f * dIn + d] ?? 0) + a * twice;
        }
        // The L1 penalty only ever pushes on the encoder path.
        gradLatent[f] = dLatent + opts.l1;
        gradEncBias[f] = (gradEncBias[f] ?? 0) + (gradLatent[f] ?? 0);
        for (let d = 0; d < dIn; d += 1) {
          gradEnc[d * nFeatures + f] = (gradEnc[d * nFeatures + f] ?? 0) + (gradLatent[f] ?? 0) * (x[d] ?? 0);
        }
      }
    }

    for (let i = 0; i < enc.length; i += 1) enc[i] = (enc[i] ?? 0) - opts.lr * ((gradEnc[i] ?? 0) / samples);
    for (let f = 0; f < nFeatures; f += 1) {
      encBias[f] = (encBias[f] ?? 0) - opts.lr * ((gradEncBias[f] ?? 0) / samples);
    }
    for (let i = 0; i < dec.length; i += 1) dec[i] = (dec[i] ?? 0) - opts.lr * ((gradDec[i] ?? 0) / samples);
    for (let d = 0; d < dIn; d += 1) {
      decBias[d] = (decBias[d] ?? 0) - opts.lr * ((gradDecBias[d] ?? 0) / samples);
    }

    for (let f = 0; f < nFeatures; f += 1) {
      let scale = 0;
      for (let d = 0; d < dIn; d += 1) scale += (dec[f * dIn + d] ?? 0) ** 2;
      const length = Math.sqrt(scale);
      if (length > 0) {
        for (let d = 0; d < dIn; d += 1) dec[f * dIn + d] = (dec[f * dIn + d] ?? 0) / length;
      }
    }

    const reported = losses(activations, latent, decodeBatch(latent, samples, weights), weights);
    lossCurve.push(reported.mse + opts.l1 * reported.l1Mass);

    // ---- dead-feature resampling -----------------------------------------
    if (opts.resampleEvery > 0 && (epoch + 1) % opts.resampleEvery === 0) {
      const dead: number[] = [];
      for (let f = 0; f < nFeatures; f += 1) {
        let fired = false;
        for (let s = 0; s < samples && !fired; s += 1) {
          if ((latent[s * nFeatures + f] ?? 0) > 0) fired = true;
        }
        if (!fired) dead.push(f);
      }
      if (dead.length > 0 && dead.length < nFeatures) {
        let encoderScale = 0;
        for (let i = 0; i < enc.length; i += 1) encoderScale += (enc[i] ?? 0) ** 2;
        const magnitude = Math.sqrt(encoderScale / Math.max(1, enc.length));
        for (const f of dead) {
          // Reseed from a real sample's residual: the direction the model is
          // currently failing to explain, which is exactly where a dead
          // feature should be pointing.
          const x = activations[rng.range(samples)];
          if (!x) continue;
          const column = new Float64Array(dIn);
          for (let d = 0; d < dIn; d += 1) column[d] = (x[d] ?? 0) - (decBias[d] ?? 0);
          const length = norm(column);
          if (length <= 0) continue;
          for (let d = 0; d < dIn; d += 1) {
            const unit = (column[d] ?? 0) / length;
            dec[f * dIn + d] = unit;
            enc[d * nFeatures + f] = unit * magnitude;
          }
          encBias[f] = 0;
        }
      }
    }
  }

  const latent = encodeBatch(activations, weights);
  const features = describeFeatures(activations, latent, dec, dIn, nFeatures);
  const reported = losses(activations, latent, decodeBatch(latent, samples, weights), weights);

  let l0 = 0;
  for (const feature of features) l0 += feature.firingRate;

  return {
    features,
    l0: l0 * samples,
    explainedVariance: varianceExplained(activations, weights),
    finalLoss: reported.mse + opts.l1 * reported.l1Mass,
    lossCurve,
    dIn,
    nFeatures,
    encoderMatrix: Array.from(enc),
    encoderBias: Array.from(encBias),
    decoderMatrix: Array.from(dec),
    decoderBias: Array.from(decBias),
    options: opts
  };
}

/** Per-feature statistics over the training data. */
function describeFeatures(
  activations: readonly Float64Array[],
  latent: Float64Array,
  dec: Float64Array,
  dIn: number,
  nFeatures: number
): SaeFeature[] {
  const out: SaeFeature[] = [];
  const count = activations.length;
  for (let f = 0; f < nFeatures; f += 1) {
    let max = 0;
    let sum = 0;
    let fired = 0;
    for (let s = 0; s < count; s += 1) {
      const value = latent[s * nFeatures + f] ?? 0;
      if (value > max) max = value;
      sum += value;
      if (value > 0) fired += 1;
    }
    const decoder: number[] = [];
    for (let d = 0; d < dIn; d += 1) decoder.push(dec[f * dIn + d] ?? 0);
    out.push({
      index: f,
      decoder,
      maxActivation: max,
      meanActivation: count === 0 ? 0 : sum / count,
      firingRate: count === 0 ? 0 : fired / count,
      dead: fired === 0,
      activatingTokens: []
    });
  }
  return out;
}

/** 1 - SSE/SST over the whole dataset, clamped to [0, 1]. */
function varianceExplained(activations: readonly Float64Array[], weights: SaeWeights): number {
  const latent = encodeBatch(activations, weights);
  const reconstruction = decodeBatch(latent, activations.length, weights);
  const means = new Float64Array(weights.dIn);
  for (let d = 0; d < weights.dIn; d += 1) {
    means[d] = activations.reduce((s, x) => s + (x?.[d] ?? 0), 0) / Math.max(1, activations.length);
  }
  let sse = 0;
  let sst = 0;
  for (let s = 0; s < activations.length; s += 1) {
    const x = activations[s];
    if (!x) continue;
    for (let d = 0; d < weights.dIn; d += 1) {
      const error = (reconstruction[s * weights.dIn + d] ?? 0) - (x[d] ?? 0);
      sse += error * error;
      const centred = (x[d] ?? 0) - (means[d] ?? 0);
      sst += centred * centred;
    }
  }
  if (sst <= 0) return sse <= 1e-12 ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - sse / sst));
}

/** Encode one activation vector: the latent activations after the ReLU. */
export function encodeSae(sae: TrainedSae, activation: readonly number[]): Float64Array {
  if (activation.length !== sae.dIn) {
    throw new RangeError(`encodeSae: activation has length ${activation.length}, expected ${sae.dIn}`);
  }
  const out = new Float64Array(sae.nFeatures);
  for (let f = 0; f < sae.nFeatures; f += 1) {
    let z = sae.encoderBias[f] ?? 0;
    for (let d = 0; d < sae.dIn; d += 1) z += (sae.encoderMatrix[d * sae.nFeatures + f] ?? 0) * (activation[d] ?? 0);
    out[f] = z > 0 ? z : 0;
  }
  return out;
}

/** Decode one latent vector back into the activation space. */
export function decodeSae(sae: TrainedSae, latent: readonly number[]): Float64Array {
  if (latent.length !== sae.nFeatures) {
    throw new RangeError(`decodeSae: latent has length ${latent.length}, expected ${sae.nFeatures}`);
  }
  const out = new Float64Array(sae.dIn);
  for (let d = 0; d < sae.dIn; d += 1) {
    let value = sae.decoderBias[d] ?? 0;
    for (let f = 0; f < sae.nFeatures; f += 1) {
      value += (sae.decoderMatrix[f * sae.dIn + d] ?? 0) * (latent[f] ?? 0);
    }
    out[d] = value;
  }
  return out;
}

/**
 * For each feature, the positions that fired it, decoded.
 *
 * `activatingTokens` is the deduplicated set (a UI wants "this feature means a,
 * b, c"); `populatingTokens` keeps every top position with its weight so you
 * can tell a feature that fired hard twice from one that fired weakly ten
 * times.
 */
export function featureAtlas(
  sae: TrainedSae,
  activations: readonly Float64Array[],
  tokens: readonly number[],
  topN = 5
): SaeAtlasEntry[] {
  if (activations.length !== tokens.length) {
    throw new RangeError("featureAtlas: one token per activation is required");
  }
  const n = Math.max(0, Math.floor(topN));
  const latent = encodeBatch(activations, bundle(sae));
  return sae.features.map((feature) => {
    const pairs: { tokenIndex: number; activation: number }[] = [];
    for (let s = 0; s < activations.length; s += 1) {
      pairs.push({ tokenIndex: s, activation: latent[s * sae.nFeatures + feature.index] ?? 0 });
    }
    pairs.sort((a, b) => b.activation - a.activation || a.tokenIndex - b.tokenIndex);
    const populating = pairs.slice(0, n).map((pair) => ({
      tokenIndex: pair.tokenIndex,
      token: tokenSymbol(tokens[pair.tokenIndex] ?? -1),
      activation: pair.activation
    }));
    const unique = [...new Set(populating.filter((p) => p.activation > 0).map((p) => p.token))];
    return { ...feature, activatingTokens: unique, populatingTokens: populating };
  });
}

/** Fraction of features that never fire — a dead-feature audit. */
export function deadFeatureRate(sae: SaeReport | readonly SaeFeature[]): number {
  const features = "features" in sae ? sae.features : sae;
  if (features.length === 0) return 0;
  let dead = 0;
  for (const feature of features) if (feature.dead) dead += 1;
  return dead / features.length;
}

/** Fraction of a dataset's variance the autoencoder reproduces. */
export function explainedVariance(activations: readonly Float64Array[], sae: TrainedSae): number {
  return varianceExplained(activations, bundle(sae));
}

/** L0: the mean number of active features per sample. */
export function sparsityL0(sae: TrainedSae, activations: readonly Float64Array[]): number {
  if (activations.length === 0) return 0;
  const latent = encodeBatch(activations, bundle(sae));
  let total = 0;
  for (const value of latent) if (value > 0) total += 1;
  return total / activations.length;
}

/** The SAE's weights as the bundle the internal loops want. */
function bundle(sae: TrainedSae): SaeWeights {
  return {
    encoder: Float64Array.from(sae.encoderMatrix),
    encoderBias: Float64Array.from(sae.encoderBias),
    decoder: Float64Array.from(sae.decoderMatrix),
    decoderBias: Float64Array.from(sae.decoderBias),
    dIn: sae.dIn,
    nFeatures: sae.nFeatures
  };
}
