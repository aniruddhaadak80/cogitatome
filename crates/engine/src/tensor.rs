//! Tensor-lite numerics: flat buffers, shape helpers, and the handful of ops a
//! tiny transformer actually needs.
//!
//! There is no `ndarray` here on purpose. The matrices this crate touches are
//! small (a toy transformer with `d_model <= 256` and `seq <= 128`), so a flat
//! row-major buffer plus explicit dimensions beats a dependency, keeps the
//! wasm bundle tiny, and makes every shape contract visible at the call site.
//!
//! Everything in this module is generic over [`Float`], so the same `f64` code
//! serves `f32` (useful when shipping activations over the wire as `f32`).

use crate::error::{Error, Result};
use std::fmt;

/// Element type accepted by the tensor-lite operators.
///
/// Implemented for `f64` and `f32`. The supertrait bounds are the only
/// arithmetic the operators need, so the trait stays tiny and `std`-only.
pub trait Float:
    Copy
    + std::ops::Add<Output = Self>
    + std::ops::Sub<Output = Self>
    + std::ops::Mul<Output = Self>
    + std::ops::Div<Output = Self>
    + PartialOrd
    + fmt::Debug
    + 'static
{
    /// Additive identity.
    const ZERO: Self;
    /// Multiplicative identity.
    const ONE: Self;

    /// Widens the value to `f64` (lossless for both impls).
    fn to_f64(self) -> f64;
    /// Narrows an `f64` (lossless for `f64`, rounding for `f32`).
    fn from_f64(value: f64) -> Self;
    /// `e^x`.
    fn exp(self) -> Self;
    /// `sqrt(x)`.
    fn sqrt(self) -> Self;
    /// `tanh(x)`.
    fn tanh(self) -> Self;
    /// Maximum, ignoring `NaN` in the `x`-position.
    fn fmax(self, other: Self) -> Self;
    /// Absolute value.
    fn fabs(self) -> Self;
}

impl Float for f64 {
    const ZERO: Self = 0.0;
    const ONE: Self = 1.0;

    fn to_f64(self) -> f64 {
        self
    }

    fn from_f64(value: f64) -> Self {
        value
    }

    fn exp(self) -> Self {
        f64::exp(self)
    }

    fn sqrt(self) -> Self {
        f64::sqrt(self)
    }

    fn tanh(self) -> Self {
        f64::tanh(self)
    }

    fn fmax(self, other: Self) -> Self {
        f64::max(self, other)
    }

    fn fabs(self) -> Self {
        f64::abs(self)
    }
}

impl Float for f32 {
    const ZERO: Self = 0.0;
    const ONE: Self = 1.0;

    fn to_f64(self) -> f64 {
        f64::from(self)
    }

    fn from_f64(value: f64) -> Self {
        value as f32
    }

    fn exp(self) -> Self {
        f32::exp(self)
    }

    fn sqrt(self) -> Self {
        f32::sqrt(self)
    }

    fn tanh(self) -> Self {
        f32::tanh(self)
    }

    fn fmax(self, other: Self) -> Self {
        f32::max(self, other)
    }

    fn fabs(self) -> Self {
        f32::abs(self)
    }
}

/// A flat, row-major, shape-carrying buffer.
///
/// `Tensor` is deliberately not an autograd tensor: it exists so callers can
/// hand around `(data, shape)` without re-deriving `len == shape.product()`
/// at every step, and so indexing mistakes become [`Error`]s instead of
/// out-of-bounds panics.
///
/// ```
/// use cogitatome_engine::tensor::Tensor;
///
/// let t = Tensor::zeros(&[2, 3]);
/// assert_eq!(t.shape(), &[2, 3]);
/// assert_eq!(t.len(), 6);
/// assert!(!t.is_empty());
/// assert_eq!(t.get(&[1, 2]), Ok(0.0));
/// ```
#[derive(Debug, Clone, PartialEq)]
pub struct Tensor<T: Float = f64> {
    data: Vec<T>,
    shape: Vec<usize>,
}

impl<T: Float> Tensor<T> {
    /// Allocates a zero-filled tensor of `shape`.
    pub fn zeros(shape: &[usize]) -> Self {
        let len = shape.iter().product();
        Self {
            data: vec![T::ZERO; len],
            shape: shape.to_vec(),
        }
    }

    /// Builds a tensor from flat row-major `data` and `shape`.
    ///
    /// # Errors
    ///
    /// [`Error::Length`] when `data.len()` does not equal `shape.product()`.
    pub fn from_flat(shape: &[usize], data: Vec<T>) -> Result<Self> {
        let expected = shape.iter().product();
        if data.len() != expected {
            return Err(Error::Length {
                what: "Tensor::from_flat data",
                expected,
                actual: data.len(),
            });
        }
        Ok(Self {
            data,
            shape: shape.to_vec(),
        })
    }

    /// The tensor's shape.
    pub fn shape(&self) -> &[usize] {
        &self.shape
    }

    /// Number of elements.
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Whether the tensor holds no elements.
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Borrows the underlying buffer.
    pub fn as_slice(&self) -> &[T] {
        &self.data
    }

    /// Mutably borrows the underlying buffer.
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.data
    }

    /// Consumes the tensor and returns the flat buffer.
    pub fn into_vec(self) -> Vec<T> {
        self.data
    }

    /// Reads `index` (one entry per dimension).
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `index` has the wrong rank or addresses a
    /// position outside the buffer.
    pub fn get(&self, index: &[usize]) -> Result<T> {
        let flat = self.flat_index(index)?;
        Ok(self.data[flat])
    }

    /// Writes `value` at `index` (one entry per dimension).
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `index` has the wrong rank or addresses a
    /// position outside the buffer.
    pub fn set(&mut self, index: &[usize], value: T) -> Result<()> {
        let flat = self.flat_index(index)?;
        self.data[flat] = value;
        Ok(())
    }

    /// Reinterprets the same buffer under a new `shape`.
    ///
    /// # Errors
    ///
    /// [`Error::Length`] when the element count changes.
    pub fn reshape(self, shape: &[usize]) -> Result<Self> {
        let expected = shape.iter().product();
        if self.data.len() != expected {
            return Err(Error::Length {
                what: "Tensor::reshape data",
                expected,
                actual: self.data.len(),
            });
        }
        Ok(Self {
            data: self.data,
            shape: shape.to_vec(),
        })
    }

    /// Borrows row `row` of a 2-D view with `cols` columns.
    ///
    /// # Errors
    ///
    /// [`Error::Shape`] when the buffer is not a whole number of rows.
    pub fn row(&self, row: usize, cols: usize) -> Result<&[T]> {
        if cols == 0 || !self.data.len().is_multiple_of(cols) {
            return Err(Error::Shape("row length must divide the buffer evenly"));
        }
        let rows = self.data.len() / cols;
        self.data
            .get(row * cols..(row + 1) * cols)
            .ok_or(Error::OutOfRange {
                what: "Tensor::row",
                index: row,
                len: rows,
            })
    }

    /// Sum of every element.
    pub fn sum(&self) -> T {
        self.data.iter().copied().fold(T::ZERO, |a, b| a + b)
    }

    /// Mean of every element (`0.0` when empty).
    pub fn mean(&self) -> T {
        if self.data.is_empty() {
            return T::ZERO;
        }
        self.sum() / T::from_f64(self.data.len() as f64)
    }

    /// Largest element (`None` when empty).
    pub fn max(&self) -> Option<T> {
        self.data.iter().copied().reduce(T::fmax)
    }

    /// Index of the largest element, lowest index wins ties (`None` when empty).
    pub fn argmax(&self) -> Option<usize> {
        self.data
            .iter()
            .enumerate()
            .reduce(|best, next| if next.1 > best.1 { next } else { best })
            .map(|(index, _)| index)
    }

    /// Euclidean length of the buffer.
    pub fn l2_norm(&self) -> T {
        let mut acc = T::ZERO;
        for value in &self.data {
            acc = acc + *value * *value;
        }
        acc.sqrt()
    }

    /// Applies `f` element-wise, keeping the shape.
    pub fn map<F>(&self, f: F) -> Self
    where
        F: Fn(T) -> T,
    {
        Self {
            data: self.data.iter().map(|&value| f(value)).collect(),
            shape: self.shape.clone(),
        }
    }

    fn flat_index(&self, index: &[usize]) -> Result<usize> {
        if index.len() != self.shape.len() {
            return Err(Error::Shape("index rank does not match tensor rank"));
        }
        let mut flat = 0usize;
        for (dim, (&coord, &size)) in index.iter().zip(&self.shape).enumerate() {
            if coord >= size {
                return Err(Error::OutOfRange {
                    what: "Tensor",
                    index: coord,
                    len: size,
                });
            }
            flat = flat * size + coord;
            debug_assert!(dim < index.len());
        }
        Ok(flat)
    }
}

/// `out += alpha * x` (the BLAS `axpy`).
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length.
pub fn axpy<T: Float>(out: &mut [T], alpha: T, x: &[T]) -> Result<()> {
    if out.len() != x.len() {
        return Err(Error::Mismatch {
            left: "out",
            left_len: out.len(),
            right: "x",
            right_len: x.len(),
        });
    }
    for (o, &xv) in out.iter_mut().zip(x) {
        *o = *o + alpha * xv;
    }
    Ok(())
}

/// `a + b`, element-wise.
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length.
pub fn add<T: Float>(a: &[T], b: &[T]) -> Result<Vec<T>> {
    if a.len() != b.len() {
        return Err(Error::Mismatch {
            left: "a",
            left_len: a.len(),
            right: "b",
            right_len: b.len(),
        });
    }
    Ok(a.iter().zip(b).map(|(&x, &y)| x + y).collect())
}

/// Adds `bias` to every row of a row-major `(rows, bias.len())` buffer.
pub fn add_bias_rows<T: Float>(buf: &mut [T], bias: &[T]) {
    let cols = bias.len();
    if cols == 0 {
        return;
    }
    for row in buf.chunks_mut(cols) {
        for (value, b) in row.iter_mut().zip(bias) {
            *value = *value + *b;
        }
    }
}

/// General matrix multiply, `C = A · B`, for row-major `A: m×k` and `B: k×n`.
///
/// The loop order is `i-k-j` so that both inner streams walk memory
/// sequentially and the accumulator for `C[i][j]` stays in a register across
/// the whole `k` sweep — the classic cache-friendly (and auto-vectorisable)
/// order.
///
/// # Errors
///
/// [`Error::Length`] when the buffers do not match `m·k` and `k·n`.
///
/// # Example
///
/// ```
/// use cogitatome_engine::tensor::matmul;
///
/// // [1 2] · [3 4; 5 6] = [13 16]
/// let a = [1.0, 2.0];
/// let b = [3.0, 4.0, 5.0, 6.0];
/// let c = matmul(&a, &b, 1, 2, 2).expect("shapes agree");
/// assert_eq!(c, vec![13.0, 16.0]);
/// ```
pub fn matmul<T: Float>(a: &[T], b: &[T], m: usize, k: usize, n: usize) -> Result<Vec<T>> {
    let expected_a = m.checked_mul(k).ok_or(Error::Shape("m * k overflows"))?;
    let expected_b = k.checked_mul(n).ok_or(Error::Shape("k * n overflows"))?;
    let expected_c = m.checked_mul(n).ok_or(Error::Shape("m * n overflows"))?;
    if a.len() != expected_a {
        return Err(Error::Length {
            what: "matmul a",
            expected: expected_a,
            actual: a.len(),
        });
    }
    if b.len() != expected_b {
        return Err(Error::Length {
            what: "matmul b",
            expected: expected_b,
            actual: b.len(),
        });
    }
    let mut c = vec![T::ZERO; expected_c];
    if m == 0 || n == 0 {
        return Ok(c);
    }
    if k == 0 {
        return Ok(c);
    }
    for (i, a_row) in a.chunks_exact(k).enumerate() {
        let c_row = &mut c[i * n..(i + 1) * n];
        for (kk, &a_ik) in a_row.iter().enumerate() {
            let b_row = &b[kk * n..(kk + 1) * n];
            for (c_ij, &b_kj) in c_row.iter_mut().zip(b_row) {
                *c_ij = *c_ij + a_ik * b_kj;
            }
        }
    }
    Ok(c)
}

/// Softmax over a single slice, numerically stabilised by subtracting the max.
///
/// A non-finite maximum (every entry `-inf`, or `inf`/`NaN` in the slice) makes
/// the shifted exponentials undefined, so the result is left as all zeros
/// instead of `NaN`.
///
/// # Example
///
/// ```
/// use cogitatome_engine::tensor::softmax;
///
/// let p = softmax(&[1000.0_f64, 1000.0]);
/// assert!((p[0] - 0.5).abs() < 1e-12);
///
/// // All -inf: no NaN, just nothing.
/// assert_eq!(
///     softmax(&[f64::NEG_INFINITY, f64::NEG_INFINITY]),
///     vec![0.0, 0.0]
/// );
/// ```
pub fn softmax<T: Float>(x: &[T]) -> Vec<T> {
    let mut out = x.to_vec();
    softmax_inplace(&mut out);
    out
}

/// In-place softmax; the exponentials overwrite `x`.
///
/// See [`softmax`] for the behaviour on non-finite input.
pub fn softmax_inplace<T: Float>(x: &mut [T]) {
    softmax_normalize(x);
}

/// Shared core of [`softmax`] and [`softmax_inplace`].
fn softmax_normalize<T: Float>(values: &mut [T]) {
    let Some(max) = values.iter().copied().reduce(T::fmax) else {
        return;
    };
    if !max.to_f64().is_finite() {
        // (-inf) - (-inf) is NaN, so there is no exponential to take: emit
        // zeros rather than poisoning the whole row with NaN.
        for value in values.iter_mut() {
            *value = T::ZERO;
        }
        return;
    }
    let mut sum = T::ZERO;
    for value in values.iter_mut() {
        *value = (*value - max).exp();
        sum = sum + *value;
    }
    if sum == T::ZERO {
        return;
    }
    for value in values.iter_mut() {
        *value = *value / sum;
    }
}

/// Layer normalisation over the last axis of a single row.
///
/// `y = gamma ⊙ (x - mean) / sqrt(var + eps) + beta`, with `var` the biased
/// (population) variance. `eps` is taken as `f64` so the same call site works
/// for `f32` buffers.
///
/// # Errors
///
/// [`Error::Empty`] when `x` is empty, [`Error::Mismatch`] when `gamma` or
/// `beta` do not match the length of `x`.
pub fn layernorm<T: Float>(x: &[T], gamma: &[T], beta: &[T], eps: f64) -> Result<Vec<T>> {
    if x.is_empty() {
        return Err(Error::Empty("layernorm input"));
    }
    if gamma.len() != x.len() {
        return Err(Error::Mismatch {
            left: "x",
            left_len: x.len(),
            right: "gamma",
            right_len: gamma.len(),
        });
    }
    if beta.len() != x.len() {
        return Err(Error::Mismatch {
            left: "x",
            left_len: x.len(),
            right: "beta",
            right_len: beta.len(),
        });
    }
    let n = T::from_f64(x.len() as f64);
    let mean = x.iter().copied().fold(T::ZERO, |a, b| a + b) / n;
    let var = x
        .iter()
        .map(|&value| {
            let d = value - mean;
            d * d
        })
        .fold(T::ZERO, |a, b| a + b)
        / n;
    let inv_std = T::ONE / (var + T::from_f64(eps)).sqrt();
    Ok(x.iter()
        .zip(gamma)
        .zip(beta)
        .map(|((&value, &g), &b)| (value - mean) * inv_std * g + b)
        .collect())
}

/// Layer normalisation over the last axis of every row of a `(rows, cols)`
/// buffer.
///
/// The transformer calls this once per sublayer on a whole `seq × d_model`
/// activation block, so the batch form is the one that actually gets used;
/// [`layernorm`] is the single-row building block.
///
/// # Errors
///
/// [`Error::Shape`] when `rows` is zero or does not divide the buffer evenly,
/// [`Error::Mismatch`] when `gamma`/`beta` do not match the row width.
pub fn layernorm_rows<T: Float>(
    x: &[T],
    gamma: &[T],
    beta: &[T],
    eps: f64,
    rows: usize,
) -> Result<Vec<T>> {
    if rows == 0 {
        return Err(Error::Shape("layernorm_rows needs at least one row"));
    }
    if x.len() % rows != 0 {
        return Err(Error::Shape(
            "buffer length must divide evenly into the requested rows",
        ));
    }
    let cols = x.len() / rows;
    let mut out = Vec::with_capacity(x.len());
    for row in x.chunks(cols) {
        out.extend(layernorm(row, gamma, beta, eps)?);
    }
    Ok(out)
}

/// Gaussian-error linear unit, element-wise.
///
/// Uses the **tanh approximation** `0.5·x·(1 + tanh(√(2/π)·(x + 0.044715·x³)))`
/// — the formulation GPT-2 shipped with, whose worst-case deviation from the
/// exact erf-based GELU is about `1e-3` and which avoids an `erf`
/// implementation entirely. See [`gelu_exact`] for the erf-based variant.
///
/// # Example
///
/// ```
/// use cogitatome_engine::tensor::gelu;
///
/// let out = gelu(&[0.0_f64, 1.0]);
/// assert_eq!(out[0], 0.0);
/// assert!((out[1] - 0.841_192).abs() < 1e-5);
/// ```
pub fn gelu<T: Float>(x: &[T]) -> Vec<T> {
    x.iter().map(|&value| gelu_scalar(value)).collect()
}

/// Scalar form of [`gelu`].
pub fn gelu_scalar<T: Float>(x: T) -> T {
    const C: f64 = 0.797_884_560_802_865_4; // sqrt(2 / pi)
    const A: f64 = 0.044_715;
    let v = x.to_f64();
    let inner = T::from_f64(C * (v + A * v * v * v));
    T::from_f64(0.5 * v * (1.0 + inner.tanh().to_f64()))
}

/// Exact GELU `x · Φ(x)` using a high-accuracy erf approximation.
///
/// Provided for reference and for cross-checking [`gelu`]; the engine itself
/// uses the tanh form because it is cheaper and differentiable in closed form.
pub fn gelu_exact(x: f64) -> f64 {
    0.5 * x * (1.0 + erf(x / std::f64::consts::SQRT_2))
}

/// Abramowitz & Stegun 7.1.26 error function (`|ε| < 1.5e-7`).
fn erf(x: f64) -> f64 {
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let t = 1.0 / (1.0 + 0.327_591_1 * x.abs());
    let y = 1.0
        - (((((1.061_405_429 * t - 1.453_152_027) * t) + 1.421_413_741) * t - 0.284_496_736) * t
            + 0.254_829_592)
            * t
            * (-x * x).exp();
    sign * y
}

/// Sigmoid linear unit (SiLU / swish), element-wise: `x · σ(x)`.
///
/// # Example
///
/// ```
/// use cogitatome_engine::tensor::silu;
///
/// let out = silu(&[0.0]);
/// assert_eq!(out[0], 0.0);
/// ```
pub fn silu<T: Float>(x: &[T]) -> Vec<T> {
    x.iter().map(|&value| silu_scalar(value)).collect()
}

/// Scalar form of [`silu`].
pub fn silu_scalar<T: Float>(x: T) -> T {
    x / (T::ONE + (T::ZERO - x).exp())
}

/// Multi-head scaled dot-product attention.
///
/// All three operands share the head-major layout
/// `x[h * seq * d_head + t * d_head + i]`, i.e. the heads are the outermost
/// dimension and each head owns a contiguous `seq × d_head` block. With
/// `causal = true` query `t` may only attend to keys `0..=t`, which is what a
/// decoder-only language model uses.
///
/// Returns the concatenated per-head outputs in the same layout as the inputs.
///
/// # Errors
///
/// [`Error::Length`] when the three operands disagree in length or do not
/// divide evenly into `heads × seq`, [`Error::Shape`] when `heads` or `seq` is
/// zero, [`Error::Empty`] for empty operands.
///
/// # Example
///
/// Two tokens, one head, `d_head = 2`. With the causal mask, query 0 may only
/// read key 0, so it returns `v[0]` verbatim; query 1 reads both keys and,
/// because both queries look identical, averages them.
///
/// ```
/// use cogitatome_engine::tensor::attention;
///
/// let q = [1.0, 0.0, 1.0, 0.0];
/// let k = q.to_vec();
/// let v = [3.0, 4.0, 5.0, 6.0];
/// let out = attention(&q, &k, &v, 2, 1, true).expect("shapes agree");
/// assert_eq!(out, vec![3.0, 4.0, 4.0, 5.0]);
///
/// // Drop the mask and both queries average both keys.
/// let full = attention(&q, &k, &v, 2, 1, false).expect("shapes agree");
/// assert_eq!(full, vec![4.0, 5.0, 4.0, 5.0]);
/// ```
pub fn attention<T: Float>(
    q: &[T],
    k: &[T],
    v: &[T],
    seq: usize,
    heads: usize,
    causal: bool,
) -> Result<Vec<T>> {
    let d_head = attention_dims(q, k, seq, heads)?;
    if v.len() != q.len() {
        return Err(Error::Length {
            what: "attention v",
            expected: q.len(),
            actual: v.len(),
        });
    }
    let patterns = attention_patterns(q, k, seq, heads, causal)?;
    let mut out = vec![T::ZERO; q.len()];
    for (h, pattern) in patterns.iter().enumerate() {
        let base = h * seq * d_head;
        for i in 0..seq {
            let weights = &pattern[i * seq..(i + 1) * seq];
            let out_row = &mut out[base + i * d_head..base + (i + 1) * d_head];
            for (j, &weight) in weights.iter().enumerate() {
                if weight == T::ZERO {
                    // Strictly below the diagonal for causal masking: skipping
                    // the multiply keeps the output free of 0 * inf = NaN.
                    continue;
                }
                let v_row = &v[base + j * d_head..base + (j + 1) * d_head];
                for (o, &v_value) in out_row.iter_mut().zip(v_row) {
                    *o = *o + weight * v_value;
                }
            }
        }
    }
    Ok(out)
}

/// The attention patterns [`attention`] would use, one `seq × seq` row-major
/// matrix per head.
///
/// This is the function the observatory visualises: row `i` of head `h`'s
/// matrix is the distribution over keys that query `i` attends to, so each row
/// sums to 1 (up to floating point).
///
/// # Errors
///
/// Same validation as [`attention`].
pub fn attention_patterns<T: Float>(
    q: &[T],
    k: &[T],
    seq: usize,
    heads: usize,
    causal: bool,
) -> Result<Vec<Vec<T>>> {
    let d_head = attention_dims(q, k, seq, heads)?;
    let scale = T::from_f64(1.0 / (d_head as f64).sqrt());
    let mut patterns = Vec::with_capacity(heads);
    for h in 0..heads {
        let base = h * seq * d_head;
        let q_block = &q[base..base + seq * d_head];
        let k_block = &k[base..base + seq * d_head];
        let mut pattern = vec![T::ZERO; seq * seq];
        for i in 0..seq {
            let q_row = &q_block[i * d_head..(i + 1) * d_head];
            let row = &mut pattern[i * seq..(i + 1) * seq];
            let limit = if causal { i + 1 } else { seq };
            for (j, score) in row.iter_mut().enumerate().take(limit) {
                let k_row = &k_block[j * d_head..(j + 1) * d_head];
                let mut dot = T::ZERO;
                for (&q_value, &k_value) in q_row.iter().zip(k_row) {
                    dot = dot + q_value * k_value;
                }
                *score = dot * scale;
            }
            // Only the visible prefix is normalised: the trailing entries stay
            // at zero rather than being fed through the softmax as if they
            // were scores. That is the causal mask, applied by construction.
            softmax_inplace(&mut row[..limit]);
        }
        patterns.push(pattern);
    }
    Ok(patterns)
}

/// Validates the shared attention layout and returns `d_head`.
fn attention_dims<T: Float>(q: &[T], k: &[T], seq: usize, heads: usize) -> Result<usize> {
    if heads == 0 || seq == 0 {
        return Err(Error::Shape("attention needs heads > 0 and seq > 0"));
    }
    if q.is_empty() || k.is_empty() {
        return Err(Error::Empty("attention operands"));
    }
    if q.len() != k.len() {
        return Err(Error::Length {
            what: "attention k",
            expected: q.len(),
            actual: k.len(),
        });
    }
    let block = seq * heads;
    if !q.len().is_multiple_of(block) {
        return Err(Error::Shape(
            "operand length must divide into heads * seq * d_head",
        ));
    }
    Ok(q.len() / block)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-12
    }

    #[test]
    fn matmul_multiplies_matrices() {
        // (2x3) · (3x2) = (2x2)
        let a = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let b = [7.0, 8.0, 9.0, 10.0, 11.0, 12.0];
        let c = matmul(&a, &b, 2, 3, 2).expect("shapes agree");
        assert_eq!(c, vec![58.0, 64.0, 139.0, 154.0]);

        // The 1x2 · 2x1 case in the doc example.
        assert_eq!(
            matmul(&[1.0, 2.0], &[3.0, 4.0, 5.0, 6.0], 1, 2, 2).expect("shapes agree"),
            vec![13.0, 16.0]
        );
    }

    #[test]
    fn matmul_rejects_mismatched_lengths() {
        let err = matmul(&[1.0, 2.0, 3.0], &[1.0, 2.0], 1, 3, 1).expect_err("should fail");
        assert!(matches!(
            err,
            Error::Length {
                what: "matmul b",
                ..
            }
        ));
        let err = matmul(&[1.0, 2.0], &[1.0, 2.0, 3.0, 4.0], 2, 2, 2).expect_err("should fail");
        assert!(matches!(
            err,
            Error::Length {
                what: "matmul a",
                ..
            }
        ));
    }

    #[test]
    fn matmul_handles_degenerate_dimensions() {
        assert!(matmul::<f64>(&[], &[1.0], 0, 1, 1).expect("m=0").is_empty());
        assert_eq!(
            matmul::<f64>(&[], &[], 1, 0, 2).expect("k=0"),
            vec![0.0, 0.0]
        );
    }

    #[test]
    fn softmax_sums_to_one() {
        for input in [
            vec![0.0, 0.0, 0.0],
            vec![3.1, -2.4, 0.0, 12.0],
            vec![-1.0; 7],
            vec![0.001, 1000.0, -1000.0],
        ] {
            let out = softmax(&input);
            let sum: f64 = out.iter().sum();
            assert!(approx(sum, 1.0), "softmax({input:?}) summed to {sum}");
            // Entries may underflow to 0 for hugely negative logits, but they
            // must never be negative or non-finite.
            assert!(out.iter().all(|&v| v >= 0.0 && v.is_finite()), "{out:?}");
            // The largest input takes (almost) all of the mass.
            let argmax = |values: &[f64]| {
                values
                    .iter()
                    .enumerate()
                    .max_by(|(_, a), (_, b)| a.partial_cmp(b).expect("finite values"))
                    .map(|(i, _)| i)
                    .expect("non-empty slice")
            };
            assert_eq!(argmax(&out), argmax(&input));
        }
    }

    #[test]
    fn softmax_is_shift_invariant() {
        let a = softmax(&[1.0, 2.0, 3.0]);
        let b = softmax(&[1001.0, 1002.0, 1003.0]);
        for (x, y) in a.iter().zip(&b) {
            assert!(approx(*x, *y), "{x} != {y}");
        }
        // In-place and allocating agree.
        let mut buf = [1.0, 2.0, 3.0];
        softmax_inplace(&mut buf);
        for (x, y) in buf.iter().zip(&a) {
            assert!(approx(*x, *y));
        }
    }

    #[test]
    fn softmax_edge_cases() {
        assert!(softmax::<f64>(&[]).is_empty());
        let mut all_negative_inf = [f64::NEG_INFINITY; 3];
        softmax_inplace(&mut all_negative_inf);
        assert_eq!(all_negative_inf, [0.0, 0.0, 0.0]);
    }

    #[test]
    fn layernorm_has_zero_mean_and_unit_variance() {
        let x = [1.0_f64, 2.0, 3.0, 4.0];
        let gamma = [1.0_f64; 4];
        let beta = [0.0_f64; 4];
        let y = layernorm(&x, &gamma, &beta, 0.0).expect("consistent lengths");
        assert!(
            y.iter().sum::<f64>().abs() < 1e-12,
            "mean is not zero: {y:?}"
        );
        let var = y.iter().map(|v| v * v).sum::<f64>() / 4.0;
        assert!(approx(var, 1.0), "variance is {var}, expected 1");
        // gamma/beta are applied: beta shifts the mean, gamma scales the std.
        let gamma = [2.0_f64; 4];
        let beta = [0.5_f64; 4];
        let y = layernorm(&x, &gamma, &beta, 0.0).expect("consistent lengths");
        assert!(
            approx(y.iter().sum::<f64>() / 4.0, 0.5),
            "beta did not shift the mean"
        );
        let var = y.iter().map(|v| (v - 0.5).powi(2)).sum::<f64>() / 4.0;
        assert!(approx(var, 4.0), "gamma did not scale the variance: {var}");
    }

    #[test]
    fn layernorm_validates_lengths() {
        assert!(matches!(
            layernorm::<f64>(&[], &[], &[], 0.0),
            Err(Error::Empty("layernorm input"))
        ));
        assert!(layernorm(&[1.0], &[1.0, 2.0], &[0.0, 0.0], 0.0).is_err());
        assert!(layernorm(&[1.0, 2.0], &[1.0, 2.0], &[0.0, 0.0], 0.0).is_ok());
    }

    #[test]
    fn gelu_and_silu_match_known_values() {
        // The tanh approximation GPT-2 shipped with.
        assert!(approx(gelu_scalar(0.0_f64), 0.0));
        assert!(approx(gelu(&[0.0_f64])[0], 0.0));
        assert!((gelu_scalar(1.0_f64) - 0.841_192).abs() < 1e-5);
        // GELU is negative for negative inputs (unlike ReLU) and positive for
        // large positive inputs.
        assert!(gelu_scalar(-3.0_f64) < 0.0);
        assert!(gelu_scalar(3.0_f64) > 0.99);

        // The exact erf variant must agree to ~1e-3 on a range of inputs.
        for x in [-3.0_f64, -1.0, -0.1, 0.0, 0.1, 1.0, 3.0] {
            assert!(
                (gelu_scalar(x) - gelu_exact(x)).abs() < 1e-3,
                "gelu({x}) = {} vs exact {}",
                gelu_scalar(x),
                gelu_exact(x)
            );
        }

        // SiLU(x) = x * sigmoid(x); odd around the origin up to a sign.
        for x in [-2.0_f64, -0.5, 0.5, 2.0] {
            assert!(approx(silu_scalar(x), x / (1.0 + (-x).exp())));
        }
        assert!(approx(silu_scalar(0.0_f64), 0.0));
        let silu_at_2 = silu(&[2.0_f64])[0];
        assert!(silu_at_2 > 1.5 && silu_at_2 < 2.0, "silu(2) = {silu_at_2}");
    }

    #[test]
    fn attention_is_causal() {
        // One head, d_head = 1: every query/key pair scores identically, so the
        // softmax is uniform over whatever the mask allows.
        let q = [1.0, 1.0, 1.0];
        let v = [10.0, 20.0, 30.0];
        let patterns = attention_patterns(&q, &q, 3, 1, true).expect("shapes agree");
        assert_eq!(patterns.len(), 1);
        assert_eq!(
            patterns[0],
            vec![
                1.0,
                0.0,
                0.0,
                0.5,
                0.5,
                0.0,
                1.0 / 3.0,
                1.0 / 3.0,
                1.0 / 3.0
            ]
        );

        let out = attention(&q, &q, &v, 3, 1, true).expect("shapes agree");
        assert!(approx(out[0], 10.0));
        assert!(approx(out[1], 15.0));
        assert!(approx(out[2], 20.0));

        // Without the mask every row attends to all three keys.
        let full = attention_patterns(&q, &q, 3, 1, false).expect("shapes agree");
        assert_eq!(full[0], vec![1.0 / 3.0; 9]);
        let out = attention(&q, &q, &v, 3, 1, false).expect("shapes agree");
        assert_eq!(out, vec![20.0, 20.0, 20.0]);
    }

    #[test]
    fn attention_pattern_rows_sum_to_one() {
        // seq = 4, heads = 2, d_head = 1.
        let q = [0.2_f64, -1.0, 3.0, 0.5, -0.7, 1.1, 2.2, 0.0];
        let k = [1.0_f64, 0.0, -1.0, 2.0, 0.5, 0.5, -2.0, 1.5];
        let patterns = attention_patterns(&q, &k, 4, 2, true).expect("shapes agree");
        assert_eq!(patterns.len(), 2);
        for pattern in &patterns {
            assert_eq!(pattern.len(), 16);
            for row in pattern.chunks(4) {
                let sum: f64 = row.iter().sum();
                assert!(approx(sum, 1.0), "row {row:?} summed to {sum}");
            }
        }
        // Head 0, query 0 may only see key 0.
        assert_eq!(patterns[0][0..4], [1.0, 0.0, 0.0, 0.0]);
        // A causal row never puts mass on a future key.
        for pattern in &patterns {
            for (query, row) in pattern.chunks(4).enumerate() {
                for (key, &weight) in row.iter().enumerate() {
                    if key > query {
                        assert_eq!(weight, 0.0, "causal mask leaked at {query} -> {key}");
                    }
                }
            }
        }
    }

    #[test]
    fn attention_validates_shapes() {
        assert!(attention::<f64>(&[1.0], &[1.0], &[1.0], 2, 1, true).is_err());
        assert!(attention::<f64>(&[1.0, 2.0], &[1.0, 2.0], &[1.0], 1, 1, true).is_err());
        assert!(attention::<f64>(&[], &[], &[], 1, 1, true).is_err());
        assert!(attention::<f64>(&[1.0; 4], &[1.0; 4], &[1.0; 4], 2, 0, true).is_err());
    }

    #[test]
    fn float32_counterpart_agrees_with_f64() {
        // The same computation in f32 must agree with the f64 path to within
        // f32 precision, which is what the "provide an f32 counterpart" ask is
        // about: one implementation, two precisions.
        let a = [1.0_f64, 2.0, 3.0, 4.0];
        let b = [5.0_f64, 6.0, 7.0, 8.0];
        let c64 = matmul(&a, &b, 2, 2, 2).expect("shapes agree");
        let a32: Vec<f32> = vec![1.0, 2.0, 3.0, 4.0];
        let b32: Vec<f32> = vec![5.0, 6.0, 7.0, 8.0];
        let c32 = matmul(&a32, &b32, 2, 2, 2).expect("shapes agree");
        for (x, y) in c64.iter().zip(&c32) {
            assert!((x - f64::from(*y)).abs() < 1e-5);
        }

        let p64 = softmax(&a);
        let p32 = softmax(&a32);
        for (x, y) in p64.iter().zip(&p32) {
            assert!((x - f64::from(*y)).abs() < 1e-6);
        }

        let n64 = layernorm(&a, &[1.0_f64; 4], &[0.0_f64; 4], 1e-5).expect("ok");
        let n32 = layernorm(&a32, &[1.0f32; 4], &[0.0f32; 4], 1e-5).expect("ok");
        for (x, y) in n64.iter().zip(&n32) {
            assert!((x - f64::from(*y)).abs() < 1e-6);
        }

        // d_head = 1, seq = 2, one head, in f32.
        let out32 = attention(&[1.0f32, 1.0], &[1.0f32, 1.0], &[3.0f32, 4.0], 2, 1, true)
            .expect("shapes agree");
        // Query 0 sees only itself; query 1 sees both equally.
        assert_eq!(out32, vec![3.0_f32, 3.5]);
    }

    #[test]
    fn tensor_carries_its_shape() {
        let mut t = Tensor::<f64>::zeros(&[2, 3]);
        assert_eq!(t.shape(), &[2, 3]);
        assert_eq!(t.len(), 6);
        assert!(!t.is_empty());
        assert_eq!(t.get(&[1, 2]), Ok(0.0));

        t.set(&[0, 1], 7.0).expect("in range");
        assert_eq!(t.get(&[0, 1]), Ok(7.0));
        assert!(t.get(&[2, 0]).is_err(), "out of range must error");
        assert!(t.get(&[0]).is_err(), "wrong rank must error");

        let full = Tensor::from_flat(&[2, 3], vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).expect("ok");
        assert_eq!(full.row(1, 3).expect("ok"), &[4.0, 5.0, 6.0]);
        assert!(full.row(2, 3).is_err());
        assert_eq!(full.sum(), 21.0);
        assert!(approx(full.mean(), 3.5));
        assert_eq!(full.max(), Some(6.0));
        assert_eq!(full.argmax(), Some(5));
        assert!((full.l2_norm() - 91.0_f64.sqrt()).abs() < 1e-12);
        assert_eq!(
            full.map(|v| v * 2.0).into_vec(),
            (1..=6).map(|i| 2.0 * i as f64).collect::<Vec<_>>()
        );
        assert!(Tensor::<f64>::from_flat(&[2, 3], vec![1.0]).is_err());
        assert_eq!(
            full.clone().reshape(&[3, 2]).expect("same count").shape(),
            &[3, 2]
        );
        assert!(full.reshape(&[4, 4]).is_err());
    }

    #[test]
    fn axpy_and_add_check_lengths() {
        let mut out = [1.0, 2.0];
        axpy(&mut out, 2.0, &[3.0, 4.0]).expect("ok");
        assert_eq!(out, [7.0, 10.0]);
        assert!(axpy(&mut out, 2.0, &[1.0]).is_err());
        assert_eq!(add(&[1.0, 2.0], &[3.0, 4.0]).expect("ok"), vec![4.0, 6.0]);
        assert!(add(&[1.0], &[1.0, 2.0]).is_err());

        let mut buf = vec![0.0; 4];
        add_bias_rows(&mut buf, &[1.0, 2.0]);
        assert_eq!(buf, vec![1.0, 2.0, 1.0, 2.0]);
    }
}
