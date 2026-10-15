//! Interpretability primitives: the measurements the observatory is built on.
//!
//! These are deliberately small, pure functions over `&[f64]` so the TypeScript
//! side can mirror them line for line (and so the UI can explain every number
//! it shows). Where a mathematical convention matters — which logarithm, which
//! KL variant, which GELU — it is stated in the doc comment, because two
//! interpretability tools disagreeing by a `log 2` is a bug report nobody
//! enjoys.

use crate::error::{Error, Result};
use crate::linalg::{cosine_similarity, eigenvalues_symmetric, l2_norm};

/// Cleans a "score slice" into a probability vector and returns its length.
///
/// Negative entries are clamped to zero, non-finite entries are dropped, and
/// the remainder is divided by its sum. This is the single normalisation rule
/// used by [`entropy`], [`kl_divergence`] and [`js_divergence`], so a slice
/// that is almost (but not exactly) a distribution — a softmax that lost a
/// little float mass — behaves sanely everywhere.
///
/// # Errors
///
/// [`Error::Empty`] when `probs` is empty and [`Error::Distribution`] when the
/// surviving mass is not finite and positive.
///
/// ```
/// use cogitatome_engine::interp::normalize;
///
/// let p = normalize(&[1.0, 1.0, 1.0]).expect("positive mass");
/// assert_eq!(p, vec![1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0]);
/// ```
pub fn normalize(probs: &[f64]) -> Result<Vec<f64>> {
    if probs.is_empty() {
        return Err(Error::Empty("distribution"));
    }
    let mut out: Vec<f64> = probs
        .iter()
        .map(|&p| if p.is_finite() && p > 0.0 { p } else { 0.0 })
        .collect();
    let total: f64 = out.iter().sum();
    if !total.is_finite() || total <= 0.0 {
        return Err(Error::Distribution("distribution"));
    }
    for value in out.iter_mut() {
        *value /= total;
    }
    Ok(out)
}

/// Shannon entropy `H(p) = -Σ pᵢ ln pᵢ`, in **nats** (natural log, base `e`).
///
/// The input is normalised first (see [`normalize`]); `0 · ln 0` is taken as 0
/// as usual. A one-hot distribution scores `0`, a uniform distribution over
/// `n` outcomes scores `ln n` (the maximum). An input with no positive mass
/// — all zeros, empty, or non-finite — scores `0.0` rather than `NaN`, so a
/// broken UI never renders a "NaN nats" badge.
///
/// ```
/// use cogitatome_engine::interp::entropy;
///
/// // Uniform over 4 outcomes is the maximum, ln(4) nats.
/// assert!((entropy(&[0.25, 0.25, 0.25, 0.25]) - 4.0_f64.ln()).abs() < 1e-12);
/// // A certain prediction is zero surprise.
/// assert_eq!(entropy(&[0.0, 1.0]), 0.0);
/// ```
pub fn entropy(probs: &[f64]) -> f64 {
    match normalize(probs) {
        Ok(p) => p
            .iter()
            .filter(|&&p| p > 0.0)
            .map(|&p| -p * p.ln())
            .sum::<f64>(),
        Err(_) => 0.0,
    }
}

/// Entropy divided by `ln n`, i.e. the same quantity on a `[0, 1]` scale,
/// clamped to that range.
///
/// Useful for progress bars and cross-vocabulary comparisons: `1.0` means
/// "maximally unsure about `n` outcomes", `0.0` means "certain".
pub fn normalized_entropy(probs: &[f64]) -> f64 {
    let n = probs.len();
    if n < 2 {
        return 0.0;
    }
    let h = entropy(probs);
    if !h.is_finite() || h <= 0.0 {
        return 0.0;
    }
    (h / (n as f64).ln()).clamp(0.0, 1.0)
}

/// Kullback–Leibler divergence `D(p ‖ q) = Σ pᵢ ln(pᵢ / qᵢ)`, in nats.
///
/// Both arguments are normalised first. The divergence is asymmetric, is `0`
/// exactly when `p == q`, and is `f64::INFINITY` when `q` puts zero mass on an
/// outcome `p` does not (the "impossible observation" case).
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length, [`Error::Empty`] or
/// [`Error::Distribution`] when either argument carries no usable mass.
///
/// ```
/// use cogitatome_engine::interp::kl_divergence;
///
/// let p = [0.25, 0.25, 0.25, 0.25];
/// let q = [0.7, 0.1, 0.1, 0.1];
/// assert!(kl_divergence(&p, &q).expect("same length") > 0.0);
/// ```
pub fn kl_divergence(p: &[f64], q: &[f64]) -> Result<f64> {
    if p.len() != q.len() {
        return Err(Error::Mismatch {
            left: "p",
            left_len: p.len(),
            right: "q",
            right_len: q.len(),
        });
    }
    let pn = normalize(p)?;
    let qn = normalize(q)?;
    Ok(kl_normalized(&pn, &qn))
}

/// Jensen–Shannon divergence `½·D(p ‖ m) + ½·D(q ‖ m)` with `m = (p + q) / 2`.
///
/// Symmetric, bounded by `ln 2`, and finite even when the supports of `p` and
/// `q` are disjoint — which makes it the safe default for "how different are
/// these two activation histograms".
///
/// # Errors
///
/// [`Error::Mismatch`] when the slices differ in length, [`Error::Empty`] or
/// [`Error::Distribution`] when either argument carries no usable mass.
pub fn js_divergence(p: &[f64], q: &[f64]) -> Result<f64> {
    if p.len() != q.len() {
        return Err(Error::Mismatch {
            left: "p",
            left_len: p.len(),
            right: "q",
            right_len: q.len(),
        });
    }
    let pn = normalize(p)?;
    let qn = normalize(q)?;
    let m: Vec<f64> = pn.iter().zip(&qn).map(|(&a, &b)| 0.5 * (a + b)).collect();
    Ok(0.5 * (kl_normalized(&pn, &m) + kl_normalized(&qn, &m)))
}

/// KL between two slices already known to be normalised, length-checked
/// distributions shared by [`kl_divergence`] and [`js_divergence`].
fn kl_normalized(p: &[f64], q: &[f64]) -> f64 {
    let mut divergence = 0.0;
    for (&pi, &qi) in p.iter().zip(q) {
        if pi <= 0.0 {
            continue;
        }
        if qi <= 0.0 {
            return f64::INFINITY;
        }
        divergence += pi * (pi / qi).ln();
    }
    divergence
}

/// The `k` largest entries of `scores`, as `(index, value)` pairs.
///
/// Works on any score slice — probabilities, logits, raw activations. Ordering
/// is descending by value; ties are broken by ascending index, so the result
/// is a total order and therefore reproducible. `k` larger than the slice
/// returns every entry, `k == 0` returns nothing.
///
/// ```
/// use cogitatome_engine::interp::top_k;
///
/// // [0.1, 0.5, 0.2, 0.5] -> indices 1 and 3 tie, so the lower index wins.
/// let top = top_k(&[0.1, 0.5, 0.2, 0.5], 3);
/// assert_eq!(top, vec![(1, 0.5), (3, 0.5), (2, 0.2)]);
/// ```
pub fn top_k(scores: &[f64], k: usize) -> Vec<(usize, f64)> {
    if k == 0 || scores.is_empty() {
        return Vec::new();
    }
    let mut order: Vec<usize> = (0..scores.len()).collect();
    // `total_cmp` gives a total order (NaN included) so the result never
    // depends on the sort implementation's treatment of incomparable values.
    order.sort_by(|&a, &b| scores[b].total_cmp(&scores[a]).then(a.cmp(&b)));
    order.truncate(k);
    order.into_iter().map(|i| (i, scores[i])).collect()
}

/// Mean Shannon entropy of the attention patterns, one number per head.
///
/// `pattern[h]` is head `h`'s flattened row-major `seq × seq` matrix (exactly
/// what [`attention_patterns`](crate::tensor::attention_patterns) returns), so
/// the score is the entropy of the *key distribution of the average query*
/// over that head. Low entropy means the head is sharp and selective ("reads
/// from one or two positions"); high entropy means it is smeared across the
/// context. A head whose rows are uniform over `t` positions scores
/// `ln t` at that row.
///
/// # Errors
///
/// [`Error::Shape`] when a head's buffer is not a perfect square (i.e. is not
/// a `seq × seq` row-major matrix).
pub fn attention_entropy_per_head(pattern: &[Vec<f64>]) -> Result<Vec<f64>> {
    let mut out = Vec::with_capacity(pattern.len());
    for rows in pattern {
        let len = rows.len();
        let seq = (len as f64).sqrt().round() as usize;
        if seq == 0 || seq * seq != len {
            return Err(Error::Shape(
                "attention pattern must be a perfect-square seq * seq matrix",
            ));
        }
        let total: f64 = rows.chunks(seq).map(entropy).sum();
        out.push(total / seq as f64);
    }
    Ok(out)
}

/// Number of entries that are exactly zero — the `L0` "norm" of a vector.
///
/// For post-ReLU / post-GELU activations this is the classic sparsity count:
/// exactly zero means "this feature did not fire at all", as opposed to
/// "fired weakly".
pub fn sparsity_l0(x: &[f64]) -> usize {
    x.iter().filter(|&&value| value == 0.0).count()
}

/// Fraction of entries that are exactly zero, in `[0, 1]`.
///
/// `1.0` for an empty slice (vacuously, nothing fired).
pub fn fraction_zero(x: &[f64]) -> f64 {
    if x.is_empty() {
        return 1.0;
    }
    sparsity_l0(x) as f64 / x.len() as f64
}

/// Summary statistics for one activation tensor.
///
/// `std` is the population (biased) standard deviation; non-finite entries
/// propagate into the statistics rather than being silently dropped, because
/// a divergence halfway through a forward pass is exactly what an
/// interpretability tool needs to show.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ActivationStats {
    /// Number of elements measured.
    pub count: usize,
    /// Arithmetic mean.
    pub mean: f64,
    /// Population standard deviation.
    pub std: f64,
    /// Smallest element (`0.0` when empty).
    pub min: f64,
    /// Largest element (`0.0` when empty).
    pub max: f64,
    /// Euclidean length.
    pub l2: f64,
    /// Fraction of exactly-zero elements; see [`fraction_zero`].
    pub l0_fraction: f64,
}

/// Computes [`ActivationStats`] for `x`.
///
/// ```
/// use cogitatome_engine::interp::activation_stats;
///
/// let stats = activation_stats(&[1.0, 2.0, 3.0, 0.0]);
/// assert_eq!(stats.mean, 1.5);
/// assert!((stats.std - std(1.0, 2.0, 3.0, 0.0)).abs() < 1e-12);
/// assert_eq!(stats.min, 0.0);
/// assert_eq!(stats.max, 3.0);
/// assert_eq!(stats.l0_fraction, 0.25);
/// # fn std(a: f64, b: f64, c: f64, d: f64) -> f64 {
/// #     let m = (a + b + c + d) / 4.0;
/// #     (((a - m).powi(2) + (b - m).powi(2) + (c - m).powi(2) + (d - m).powi(2)) / 4.0).sqrt()
/// # }
/// ```
pub fn activation_stats(x: &[f64]) -> ActivationStats {
    if x.is_empty() {
        return ActivationStats {
            count: 0,
            mean: 0.0,
            std: 0.0,
            min: 0.0,
            max: 0.0,
            l2: 0.0,
            l0_fraction: 1.0,
        };
    }
    let count = x.len();
    let mean = x.iter().sum::<f64>() / count as f64;
    let var = x.iter().map(|&value| (value - mean).powi(2)).sum::<f64>() / count as f64;
    ActivationStats {
        count,
        mean,
        std: var.sqrt(),
        min: x.iter().copied().fold(f64::INFINITY, f64::min),
        max: x.iter().copied().fold(f64::NEG_INFINITY, f64::max),
        l2: l2_norm(x),
        l0_fraction: sparsity_l0(x) as f64 / count as f64,
    }
}

/// One component's share of a logit decomposition. See [`logit_attribution`].
#[derive(Debug, Clone, PartialEq)]
pub struct Attribution {
    /// Component label, e.g. `"embed"`, `"L0.attn"`, `"L1.mlp"`.
    pub name: String,
    /// Per-position contributions, one entry per logit.
    pub values: Vec<f64>,
    /// Sum of `values`.
    pub sum: f64,
    /// Mean of `values`.
    pub mean: f64,
    /// Largest absolute per-position contribution.
    pub max_abs: f64,
    /// Fraction of the total absolute logit magnitude carried by this
    /// component; can exceed `1.0` when components cancel each other out.
    pub share: f64,
}

impl Attribution {
    fn build(name: &str, values: Vec<f64>, total_abs: f64) -> Self {
        let sum: f64 = values.iter().sum();
        let abs_sum: f64 = values.iter().map(|v| v.abs()).sum();
        Self {
            name: name.to_string(),
            mean: sum / values.len() as f64,
            max_abs: values.iter().map(|v| v.abs()).fold(0.0, f64::max),
            share: if total_abs > 0.0 {
                abs_sum / total_abs
            } else {
                0.0
            },
            values,
            sum,
        }
    }
}

/// The result of decomposing a logit vector; see [`logit_attribution`].
#[derive(Debug, Clone, PartialEq)]
pub struct AttributionReport {
    /// One entry per component, in the order supplied.
    pub components: Vec<Attribution>,
    /// `logits[i] - Σ components[i]`, i.e. whatever the named components do
    /// not explain (a layernorm's centring term, an omitted component, ...).
    pub residual: Vec<f64>,
    /// Euclidean length of `residual`.
    pub residual_norm: f64,
    /// `Σ |logitᵢ|`, the denominator every [`Attribution::share`] uses.
    pub total_abs: f64,
}

impl AttributionReport {
    /// Looks a component up by name.
    pub fn component(&self, name: &str) -> Option<&Attribution> {
        self.components.iter().find(|c| c.name == name)
    }
}

/// Decomposes a logit vector into named per-component contributions.
///
/// Every component contributes a slice of the same length as `logits`; the
/// report carries each component's per-position values, its sum/mean/max
/// magnitude, its share of the total absolute logit magnitude, and the
/// **residual** — the part of the logit vector the components do not account
/// for:
///
/// ```text
/// residualᵢ = logitsᵢ - Σ_c contribution_c[i]
/// ```
///
/// This is the arithmetic behind "the residual stream": if you feed it the
/// embedding plus each layer's attention and MLP writes, the residual is what
/// is left unexplained — a small non-zero number in a healthy circuit
/// decomposition, a large one when a component is missing.
///
/// # Errors
///
/// [`Error::Mismatch`] when a component's length differs from `logits`.
///
/// ```
/// use cogitatome_engine::interp::logit_attribution;
///
/// let logits = vec![2.0, 0.0, -1.0];
/// let embed = vec![1.0, 0.0, 0.5];
/// let attn = vec![1.0, 0.0, -1.5];
/// let report = logit_attribution(&logits, &[
///     ("embed".to_string(), embed),
///     ("L0.attn".to_string(), attn),
/// ])
/// .expect("same length");
///
/// // The two components explain the logits exactly.
/// assert!(report.residual_norm < 1e-12);
/// assert!((report.components[0].sum - 1.5).abs() < 1e-12);
/// ```
pub fn logit_attribution(
    logits: &[f64],
    contributions: &[(String, Vec<f64>)],
) -> Result<AttributionReport> {
    let total_abs: f64 = logits.iter().map(|v| v.abs()).sum();
    let mut components = Vec::with_capacity(contributions.len());
    let mut residual = logits.to_vec();
    for (name, values) in contributions {
        if values.len() != logits.len() {
            return Err(Error::ComponentLength {
                name: name.clone(),
                expected: logits.len(),
                actual: values.len(),
            });
        }
        for (r, v) in residual.iter_mut().zip(values) {
            *r -= *v;
        }
        components.push(Attribution::build(name, values.clone(), total_abs));
    }
    let residual_norm = l2_norm(&residual);
    Ok(AttributionReport {
        components,
        residual,
        residual_norm,
        total_abs,
    })
}

/// Estimates how many near-orthogonal directions a set of vectors embeds,
/// relative to the number of dimensions available: the score is
/// `directions_embedded / dimensions_available`.
///
/// ## The measure
///
/// *Superposition* is the observation that a model stores more features than
/// it has dimensions: `d`-dimensional activations carry `k > d` nearly
/// uncorrelated directions at once. `k > d` vectors in `d` dimensions must be
/// linearly dependent, so the trick is to count the *incoherence* they show:
/// how little they correlate with each other, given how many of them there
/// are.
///
/// Two standard quantities are combined:
///
/// 1. **Participation ratio** of the cosine-Gram spectrum,
///
///    ```text
///              (Σ λᵢ)²
///       PR  =   ─────────
///                Σ λᵢ²
///    ```
///
///    which counts the directions that are genuinely *independent*: `k` for
///    `k` mutually orthogonal vectors, `rank` for a rank-deficient set. This
///    is never larger than `d`, so it cannot see packing — it is the term that
///    catches redundancy (duplicated or collinear features).
///
/// 2. **Inverting the Welch bound.** For `k` unit vectors in `d` dimensions the
///    off-diagonal cosine energy obeys
///
///    ```text
///       S = Σ_{i≠j} cos²(xᵢ, xⱼ)  ≥  k (k - d) / d
///    ```
///
///    i.e. a space of `d` dimensions *cannot* hold many near-orthogonal
///    directions: the best possible packing of `k` directions in `d` dimensions
///    has exactly that much leftover correlation. Solving `S = k(k-d)/d` for
///    `k` gives
///
///    ```text
///       k_w = ( d + √(d² + 4·d·S) ) / 2
///    ```
///
///    the number of near-orthogonal directions the observed incoherence
///    implies. For a set that saturates the bound (`k_w = k`) the estimate is
///    exact: six 60°-apart directions in a plane give `k_w = 6` and a score
///    of `6 / 2 = 3`.
///
/// The estimate is clamped to the number of vectors actually supplied — you
/// cannot infer five directions from two samples — and the two terms are
/// combined with a `max`, because they catch different failure modes:
///
/// ```text
///   directions = max(PR, min(k, k_w))
///   score      = directions / d
/// ```
///
/// ## Reading it
///
/// * `≈ r / d ≤ 1` — `r` independent directions in `d` dimensions: the space
///   holds them without folding anything together.
/// * `= 1` — exactly one independent direction per dimension; the space is
///   full but not over-packed.
/// * `> 1` — **more near-orthogonal directions than the space has dimensions**,
///   i.e. actual superposition; the number is the factor by which the feature
///   count exceeds the dimensional budget.
/// * `0.0` — fewer than two usable vectors, so there is nothing to measure.
///
/// Cosine similarities (not raw dot products) are used so the score is
/// invariant to per-vector scaling: rescaling one neuron's activations must
/// not change the answer.
///
/// ```
/// use cogitatome_engine::interp::superposition_score;
///
/// // Six directions spread by the golden angle inside a 2-D space.
/// let golden = std::f64::consts::PI * (3.0 - 5.0_f64.sqrt());
/// let vectors: Vec<Vec<f64>> = (0..6)
///     .map(|i| {
///         let theta = i as f64 * golden;
///         vec![theta.cos(), theta.sin()]
///     })
///     .collect();
/// assert!(superposition_score(&vectors) > 2.0);
/// ```
pub fn superposition_score(vectors: &[Vec<f64>]) -> f64 {
    if vectors.len() < 2 {
        return 0.0;
    }
    let dims = vectors[0].len();
    if dims == 0 {
        return 0.0;
    }
    let usable: Vec<&Vec<f64>> = vectors
        .iter()
        .filter(|v| v.len() == dims && v.iter().all(|x| x.is_finite()) && l2_norm(v) > 0.0)
        .collect();
    if usable.len() < 2 {
        return 0.0;
    }
    let k = usable.len();
    let mut gram = vec![vec![0.0; k]; k];
    for i in 0..k {
        gram[i][i] = 1.0;
        for j in (i + 1)..k {
            let cos = cosine_similarity(usable[i], usable[j])
                .unwrap_or(0.0)
                .clamp(-1.0, 1.0);
            gram[i][j] = cos;
            gram[j][i] = cos;
        }
    }
    let spectrum = eigenvalues_symmetric(&gram).unwrap_or_default();
    if spectrum.is_empty() {
        return 0.0;
    }
    // Jacobi can leave a hair of negative mass on a near-zero eigenvalue; the
    // participation ratio is only meaningful over non-negative weights.
    let clamped: Vec<f64> = spectrum.iter().map(|&lambda| lambda.max(0.0)).collect();
    let sum: f64 = clamped.iter().sum();
    let sum_sq: f64 = clamped.iter().map(|&lambda| lambda * lambda).sum();
    if !sum_sq.is_finite() || sum_sq <= 0.0 {
        return 0.0;
    }

    // Term 1: directions that are genuinely independent (never above `d`).
    let participation_ratio = (sum * sum / sum_sq).min(dims as f64);

    // Term 2: off-diagonal cosine energy, and the Welch bound inverted.
    // The Gram is symmetric, so the upper triangle carries half of the energy
    // the bound is stated over.
    let off_diagonal = 2.0
        * gram
            .iter()
            .enumerate()
            .map(|(i, row)| row[i + 1..].iter().map(|&c| c * c).sum::<f64>())
            .sum::<f64>();
    let welch_inverse =
        (dims as f64 + ((dims * dims) as f64 + 4.0 * dims as f64 * off_diagonal).sqrt()) / 2.0;
    let welch_estimate = welch_inverse.min(k as f64);

    ((participation_ratio.max(welch_estimate)) / dims as f64).clamp(0.0, k as f64 / dims as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-12
    }

    /// Unit vectors spread by the golden angle: a deterministic way to pack
    /// near-orthogonal directions into a low-dimensional space.
    fn golden_vectors(count: usize) -> Vec<Vec<f64>> {
        let golden = std::f64::consts::PI * (3.0 - 5.0_f64.sqrt());
        (0..count)
            .map(|i| {
                let theta = i as f64 * golden;
                vec![theta.cos(), theta.sin()]
            })
            .collect()
    }

    #[test]
    fn entropy_of_a_uniform_distribution_is_ln_n() {
        for n in [2usize, 3, 4, 10, 100] {
            let uniform = vec![1.0 / n as f64; n];
            let h = entropy(&uniform);
            assert!(
                (h - (n as f64).ln()).abs() < 1e-12,
                "H(uniform_{n}) = {h}, expected {}",
                (n as f64).ln()
            );
            assert!((normalized_entropy(&uniform) - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn entropy_of_a_certain_event_is_zero() {
        assert!(approx(entropy(&[0.0, 1.0]), 0.0));
        assert!(approx(entropy(&[1.0]), 0.0));
        assert!(approx(normalized_entropy(&[0.0, 1.0]), 0.0));
        // Less-than-one-hot stays strictly between the extremes.
        let mixed = [0.5, 0.5];
        assert!(entropy(&mixed) > 0.0 && entropy(&mixed) < std::f64::consts::LN_2 + 1e-12);
    }

    #[test]
    fn entropy_survives_broken_input() {
        assert_eq!(entropy(&[]), 0.0);
        assert_eq!(entropy(&[0.0, 0.0]), 0.0);
        assert_eq!(entropy(&[f64::NAN, 0.0]), 0.0);
        // Unnormalised input is normalised first: [1, 1] is a fair coin.
        assert!(approx(entropy(&[1.0, 1.0]), std::f64::consts::LN_2));
        // Negative mass is clamped away.
        assert!(approx(entropy(&[-1.0, 1.0, 1.0]), std::f64::consts::LN_2));
    }

    #[test]
    fn kl_divergence_is_zero_for_identical_distributions() {
        let p = [0.2, 0.3, 0.5];
        assert!(approx(kl_divergence(&p, &p).expect("ok"), 0.0));
        let q = [0.7, 0.1, 0.2];
        let d_pq = kl_divergence(&p, &q).expect("ok");
        let d_qp = kl_divergence(&q, &p).expect("ok");
        assert!(d_pq > 0.0);
        // KL is asymmetric: how surprised p is by q is not how surprised q is
        // by p.
        assert!(
            (d_pq - d_qp).abs() > 1e-3,
            "D(p||q) = {d_pq}, D(q||p) = {d_qp}"
        );
    }

    #[test]
    fn kl_divergence_is_infinite_when_q_excludes_support() {
        let p = [0.5, 0.5];
        let q = [1.0, 0.0];
        assert_eq!(kl_divergence(&p, &q).expect("ok"), f64::INFINITY);
        assert!(matches!(
            kl_divergence(&[1.0], &[1.0, 0.0]),
            Err(Error::Mismatch { .. })
        ));
        assert!(matches!(
            kl_divergence(&[], &[]),
            Err(Error::Empty("distribution"))
        ));
    }

    #[test]
    fn js_divergence_is_symmetric_and_bounded() {
        let p = [0.5, 0.5];
        let q = [0.9, 0.1];
        let js = js_divergence(&p, &q).expect("ok");
        let js_rev = js_divergence(&q, &p).expect("ok");
        assert!(approx(js, js_rev), "JS must be symmetric");
        assert!(
            js > 0.0 && js <= std::f64::consts::LN_2 + 1e-12,
            "JS = {js}"
        );
        assert!(approx(js_divergence(&p, &p).expect("ok"), 0.0));
        // Disjoint supports still give the finite maximum, not infinity.
        assert!(
            (js_divergence(&[1.0, 0.0], &[0.0, 1.0]).expect("ok") - std::f64::consts::LN_2).abs()
                < 1e-12
        );
        assert!(matches!(
            js_divergence(&[1.0], &[1.0, 0.0]),
            Err(Error::Mismatch { .. })
        ));
    }

    #[test]
    fn top_k_orders_by_value_and_breaks_ties_by_index() {
        let scores = [0.1, 0.5, 0.2, 0.5];
        assert_eq!(top_k(&scores, 3), vec![(1, 0.5), (3, 0.5), (2, 0.2)]);
        assert_eq!(top_k(&scores, 0), Vec::new());
        assert_eq!(
            top_k(&scores, 99),
            vec![(1, 0.5), (3, 0.5), (2, 0.2), (0, 0.1)]
        );
        assert!(top_k(&[], 3).is_empty());
        // Works on any score slice, logits included (no normalisation).
        let logits = [-2.0, 7.0, 1.0];
        assert_eq!(top_k(&logits, 2), vec![(1, 7.0), (2, 1.0)]);
    }

    #[test]
    fn logit_attribution_sums_to_the_total() {
        let logits = vec![2.0, 0.0, -1.0];
        let report = logit_attribution(
            &logits,
            &[
                ("embed".to_string(), vec![1.0, 0.0, 0.5]),
                ("L0.attn".to_string(), vec![1.0, 0.0, -1.5]),
            ],
        )
        .expect("same length");
        assert!(
            report.residual_norm < 1e-12,
            "residual {:.3?}",
            report.residual
        );
        assert_eq!(report.residual, vec![0.0, 0.0, 0.0]);
        assert!(approx(report.components[0].sum, 1.5));
        assert!(approx(report.components[1].mean, -0.5 / 3.0));
        assert!(approx(report.components[1].max_abs, 1.5));
        assert_eq!(report.component("L0.attn").map(|c| c.sum), Some(-0.5));
        assert!(report.component("nope").is_none());
        // |1| + |1| over |2| + |0| + |1| + |0.5| + |1.5| = 2/5.
        assert!((report.components[0].share - 0.5).abs() < 1e-12);

        // An unexplained component lands in the residual.
        let report = logit_attribution(&logits, &[("embed".to_string(), vec![1.0, 0.0, 0.5])])
            .expect("same length");
        assert_eq!(report.residual, vec![1.0, 0.0, -1.5]);
        assert!(approx(report.residual_norm, 3.25_f64.sqrt()));

        assert!(logit_attribution(&logits, &[("x".to_string(), vec![1.0])]).is_err());
    }

    #[test]
    fn attention_entropy_per_head_is_ln_t_for_a_uniform_row() {
        // seq = 2: row 0 is certain, row 1 is a coin flip.
        let patterns = vec![vec![1.0, 0.0, 0.5, 0.5]];
        let entropy = attention_entropy_per_head(&patterns).expect("square");
        assert!(approx(entropy[0], 0.5 * std::f64::consts::LN_2));
        // Fully attended, seq = 3: every row is uniform over 3 keys.
        let uniform = vec![1.0 / 3.0; 9];
        let entropy = attention_entropy_per_head(&[uniform]).expect("square");
        assert!((entropy[0] - (3.0_f64).ln()).abs() < 1e-12);
        assert!(attention_entropy_per_head(&[vec![1.0, 0.0, 0.0]]).is_err());
        assert!(attention_entropy_per_head(&[])
            .expect("no heads")
            .is_empty());
    }

    #[test]
    fn sparsity_counts_exact_zeros() {
        let x = [0.0, 1.0, 0.0, 2.0, -0.0];
        assert_eq!(sparsity_l0(&x), 3, "-0.0 counts as zero");
        assert!(approx(fraction_zero(&x), 3.0 / 5.0));
        assert_eq!(sparsity_l0(&[1.0, 2.0]), 0);
        assert_eq!(fraction_zero(&[]), 1.0);
        assert_eq!(fraction_zero(&[0.0, 0.0]), 1.0);
    }

    #[test]
    fn activation_stats_match_hand_computation() {
        let x = [1.0_f64, 2.0, 3.0, 0.0];
        let stats = activation_stats(&x);
        assert_eq!(stats.count, 4);
        assert!(approx(stats.mean, 1.5));
        let mean = 1.5_f64;
        let var = x.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / 4.0;
        assert!(approx(stats.std, var.sqrt()));
        assert_eq!(stats.min, 0.0);
        assert_eq!(stats.max, 3.0);
        assert!(approx(stats.l2, 14.0_f64.sqrt()));
        assert!(approx(stats.l0_fraction, 0.25));

        let empty = activation_stats(&[]);
        assert_eq!(empty.count, 0);
        assert_eq!(empty.mean, 0.0);
        assert_eq!(empty.l0_fraction, 1.0);
    }

    #[test]
    fn superposition_score_packs_more_directions_than_dimensions() {
        // Six golden-angle directions inside two dimensions.
        let packed = superposition_score(&golden_vectors(6));
        assert!(packed > 2.0, "expected a superposed score, got {packed}");

        // A tight frame is the exact case: k directions spread as evenly as a
        // d-dimensional space allows. Three 120-apart directions in a plane.
        let tight: Vec<Vec<f64>> = (0..3)
            .map(|i| {
                let theta = i as f64 * 2.0 * std::f64::consts::PI / 3.0;
                vec![theta.cos(), theta.sin()]
            })
            .collect();
        assert!(
            (superposition_score(&tight) - 1.5).abs() < 1e-9,
            "expected exactly k/d = 1.5, got {}",
            superposition_score(&tight)
        );

        // Three independent basis directions inside five dimensions fit.
        let basis = vec![
            vec![1.0, 0.0, 0.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0, 0.0, 0.0],
            vec![0.0, 0.0, 1.0, 0.0, 0.0],
        ];
        assert!((superposition_score(&basis) - 3.0 / 5.0).abs() < 1e-9);

        // A full basis of the space fills it exactly once.
        let full_basis = vec![vec![1.0, 0.0], vec![0.0, 1.0]];
        assert!((superposition_score(&full_basis) - 1.0).abs() < 1e-9);

        // Duplicated directions are redundancy, not superposition.
        assert!(superposition_score(&[basis[0].clone(), basis[0].clone()]) < 1.0);

        // Degenerate inputs measure nothing.
        assert_eq!(superposition_score(&[]), 0.0);
        assert_eq!(superposition_score(&[vec![1.0]]), 0.0);
        assert_eq!(superposition_score(&[Vec::new(), Vec::new()]), 0.0);
        assert_eq!(superposition_score(&[vec![0.0, 0.0], vec![1.0, 1.0]]), 0.0);
        // Mixed dimensions and non-finite entries are dropped, not fatal: two
        // orthogonal 2-D directions left in a 2-D space fill it exactly once.
        let mixed = vec![vec![1.0, 0.0], vec![0.0, 1.0], vec![1.0]];
        assert!((superposition_score(&mixed) - 1.0).abs() < 1e-9);
        let broken = vec![vec![f64::NAN, 0.0], vec![0.0, 1.0]];
        assert_eq!(superposition_score(&broken), 0.0);
    }

    #[test]
    fn superposition_score_is_scale_invariant() {
        let base = golden_vectors(6);
        let rescaled: Vec<Vec<f64>> = base
            .iter()
            .enumerate()
            .map(|(i, v)| v.iter().map(|&x| x * (i as f64 + 1.0)).collect())
            .collect();
        assert!((superposition_score(&base) - superposition_score(&rescaled)).abs() < 1e-9);
    }

    #[test]
    fn normalize_validates_its_input() {
        assert_eq!(normalize(&[1.0, 1.0, 1.0]).expect("ok"), vec![1.0 / 3.0; 3]);
        assert!(matches!(normalize(&[]), Err(Error::Empty("distribution"))));
        assert!(matches!(
            normalize(&[0.0, 0.0]),
            Err(Error::Distribution("distribution"))
        ));
        assert!(matches!(
            normalize(&[f64::NAN]),
            Err(Error::Distribution("distribution"))
        ));
    }
}
