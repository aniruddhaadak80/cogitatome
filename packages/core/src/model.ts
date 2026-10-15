/**
 * The cogitatome transformer.
 *
 * A real decoder-only transformer with multi-head causal attention, GELU MLPs,
 * pre-norm residuals and an unembedding — small enough to run in a server
 * component and to *read*. Two models are available and they are not the same
 * thing, so the distinction is explicit throughout:
 *
 *  - `randomModel(config)`   — seeded random weights. Every analysis tool runs
 *                              on it, but nothing is known about its internals.
 *  - `constructInductionModel()` — a two-layer attention-only transformer whose
 *                              weights are set analytically so that it
 *                              implements a genuine induction circuit: a
 *                              previous-token head followed by a K-composed
 *                              induction head. Its internals are *ground truth*,
 *                              which is what makes it possible to test whether
 *                              the analysis tools recover the circuit they are
 *                              supposed to.
 *
 * Determinism: weights come from `Rng(seed)`, forward passes are pure functions,
 * and no path in this file touches `Math.random`, the clock or the network.
 */
import {
  DEFAULT_CONFIG,
  type ForwardTrace,
  type LayerRecord,
  type ModelConfig
} from "./types";
import { Rng } from "./rng";
import {
  dot,
  filled,
  layerNorm,
  project,
  zeros,
  type Matrix,
  type NumberVector,
  type Vector
} from "./math";

export interface LayerWeights {
  readonly ln1Gamma: Vector;
  readonly ln1Beta: Vector;
  readonly wq: Matrix; // dModel × (nHeads * dHead)
  readonly wk: Matrix;
  readonly wv: Matrix;
  readonly wo: Matrix; // (nHeads * dHead) × dModel
  readonly ln2Gamma: Vector;
  readonly ln2Beta: Vector;
  readonly w1: Matrix; // dModel × dMlp
  readonly b1: Vector;
  readonly w2: Matrix; // dMlp × dModel
  readonly b2: Vector;
  /** Per-head relative-distance bias slope and curvature, ALiBi-style. */
  readonly headBiasCurvature: readonly number[];
  readonly headBiasRecency: readonly number[];
  /** Per-head output gain — how loudly the head writes to the residual. */
  readonly headGain: readonly number[];
  /** Per-head QK score multiplier — a head-specific temperature. */
  readonly headScoreScale: readonly number[];
}

export interface ModelWeights {
  readonly config: ModelConfig;
  readonly embedding: Matrix; // vocab × dModel
  readonly position: Matrix; // maxLen × dModel
  readonly layers: readonly LayerWeights[];
  readonly lnFGamma: Vector;
  readonly lnFBeta: Vector;
  readonly unembed: Matrix; // dModel × vocab
  readonly unembedBias: Vector;
  readonly useLayerNorm: boolean;
  readonly useMlp: boolean;
  readonly label: string;
  readonly notes: readonly string[];
}

const D_HEAD = (config: ModelConfig): number => config.dModel / config.nHeads;

function initMatrix(rows: number, cols: number, rng: Rng, scale: number): Matrix {
  const out = new Float64Array(rows * cols);
  for (let i = 0; i < out.length; i += 1) out[i] = rng.symmetric(scale);
  return out;
}

/**
 * Seed random weights. Attention is scaled by 1/sqrt(dModel) as usual, MLPs by
 * 1/sqrt(dMlp), so the random model's residual stream does not explode.
 */
export function randomWeights(config: ModelConfig = DEFAULT_CONFIG): ModelWeights {
  const rng = new Rng(config.seed);
  const dHead = D_HEAD(config);
  const layers: LayerWeights[] = [];
  for (let l = 0; l < config.nLayers; l += 1) {
    layers.push({
      ln1Gamma: filled(config.dModel, 1),
      ln1Beta: zeros(config.dModel),
      wq: initMatrix(config.dModel, config.nHeads * dHead, rng, 1 / Math.sqrt(config.dModel)),
      wk: initMatrix(config.dModel, config.nHeads * dHead, rng, 1 / Math.sqrt(config.dModel)),
      wv: initMatrix(config.dModel, config.nHeads * dHead, rng, 1 / Math.sqrt(config.dModel)),
      wo: initMatrix(config.nHeads * dHead, config.dModel, rng, 1 / Math.sqrt(config.nHeads * dHead)),
      ln2Gamma: filled(config.dModel, 1),
      ln2Beta: zeros(config.dModel),
      w1: initMatrix(config.dModel, config.dMlp, rng, 1 / Math.sqrt(config.dModel)),
      b1: zeros(config.dMlp),
      w2: initMatrix(config.dMlp, config.dModel, rng, 1 / Math.sqrt(config.dMlp)),
      b2: zeros(config.dModel),
      headBiasCurvature: layers0(config.nHeads),
      headBiasRecency: layers0(config.nHeads),
      headGain: layers0(config.nHeads).map(() => 1),
      headScoreScale: layers0(config.nHeads).map(() => 1)
    });
  }
  return {
    config,
    embedding: initMatrix(config.vocabSize, config.dModel, rng, 0.6),
    position: initMatrix(config.maxLen, config.dModel, rng, 0.25),
    layers,
    lnFGamma: filled(config.dModel, 1),
    lnFBeta: zeros(config.dModel),
    unembed: initMatrix(config.dModel, config.vocabSize, rng, 0.6),
    unembedBias: zeros(config.vocabSize),
    useLayerNorm: true,
    useMlp: true,
    label: "random-init toy transformer",
    notes: [
      "Weights are seeded; every run is identical.",
      "Nothing is known about this model's internals — it is the control condition."
    ]
  };
}

function layers0(n: number): number[] {
  return new Array<number>(n).fill(0);
}

// ---------------------------------------------------------------------------
// The constructed induction model
// ---------------------------------------------------------------------------

export const INDUCTION_CONFIG: ModelConfig = {
  vocabSize: 16,
  dModel: 64,
  nLayers: 2,
  nHeads: 2,
  dMlp: 32,
  maxLen: 32,
  seed: 60602
};

/**
 * Subspace layout of the constructed model's residual stream. Every writer gets
 * its own lane, so no head can corrupt another's signal:
 *
 *   dims  0..15  token     — the current token's identity code (one-hot)
 *   dims 16..31  shifted   — head L0.H0 writes "the previous token" here
 *   dims 32..47  position  — sinusoidal codes, read only by L0.H0
 *   dims 48..63  noise     — head L1.H1's diffuse output, deliberately decoupled
 */
export const SUBSPACE = {
  tokenStart: 0,
  tokenEnd: 16,
  shiftedStart: 16,
  shiftedEnd: 32,
  positionStart: 32,
  positionEnd: 48,
  noiseStart: 48,
  noiseEnd: 64
} as const;

const OMEGA: readonly number[] = [
  Math.PI / 2,
  Math.PI / 3,
  Math.PI / 5,
  Math.PI / 7,
  Math.PI / 11,
  Math.PI / 13,
  Math.PI / 17,
  Math.PI / 19
];

function positionCode(index: number): Vector {
  const out = zeros(SUBSPACE.positionEnd - SUBSPACE.positionStart);
  for (let k = 0; k < OMEGA.length; k += 1) {
    const w = OMEGA[k] ?? 0;
    out[k * 2] = Math.cos(w * index);
    out[k * 2 + 1] = Math.sin(w * index);
  }
  return out;
}

/**
 * The relative-distance bias of head 0 in layer 0.
 *
 * score(i, j) -= curvature * (i - j - 1)^2  for the closest token back, plus a
 * recency term. This is the same family of mechanism as ALiBi and T5's relative
 * biases; here it is set by hand so the bias is exactly a quadratic centred one
 * token back, which makes the head a sharp previous-token head.
 */
export function prevTokenBias(distance: number, curvature: number, recency: number): number {
  const d = distance - 1;
  return -curvature * d * d - recency * Math.max(0, distance);
}

/**
 * Build the two-layer attention-only transformer that implements induction.
 *
 * Ground truth, written down explicitly:
 *   L0.H0 (previous-token head) attends to j = i-1 and copies the token code at
 *        j into the *shifted* subspace, so the key at position j now carries the
 *        identity of token j-1.
 *   L1.H0 (induction head) matches "my current token" against "the token before
 *        you" (K-composition) and copies the token *after* the match forward.
 *
 * Layer norm is disabled so the algebra is exact; MLPs are zeroed so the circuit
 * has no distractors.
 */
export function constructInductionModel(config: ModelConfig = INDUCTION_CONFIG): ModelWeights {
  const make = (rows: number, cols: number, fill: (r: number, c: number) => number): Matrix => {
    const m = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) m[r * cols + c] = fill(r, c);
    return m;
  };

  const weight = (config2: ModelConfig): number => config2.nHeads * D_HEAD(config2);

  // ---- layer 0 ------------------------------------------------------------
  const lane = (from: number, to: number) => (r: number, c: number): number =>
    r >= from && r < to && c >= SUBSPACE.shiftedStart + (r - from) && c < SUBSPACE.shiftedStart + (r - from) + 1
      ? 1
      : 0;

  const laneToNoise = (r: number, c: number): number =>
    c >= SUBSPACE.noiseStart && c < SUBSPACE.noiseEnd && c - SUBSPACE.noiseStart === r ? 1 : 0;

  const layer0: LayerWeights = {
    ln1Gamma: filled(config.dModel, 1),
    ln1Beta: zeros(config.dModel),
    // Query: rotate the position code, so q_i · p_j = Σ sin(ω (j - i)).
    wq: make(config.dModel, weight(config), (r, c) =>
      r >= SUBSPACE.positionStart && r < SUBSPACE.positionEnd ? rotate90column(r - SUBSPACE.positionStart, c) : 0
    ),
    // Key: the raw position code.
    wk: make(config.dModel, weight(config), (r, c) =>
      r >= SUBSPACE.positionStart && r < SUBSPACE.positionEnd ? spanOne(r - SUBSPACE.positionStart, c) : 0
    ),
    // Value: the token code (one-hot subspace 0).
    wv: make(config.dModel, weight(config), (r, c) => (r < SUBSPACE.tokenEnd ? spanOne(r, c) : 0)),
    // Output: head 0 writes into the shifted subspace; head 1 is held out.
    wo: make(weight(config), config.dModel, (r, c) =>
      r < D_HEAD(config) ? lane(0, D_HEAD(config))(r, c) : 0
    ),
    ln2Gamma: filled(config.dModel, 1),
    ln2Beta: zeros(config.dModel),
    w1: zeros(config.dModel * config.dMlp),
    b1: zeros(config.dMlp),
    w2: zeros(config.dMlp * config.dModel),
    b2: zeros(config.dModel),
    headBiasCurvature: [3, 0],
    headBiasRecency: [0, 0],
    headGain: [1, 0],
    headScoreScale: [1, 1]
  };

  // ---- layer 1 ------------------------------------------------------------
  const layer1: LayerWeights = {
    ln1Gamma: filled(config.dModel, 1),
    ln1Beta: zeros(config.dModel),
    // Query: select the token subspace of the current residual.
    wq: make(config.dModel, weight(config), (r, c) => (r < SUBSPACE.tokenEnd ? spanOne(r, c) : 0)),
    // Key: select the shifted subspace, i.e. the token before j.
    wk: make(config.dModel, weight(config), (r, c) =>
      r >= SUBSPACE.shiftedStart && r < SUBSPACE.shiftedEnd ? spanOne(r - SUBSPACE.shiftedStart, c) : 0
    ),
    // Value: select the token subspace at the source position.
    wv: make(config.dModel, weight(config), (r, c) => (r < SUBSPACE.tokenEnd ? spanOne(r, c) : 0)),
    // Output: head 0 writes back into the token subspace; head 1 is a diffuse
    // head routed into the noise lane so it cannot perturb the answer.
    wo: make(weight(config), config.dModel, (r, c) =>
      r < D_HEAD(config)
        ? r < SUBSPACE.tokenEnd && r === c
          ? 1
          : 0
        : laneToNoise(r - D_HEAD(config), c)
    ),
    ln2Gamma: filled(config.dModel, 1),
    ln2Beta: zeros(config.dModel),
    w1: zeros(config.dModel * config.dMlp),
    b1: zeros(config.dMlp),
    w2: zeros(config.dMlp * config.dModel),
    b2: zeros(config.dModel),
    headBiasCurvature: [0, 0],
    // A gentle recency bias so the *most recent* occurrence wins.
    headBiasRecency: [0.5, 0],
    headGain: [6, 0.15],
    headScoreScale: [3, 1]
  };

  const embedding = make(config.vocabSize, config.dModel, (r, c) => (r === c && r < SUBSPACE.tokenEnd ? 1 : 0));
  // Small position codes, placed in their own subspace so head projections
  // never touch them.
  const position = make(config.maxLen, config.dModel, (r, c) =>
    c >= SUBSPACE.positionStart && c < SUBSPACE.positionEnd ? positionCode(r)[c - SUBSPACE.positionStart] ?? 0 : 0
  );

  const unembed = make(config.dModel, config.vocabSize, (r, c) =>
    r < SUBSPACE.tokenEnd && r === c ? 1 : 0
  );

  return {
    config,
    embedding,
    position,
    layers: [layer0, layer1],
    lnFGamma: filled(config.dModel, 1),
    lnFBeta: zeros(config.dModel),
    unembed,
    unembedBias: zeros(config.vocabSize),
    useLayerNorm: false,
    useMlp: false,
    label: "constructed induction transformer",
    notes: [
      "Two layers, attention only. Layer 0 head 0 is a previous-token head; layer 1 head 0 is a K-composed induction head.",
      "Weights are exact ground truth — the analysis tools should recover this circuit.",
      "Layer norm is off and the MLPs are zeroed so the circuit is undistracted."
    ]
  };
}

function spanOne(index: number, col: number): number {
  return index === col ? 1 : 0;
}

/**
 * The query projection of a position code: return the column that input row
 * `index` must read to realise `R90(cos, sin) = (-sin, cos)`.
 *
 * Lane 2k holds cos(ω·i) and lane 2k+1 holds sin(ω·i). The rotated query must
 * read the *other* lane of the same pair with the sign that makes
 * `R90(p_i) · p_j = Σ_k sin(ω_k (j - i))`, which is the previous-token kernel.
 */
function rotate90column(index: number, col: number): number {
  if (index % 2 === 0) return col === index + 1 ? -1 : 0;
  return col === index - 1 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Forward pass
// ---------------------------------------------------------------------------

export class CogitatomeModel {
  readonly weights: ModelWeights;
  readonly config: ModelConfig;

  constructor(weights: ModelWeights) {
    this.weights = weights;
    this.config = weights.config;
  }

  /** The residual stream before any layer, given tokens. */
  inputResidual(tokens: readonly number[]): Vector[] {
    return tokens.map((tok, i) => {
      const out = zeros(this.config.dModel);
      const embBase = tok * this.config.dModel;
      const posBase = i * this.config.dModel;
      for (let d = 0; d < this.config.dModel; d += 1) {
        out[d] = (this.weights.embedding[embBase + d] ?? 0) + (this.weights.position[posBase + d] ?? 0);
      }
      return out;
    });
  }

  /** Run a forward pass and record everything a dissect view needs. */
  forward(tokens: readonly number[]): ForwardTrace {
    const { config } = this;
    if (tokens.length === 0) throw new RangeError("forward: empty token sequence");
    if (tokens.length > config.maxLen) {
      throw new RangeError(`forward: sequence ${tokens.length} exceeds maxLen ${config.maxLen}`);
    }
    for (const t of tokens) {
      if (!Number.isInteger(t) || t < 0 || t >= config.vocabSize) {
        throw new RangeError(`forward: token ${t} outside vocab 0..${config.vocabSize - 1}`);
      }
    }

    const ids = this.inputResidual(tokens);
    const residual: Vector[] = ids.map((v) => Float64Array.from(v));
    const layers: LayerRecord[] = [];
    const seqLen = tokens.length;
    const dHead = D_HEAD(config);

    for (let l = 0; l < config.nLayers; l += 1) {
      const w = this.weights.layers[l];
      if (!w) throw new RangeError(`forward: missing layer ${l}`);

      const normed = w && this.weights.useLayerNorm
        ? residual.map((r) => layerNorm(r, w.ln1Gamma, w.ln1Beta))
        : residual;

      // ---- attention ------------------------------------------------------
      const attention: Float64Array[][] = [];
      const headOut: Vector[] = new Array(seqLen).fill(0).map(() => zeros(config.nHeads * dHead));
      const attnOut = new Array(seqLen).fill(0).map(() => zeros(config.dModel));

      for (let h = 0; h < config.nHeads; h += 1) {
        const perHead: Float64Array[] = [];
        for (let q = 0; q < seqLen; q += 1) {
          const x = normed[q] ?? zeros(config.dModel);
          const qVec = headProjection(w.wq, config.nHeads * dHead, x, h * dHead, dHead);
          const row = new Float64Array(seqLen);
          let maxRow = -Infinity;
          for (let k = 0; k <= q; k += 1) {
            const kx = normed[k] ?? zeros(config.dModel);
            const kVec = headProjection(w.wk, config.nHeads * dHead, kx, h * dHead, dHead);
            const bias = prevTokenBias(q - k, w.headBiasCurvature[h] ?? 0, w.headBiasRecency[h] ?? 0);
            const scale = w.headScoreScale[h] ?? 1;
            const scored = dot(qVec, kVec) * scale + bias;
            row[k] = scored;
            if (scored > maxRow) maxRow = scored;
          }
          let sum = 0;
          for (let k = 0; k <= q; k += 1) {
            const e = Math.exp((row[k] ?? 0) - maxRow);
            row[k] = e;
            sum += e;
          }
          for (let k = 0; k <= q; k += 1) row[k] = (row[k] ?? 0) / sum;
          perHead.push(row);
        }
        attention.push(perHead);

        // Weighted sum of values, then the out-projection that writes the
        // head's result into the residual stream.
        for (let q = 0; q < seqLen; q += 1) {
          const acc = zeros(dHead);
          for (let k = 0; k <= q; k += 1) {
            const p = perHead[q]?.[k] ?? 0;
            if (p === 0) continue;
            const kx = normed[k] ?? zeros(config.dModel);
            const vVec = headProjection(w.wv, config.nHeads * dHead, kx, h * dHead, dHead);
            for (let d = 0; d < dHead; d += 1) acc[d] = (acc[d] ?? 0) + p * (vVec[d] ?? 0);
          }
          const gain = w.headGain[h] ?? 1;
          const target = headOut[q] ?? zeros(config.nHeads * dHead);
          for (let d = 0; d < dHead; d += 1) target[h * dHead + d] = (acc[d] ?? 0) * gain;
        }
      }

      for (let q = 0; q < seqLen; q += 1) {
        const projected = project(w.wo, config.nHeads * dHead, config.dModel, headOut[q] ?? []);
        const attnRow = attnOut[q] ?? zeros(config.dModel);
        const residualRow = residual[q] ?? zeros(config.dModel);
        for (let d = 0; d < config.dModel; d += 1) {
          attnRow[d] = projected[d] ?? 0;
          residualRow[d] = (residualRow[d] ?? 0) + (attnRow[d] ?? 0);
        }
      }

      // ---- MLP ------------------------------------------------------------
      const mlpPre: Vector[] = new Array(seqLen).fill(0).map(() => zeros(config.dMlp));
      const mlpOut: Vector[] = new Array(seqLen).fill(0).map(() => zeros(config.dModel));
      if (this.weights.useMlp) {
        for (let q = 0; q < seqLen; q += 1) {
          const x = layerNorm(residual[q] ?? zeros(config.dModel), w.ln2Gamma, w.ln2Beta);
          const pre = project(w.w1, config.dModel, config.dMlp, x);
          for (let d = 0; d < config.dMlp; d += 1) pre[d] = (pre[d] ?? 0) + (w.b1[d] ?? 0);
          mlpPre[q] = pre;
          const act = new Float64Array(config.dMlp);
          for (let d = 0; d < config.dMlp; d += 1) act[d] = geluFast(pre[d] ?? 0);
          const out = project(w.w2, config.dMlp, config.dModel, act);
          for (let d = 0; d < config.dModel; d += 1) out[d] = (out[d] ?? 0) + (w.b2[d] ?? 0);
          mlpOut[q] = out;
          const mlpResidual = residual[q] ?? zeros(config.dModel);
          for (let d = 0; d < config.dModel; d += 1) {
            mlpResidual[d] = (mlpResidual[d] ?? 0) + (out[d] ?? 0);
          }
        }
      }

      layers.push({
        index: l,
        residual: residual.map((r) => Float64Array.from(r)),
        attnOut,
        mlpOut,
        attention,
        headOut,
        mlpPre
      });
    }

    const finalResidual = this.weights.useLayerNorm
      ? residual.map((r) => layerNorm(r, this.weights.lnFGamma, this.weights.lnFBeta))
      : residual.map((r) => Float64Array.from(r));

    const logits = finalResidual.map((r) => {
      const l = project(this.weights.unembed, config.dModel, config.vocabSize, r);
      for (let v = 0; v < config.vocabSize; v += 1) l[v] = (l[v] ?? 0) + (this.weights.unembedBias[v] ?? 0);
      return l;
    });

    return {
      tokens: [...tokens],
      config,
      ids,
      layers,
      logits,
      finalResidual
    };
  }

  /** Greedy next-token predictions at every position (teacher-free). */
  predict(tokens: readonly number[]): number[] {
    const trace = this.forward(tokens);
    return trace.logits.map((l) => argMaxOf(Array.from(l)));
  }

  /** Confidence (softmax of the top logit) at every position. */
  confidences(tokens: readonly number[]): number[] {
    const trace = this.forward(tokens);
    return trace.logits.map((l) => {
      const max = Math.max(...l);
      const sum = l.reduce((s, v) => s + Math.exp(v - max), 0);
      return Math.exp(max - max) / sum;
    });
  }

  /** Ablate a head (zero its output) and re-run — the core causal intervention. */
  ablateHead(tokens: readonly number[], layer: number, head: number): ForwardTrace {
    const weights = this.weights.layers.map((w, i) =>
      i === layer ? { ...w, headGain: w.headGain.map((g, h) => (h === head ? 0 : g)) } : w
    );
    const model = new CogitatomeModel({ ...this.weights, layers: weights });
    return model.forward(tokens);
  }
}

function argMaxOf(values: readonly number[]): number {
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

function geluFast(x: number): number {
  const c = Math.sqrt(2 / Math.PI);
  return 0.5 * x * (1 + Math.tanh(c * (x + 0.044715 * x * x * x)));
}

/**
 * One head's slice of a projection: out[d] = Σ_j W[j, offset + d] · x[j].
 *
 * Weights are stored row-major (dModel × nHeads*dHead) exactly like a real
 * implementation, so this is a strided column read, not a matvec.
 */
function headProjection(
  matrix: Matrix,
  cols: number,
  x: NumberVector,
  offset: number,
  width: number
): Vector {
  if (cols < offset + width) throw new RangeError("headProjection: column span out of range");
  const out = new Float64Array(width);
  for (let d = 0; d < width; d += 1) {
    let sum = 0;
    for (let j = 0; j < x.length; j += 1) {
      sum += (matrix[j * cols + offset + d] ?? 0) * (x[j] ?? 0);
    }
    out[d] = sum;
  }
  return out;
}
