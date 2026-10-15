/**
 * Dense linear algebra over plain buffers.
 *
 * The engine deliberately avoids a tensor library: every number a user sees has
 * to be traceable back to a loop they can read. Row-major flat storage, no
 * hidden broadcasting, no autograd — just the arithmetic an interpretability
 * tool needs, written so the arithmetic is inspectable.
 */
export type Vector = Float64Array;
export type Matrix = Float64Array;

/**
 * A numeric sequence the engine reads but never mutates.
 *
 * A union, because `Float64Array` and `readonly number[]` are unrelated classes.
 * Helpers that need array methods call `toArray` first (a no-op copy when the
 * input is already an array) rather than forcing every caller to convert.
 */
export type NumberVector = readonly number[] | Float64Array;

/** Sum of a sequence. Exists because `.reduce` is not callable on that union. */
export function sumOf(values: NumberVector): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Read a sequence as a plain array, copying only when it is not one already. */
export function toArray(values: NumberVector): readonly number[] {
  return Array.isArray(values) ? values : Array.from(values);
}

export function zeros(n: number): Vector {
  return new Float64Array(n);
}

export function filled(n: number, value: number): Vector {
  const out = new Float64Array(n);
  out.fill(value);
  return out;
}

export function dot(a: NumberVector, b: NumberVector): number {
  if (a.length !== b.length) throw new RangeError(`dot: length ${a.length} != ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function norm(a: NumberVector): number {
  return Math.sqrt(dot(a, a));
}

export function l2Norm(a: NumberVector): number {
  return norm(a);
}

export function cosine(a: NumberVector, b: NumberVector): number {
  const d = norm(a) * norm(b);
  if (d === 0) return 0;
  return dot(a, b) / d;
}

export function add(a: NumberVector, b: NumberVector): Vector {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

export function sub(a: NumberVector, b: NumberVector): Vector {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

export function scale(a: NumberVector, k: number): Vector {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) * k;
  return out;
}

/**
 * Row-major matrix times vector: out[r] = Σ_c matrix[r, c] · vector[c].
 *
 * The matrix is stored (rows × cols) exactly as written in the source, so this
 * is the "written down" direction.
 */
export function matVec(matrix: Matrix, rows: number, cols: number, vector: NumberVector): Vector {
  if (vector.length !== cols) {
    throw new RangeError(`matVec: vector length ${vector.length} != cols ${cols}`);
  }
  const out = new Float64Array(rows);
  for (let r = 0; r < rows; r += 1) {
    let sum = 0;
    const base = r * cols;
    for (let c = 0; c < cols; c += 1) sum += (matrix[base + c] ?? 0) * (vector[c] ?? 0);
    out[r] = sum;
  }
  return out;
}

/**
 * The transpose side of `matVec`: out[c] = Σ_r matrix[r, c] · x[r].
 *
 * Weights in `model.ts` are stored the way a real implementation stores them, so
 * the residual stream is read through this direction to produce logits, MLP
 * hidden units and per-head projections.
 */
export function project(matrix: Matrix, rows: number, cols: number, vector: NumberVector): Vector {
  if (vector.length !== rows) {
    throw new RangeError(`project: vector length ${vector.length} != rows ${rows}`);
  }
  const out = new Float64Array(cols);
  for (let r = 0; r < rows; r += 1) {
    const v = vector[r] ?? 0;
    if (v === 0) continue;
    const base = r * cols;
    for (let c = 0; c < cols; c += 1) out[c] = (out[c] ?? 0) + (matrix[base + c] ?? 0) * v;
  }
  return out;
}

/** Row-major matrix multiply: out[r, c] = Σ_k a[r, k] · b[k, c]. */
export function matMul(
  a: Matrix,
  aRows: number,
  aCols: number,
  b: Matrix,
  bRows: number,
  bCols: number
): Matrix {
  if (aCols !== bRows) throw new RangeError(`matMul: ${aCols} != ${bRows}`);
  const out = new Float64Array(aRows * bCols);
  for (let r = 0; r < aRows; r += 1) {
    for (let k = 0; k < aCols; k += 1) {
      const av = a[r * aCols + k] ?? 0;
      if (av === 0) continue;
      const bBase = k * bCols;
      const oBase = r * bCols;
      for (let c = 0; c < bCols; c += 1) out[oBase + c] = (out[oBase + c] ?? 0) + av * (b[bBase + c] ?? 0);
    }
  }
  return out;
}

/** Transpose a (rows × cols) matrix into a (cols × rows) matrix. */
export function transpose(matrix: Matrix, rows: number, cols: number): Matrix {
  const out = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out[c * rows + r] = matrix[r * cols + c] ?? 0;
  }
  return out;
}

/** Numerically stable softmax. */
export function softmax(values: NumberVector): Vector {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  const out = new Float64Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const e = Math.exp((values[i] ?? 0) - max);
    out[i] = e;
    sum += e;
  }
  if (sum === 0) {
    const uniform = 1 / Math.max(1, values.length);
    return filled(values.length, uniform);
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / sum;
  return out;
}

export function gelu(x: number): number {
  // Tanh approximation of GELU: cheap, smooth, and the usual choice in
  // interpretability code where the exact erf form buys nothing.
  const c = Math.sqrt(2 / Math.PI);
  const inner = c * (x + 0.044715 * x * x * x);
  return 0.5 * x * (1 + Math.tanh(inner));
}

export function silu(x: number): number {
  return x / (1 + Math.exp(-x));
}

/** Layer normalisation across one vector. */
export function layerNorm(
  vector: NumberVector,
  gamma: NumberVector,
  beta: NumberVector,
  eps = 1e-5
): Vector {
  const n = vector.length;
  const mean = sumOf(vector) / n;
  let variance = 0;
  for (const v of vector) variance += (v - mean) * (v - mean);
  variance /= n;
  const inv = 1 / Math.sqrt(variance + eps);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = ((vector[i] ?? 0) - mean) * inv * (gamma[i] ?? 1) + (beta[i] ?? 0);
  }
  return out;
}

export function mean(values: NumberVector): number {
  if (values.length === 0) return 0;
  return sumOf(values) / values.length;
}

export function stdDev(values: NumberVector): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let variance = 0;
  for (const v of values) variance += (v - m) * (v - m);
  return Math.sqrt(variance / values.length);
}

/** Natural-log Shannon entropy of an unnormalised score vector. */
export function entropy(probs: NumberVector): number {
  const total = sumOf(probs);
  if (total <= 0) return 0;
  let h = 0;
  for (const p of probs) {
    const q = p / total;
    if (q > 0) h -= q * Math.log(q);
  }
  return h;
}

/** Entropy normalised to [0, 1] by log(support) — comparable across shapes. */
export function normalizedEntropy(probs: NumberVector): number {
  let support = 0;
  for (const p of probs) if (p > 0) support += 1;
  if (support <= 1) return 0;
  return entropy(probs) / Math.log(support);
}

export function klDivergence(p: NumberVector, q: NumberVector): number {
  if (p.length !== q.length) throw new RangeError("klDivergence: length mismatch");
  let kl = 0;
  for (let i = 0; i < p.length; i += 1) {
    const pi = Math.max(0, p[i] ?? 0);
    if (pi === 0) continue;
    const qi = Math.max(1e-12, q[i] ?? 0);
    kl += pi * Math.log(pi / qi);
  }
  return kl;
}

export function jsDivergence(p: NumberVector, q: NumberVector): number {
  const m = Array.from({ length: p.length }, (_, i) => (Math.max(0, p[i] ?? 0) + Math.max(0, q[i] ?? 0)) / 2);
  return 0.5 * klDivergence(p, m) + 0.5 * klDivergence(q, m);
}

export interface TopKItem {
  readonly index: number;
  readonly value: number;
}

/** The k largest entries, descending by value, ties broken by index. */
export function topK(values: NumberVector, k: number): TopKItem[] {
  const items: TopKItem[] = [];
  for (let i = 0; i < values.length; i += 1) items.push({ index: i, value: values[i] ?? 0 });
  items.sort((a, b) => b.value - a.value || a.index - b.index);
  return items.slice(0, Math.max(0, k));
}

export function argMax(values: NumberVector): number {
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

/** Fraction of entries at (near) zero — the L0 measure interpretability cares about. */
export function sparsity(values: NumberVector, epsilon = 1e-8): number {
  if (values.length === 0) return 0;
  let zero = 0;
  for (const v of values) if (Math.abs(v) <= epsilon) zero += 1;
  return zero / values.length;
}

export interface ActivationStats {
  readonly mean: number;
  readonly std: number;
  readonly min: number;
  readonly max: number;
  readonly l2: number;
  readonly l0Fraction: number;
}

export function activationStats(values: NumberVector, epsilon = 1e-8): ActivationStats {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0, l2: 0, l0Fraction: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    mean: mean(values),
    std: stdDev(values),
    min,
    max,
    l2: norm(values),
    l0Fraction: sparsity(values, epsilon)
  };
}

/**
 * Superposition score: how many directions are packed into an activation space
 * relative to its dimension. The participation ratio of the singular-value
 * spectrum — 1 means each dimension carries one clean feature, higher means
 * features interfere, which is exactly the failure mode of a dense MLP.
 */
export function superpositionScore(vectors: readonly NumberVector[]): number {
  if (vectors.length < 2) return 1;
  const n = vectors[0]?.length ?? 0;
  if (n === 0) return 1;
  const rows = Math.min(vectors.length, n);
  const cov = new Float64Array(rows * rows);
  for (let i = 0; i < rows; i += 1) {
    for (let j = i; j < rows; j += 1) {
      const d = dot(vectors[i] ?? [], vectors[j] ?? []);
      cov[i * rows + j] = d;
      cov[j * rows + i] = d;
    }
  }
  const spectrum = jacobiEigenvalues(cov, rows);
  const total = sumOf(spectrum);
  if (total <= 0) return 1;
  let sq = 0;
  for (const v of spectrum) sq += v * v;
  if (sq <= 0) return 1;
  return (total * total) / sq;
}

/** Cyclic Jacobi eigenvalue solver — small matrices, high accuracy, no dependencies. */
export function jacobiEigenvalues(symmetric: Matrix, n: number): number[] {
  const a = Float64Array.from(symmetric.slice(0, n * n));
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) off += (a[i * n + j] ?? 0) ** 2;
    }
    if (off < 1e-18) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p * n + q] ?? 0;
        if (Math.abs(apq) < 1e-18) continue;
        const app = a[p * n + p] ?? 0;
        const aqq = a[q * n + q] ?? 0;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k * n + p] ?? 0;
          const akq = a[k * n + q] ?? 0;
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p * n + k] ?? 0;
          const aqk = a[q * n + k] ?? 0;
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(Math.max(0, a[i * n + i] ?? 0));
  return out.sort((x, y) => y - x);
}

/** Deterministic 32-bit checksum, used to fingerprint snapshots. */
export function checksum(values: NumberVector): string {
  let h = 2166136261;
  for (const v of values) {
    const bits = Math.round(v * 1e6);
    h ^= bits & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= (bits >> 16) & 0xffff;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
