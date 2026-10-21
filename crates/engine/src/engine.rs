//! A tiny, deterministic transformer that records what it did.
//!
//! This is the Rust twin of the TypeScript engine in `packages/core`: same
//! architecture, same seeding, same recording discipline. It exists so the
//! observatory's UI can drive a *real* forward pass instead of hand-drawn
//! activations — pick a seed, pick a token sequence, and inspect the residual
//! stream, attention heads, MLP neurons and logit attributions of a model whose
//! behaviour is pinned bit for bit.
//!
//! The architecture is a decoder-only transformer:
//!
//! ```text
//! x ← tok_embed[t] + pos_embed[t]                     (residual stream)
//! for each layer ℓ:
//!     x ← x + Attn(LN₁(x))                            (multi-head, causal)
//!     x ← x + MLP(LN₂(x))                             (GELU, d_model → d_mlp → d_model)
//! logits ← (x @ W_U)  after  LN_f
//! ```

use crate::error::{Error, Result};
use crate::interp::{attention_entropy_per_head, logit_attribution, AttributionReport};
use crate::rng::Rng;
use crate::tensor::{add_bias_rows, attention, attention_patterns, gelu, layernorm_rows, matmul};

/// Longest sequence the engine will accept.
///
/// Position embeddings are allocated for exactly this many positions, so the
/// limit is a hard shape contract rather than a performance knob.
pub const MAX_SEQUENCE: usize = 128;

/// `eps` used by every layernorm in the model.
pub const LAYER_NORM_EPS: f64 = 1e-5;

/// Shape and seed of the tiny transformer.
///
/// # Example
///
/// ```
/// use cogitatome_engine::engine::EngineConfig;
///
/// let config = EngineConfig::new(128, 32, 2, 4, 64, 2026);
/// assert_eq!(config.d_head(), 8);
/// assert!(config.validate().is_ok());
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineConfig {
    /// Size of the token vocabulary (and of the unembedding).
    pub vocab: usize,
    /// Width of the residual stream.
    pub d_model: usize,
    /// Number of transformer blocks.
    pub n_layers: usize,
    /// Number of attention heads; must divide `d_model`.
    pub n_heads: usize,
    /// Width of the MLP hidden layer.
    pub d_mlp: usize,
    /// Seed for every "random" weight in the model.
    pub seed: u64,
}

impl EngineConfig {
    /// Builds a configuration from raw fields.
    pub const fn new(
        vocab: usize,
        d_model: usize,
        n_layers: usize,
        n_heads: usize,
        d_mlp: usize,
        seed: u64,
    ) -> Self {
        Self {
            vocab,
            d_model,
            n_layers,
            n_heads,
            d_mlp,
            seed,
        }
    }

    /// The default preset used across the docs and tests: a 2-layer, 4-head,
    /// 32-wide model over a 64-token vocabulary.
    pub const fn tiny() -> Self {
        Self::new(64, 32, 2, 4, 64, 7)
    }

    /// A slightly larger preset for demos that want a little more depth.
    pub const fn small() -> Self {
        Self::new(256, 64, 4, 8, 256, 11)
    }

    /// Width of a single attention head (`d_model / n_heads`).
    pub const fn d_head(&self) -> usize {
        self.d_model / self.n_heads
    }

    /// Whether the configuration describes a buildable model.
    ///
    /// # Errors
    ///
    /// [`Error::Shape`] when any dimension is zero, when `n_heads` does not
    /// divide `d_model`, or when a head would have zero width.
    pub fn validate(&self) -> Result<()> {
        if self.vocab == 0
            || self.d_model == 0
            || self.n_layers == 0
            || self.n_heads == 0
            || self.d_mlp == 0
        {
            return Err(Error::Shape("every dimension must be non-zero"));
        }
        if self.d_model % self.n_heads != 0 {
            return Err(Error::Shape("d_model must be divisible by n_heads"));
        }
        if self.d_head() == 0 {
            return Err(Error::Shape("n_heads must not exceed d_model"));
        }
        Ok(())
    }

    /// Number of trainable parameters this configuration produces.
    ///
    /// Cross-checked against the allocated weights by a `debug_assert` inside
    /// [`Engine::new`], so a change to the architecture that forgets to update
    /// this arithmetic fails the test suite rather than shipping silently.
    pub fn parameter_count(&self) -> usize {
        let d = self.d_model;
        let vocab = self.vocab;
        let embeddings = vocab * d + MAX_SEQUENCE * d;
        let attention_block = 4 * d * d;
        let mlp_block = d * self.d_mlp + self.d_mlp + self.d_mlp * d + d;
        // ln1 (gamma + beta) and ln2 (gamma + beta) of every block.
        let norms = 4 * d;
        let per_layer = norms + attention_block + mlp_block;
        embeddings + self.n_layers * per_layer + 2 * d + d * vocab
    }
}
impl Default for EngineConfig {
    fn default() -> Self {
        Self::tiny()
    }
}

/// Per-layer weights of one transformer block.
#[derive(Debug, Clone)]
struct LayerWeights {
    ln1_gamma: Vec<f64>,
    ln1_beta: Vec<f64>,
    wq: Vec<f64>,
    wk: Vec<f64>,
    wv: Vec<f64>,
    wo: Vec<f64>,
    ln2_gamma: Vec<f64>,
    ln2_beta: Vec<f64>,
    w_up: Vec<f64>,
    b_up: Vec<f64>,
    w_down: Vec<f64>,
    b_down: Vec<f64>,
}

/// The full, flat, seed-determined parameter set of a model.
#[derive(Debug, Clone)]
struct Weights {
    tok_embed: Vec<f64>,
    pos_embed: Vec<f64>,
    layers: Vec<LayerWeights>,
    ln_f_gamma: Vec<f64>,
    ln_f_beta: Vec<f64>,
    unembed: Vec<f64>,
}

impl Weights {
    /// Draws every weight in a fixed order from a single seeded [`Rng`].
    fn init(config: &EngineConfig) -> Result<Self> {
        let d = config.d_model;
        let mut rng = Rng::new(config.seed);
        let embed_std = 1.0 / (d as f64).sqrt();

        let tok_embed = gaussian_matrix(&mut rng, config.vocab, d, embed_std);
        let pos_embed = gaussian_matrix(&mut rng, MAX_SEQUENCE, d, embed_std);

        let mut layers = Vec::with_capacity(config.n_layers);
        for _ in 0..config.n_layers {
            layers.push(LayerWeights {
                ln1_gamma: vec![1.0; d],
                ln1_beta: vec![0.0; d],
                wq: gaussian_matrix(&mut rng, d, d, glorot_std(d, d)),
                wk: gaussian_matrix(&mut rng, d, d, glorot_std(d, d)),
                wv: gaussian_matrix(&mut rng, d, d, glorot_std(d, d)),
                wo: gaussian_matrix(&mut rng, d, d, glorot_std(d, d)),
                ln2_gamma: vec![1.0; d],
                ln2_beta: vec![0.0; d],
                w_up: gaussian_matrix(&mut rng, config.d_mlp, d, glorot_std(config.d_mlp, d)),
                b_up: vec![0.0; config.d_mlp],
                w_down: gaussian_matrix(&mut rng, d, config.d_mlp, glorot_std(d, config.d_mlp)),
                b_down: vec![0.0; d],
            });
        }

        let ln_f_gamma = vec![1.0; d];
        let ln_f_beta = vec![0.0; d];
        let unembed = gaussian_matrix(&mut rng, config.vocab, d, glorot_std(config.vocab, d));

        let weights = Self {
            tok_embed,
            pos_embed,
            layers,
            ln_f_gamma,
            ln_f_beta,
            unembed,
        };
        debug_assert_eq!(weights.parameter_count(), config.parameter_count());
        Ok(weights)
    }

    /// Total number of stored floats (used to cross-check the config arithmetic).
    fn parameter_count(&self) -> usize {
        let mut count = self.tok_embed.len()
            + self.pos_embed.len()
            + self.ln_f_gamma.len()
            + self.ln_f_beta.len()
            + self.unembed.len();
        for layer in &self.layers {
            count += layer.ln1_gamma.len()
                + layer.ln1_beta.len()
                + layer.wq.len()
                + layer.wk.len()
                + layer.wv.len()
                + layer.wo.len()
                + layer.ln2_gamma.len()
                + layer.ln2_beta.len()
                + layer.w_up.len()
                + layer.b_up.len()
                + layer.w_down.len()
                + layer.b_down.len();
        }
        count
    }
}

/// Glorot standard deviation for a `rows × cols` matrix: `sqrt(2 / (rows + cols))`.
fn glorot_std(rows: usize, cols: usize) -> f64 {
    (2.0 / (rows + cols) as f64).sqrt()
}

/// Fills a `rows × cols` row-major matrix with `N(0, std / sqrt(cols))` draws.
fn gaussian_matrix(rng: &mut Rng, rows: usize, cols: usize, std: f64) -> Vec<f64> {
    let scale = std / (cols as f64).sqrt();
    (0..rows * cols).map(|_| rng.normal() * scale).collect()
}

/// Everything one layer wrote to the residual stream during a forward pass.
#[derive(Debug, Clone, PartialEq)]
pub struct LayerActivation {
    /// Zero-based layer index.
    pub layer: usize,
    /// Residual stream at the start of the block, `seq × d_model`.
    pub residual_in: Vec<f64>,
    /// Output of the attention sublayer *before* it is added back,
    /// `seq × d_model`.
    pub attn_out: Vec<f64>,
    /// Output of the MLP sublayer *before* it is added back, `seq × d_model`.
    pub mlp_out: Vec<f64>,
    /// One flattened row-major `seq × seq` attention matrix per head.
    pub attention_patterns: Vec<Vec<f64>>,
    /// Mean Shannon entropy (nats) of each head's attention pattern.
    pub attention_entropy: Vec<f64>,
    /// Pre-activation MLP hidden values (the GELU input), `seq × d_mlp`.
    pub mlp_hidden: Vec<f64>,
    /// Residual stream at the end of the block, `seq × d_model`.
    pub residual_out: Vec<f64>,
}

/// The recorded result of a forward pass.
#[derive(Debug, Clone, PartialEq)]
pub struct ForwardOutput {
    /// Unembedding logits, `seq × vocab` row-major.
    pub logits: Vec<f64>,
    /// One entry per transformer block, in order.
    pub layers: Vec<LayerActivation>,
    /// The residual stream right after embedding, `seq × d_model`.
    pub embedding: Vec<f64>,
    /// The residual stream just before the final layernorm, `seq × d_model` —
    /// the tensor a logit-attribution decomposition actually splits up.
    pub residual_stream: Vec<f64>,
    /// The residual stream after the final layernorm, `seq × d_model` — what
    /// the unembedding reads.
    pub final_residual: Vec<f64>,
    /// Number of tokens processed.
    pub seq_len: usize,
    /// The configuration this pass ran with.
    pub config: EngineConfig,
}

impl ForwardOutput {
    /// Logits for one position, `&[f64]` of length `vocab`.
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `position >= seq_len`.
    pub fn token_logits(&self, position: usize) -> Result<&[f64]> {
        self.row(&self.logits, self.config.vocab, position, "logits")
    }

    /// Softmax of every position's logits: the per-token predictive
    /// distribution.
    pub fn probabilities(&self) -> Vec<Vec<f64>> {
        self.logits
            .chunks(self.config.vocab)
            .map(crate::tensor::softmax)
            .collect()
    }

    /// Shannon entropy (nats) of each position's predictive distribution.
    pub fn entropy_per_token(&self) -> Vec<f64> {
        self.probabilities()
            .iter()
            .map(|p| crate::interp::entropy(p))
            .collect()
    }

    /// The `k` most likely next tokens at `position`, as `(token, prob)`.
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `position >= seq_len`.
    pub fn top_k(&self, position: usize, k: usize) -> Result<Vec<(usize, f64)>> {
        let probs = crate::tensor::softmax(self.token_logits(position)?);
        Ok(crate::interp::top_k(&probs, k))
    }

    /// Borrows one layer's recording.
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `index >= n_layers`.
    pub fn layer(&self, index: usize) -> Result<&LayerActivation> {
        self.layers.get(index).ok_or(Error::OutOfRange {
            what: "layer",
            index,
            len: self.layers.len(),
        })
    }

    /// Per-head attention entropy (nats) for one layer.
    ///
    /// # Errors
    ///
    /// [`Error::OutOfRange`] when `index >= n_layers`.
    pub fn attention_entropy(&self, index: usize) -> Result<&[f64]> {
        Ok(&self.layer(index)?.attention_entropy)
    }

    /// Borrows `position`'s row of a `seq × width` buffer.
    fn row<'a>(
        &self,
        buf: &'a [f64],
        width: usize,
        position: usize,
        what: &'static str,
    ) -> Result<&'a [f64]> {
        buf.get(position * width..(position + 1) * width)
            .ok_or(Error::OutOfRange {
                what,
                index: position,
                len: buf.len() / width.max(1),
            })
    }
}

/// A configurable tiny transformer with fully deterministic weights.
///
/// ```
/// use cogitatome_engine::engine::{Engine, EngineConfig};
///
/// let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
/// let out = engine.forward(&[3, 1, 4, 1, 5]).expect("in-vocabulary tokens");
///
/// assert_eq!(out.layers.len(), 2);
/// assert_eq!(out.logits.len(), 5 * out.config.vocab);
/// assert_eq!(out.layers[0].attention_patterns.len(), out.config.n_heads);
///
/// // Determinism: same seed + same tokens = bit-identical logits.
/// let again = engine.forward(&[3, 1, 4, 1, 5]).expect("in-vocabulary tokens");
/// assert_eq!(out.logits, again.logits);
/// ```
#[derive(Debug, Clone)]
pub struct Engine {
    config: EngineConfig,
    weights: Weights,
}

impl Engine {
    /// Builds a model from `config`, drawing every weight from `config.seed`.
    ///
    /// # Errors
    ///
    /// [`Error::Shape`] when the configuration is not buildable (see
    /// [`EngineConfig::validate`]).
    pub fn new(config: EngineConfig) -> Result<Self> {
        config.validate()?;
        let weights = Weights::init(&config)?;
        Ok(Self { config, weights })
    }

    /// The configuration this engine was built with.
    pub fn config(&self) -> &EngineConfig {
        &self.config
    }

    /// Total number of stored weights.
    pub fn parameter_count(&self) -> usize {
        self.weights.parameter_count()
    }

    /// Runs a forward pass, recording every intermediate tensor.
    ///
    /// # Errors
    ///
    /// [`Error::Empty`] when `tokens` is empty, [`Error::Shape`] when the
    /// sequence is longer than [`MAX_SEQUENCE`], and
    /// [`Error::TokenOutOfRange`] when a token id is outside the vocabulary.
    pub fn forward(&self, tokens: &[usize]) -> Result<ForwardOutput> {
        let seq = tokens.len();
        if seq == 0 {
            return Err(Error::Empty("tokens"));
        }
        if seq > MAX_SEQUENCE {
            return Err(Error::Shape(
                "sequence longer than the 128 supported positions",
            ));
        }
        let d = self.config.d_model;
        let vocab = self.config.vocab;
        let d_mlp = self.config.d_mlp;
        for &token in tokens {
            if token >= vocab {
                return Err(Error::TokenOutOfRange { token, vocab });
            }
        }

        let w = &self.weights;
        let mut x = vec![0.0; seq * d];
        for (position, &token) in tokens.iter().enumerate() {
            for (i, slot) in x[position * d..(position + 1) * d].iter_mut().enumerate() {
                *slot = w.tok_embed[token * d + i] + w.pos_embed[position * d + i];
            }
        }
        let embedding = x.clone();

        let mut layers = Vec::with_capacity(self.config.n_layers);
        for (index, lw) in w.layers.iter().enumerate() {
            let residual_in = x.clone();

            // --- attention sublayer (causal) ------------------------------
            let normed = layernorm_rows(&x, &lw.ln1_gamma, &lw.ln1_beta, LAYER_NORM_EPS, seq)?;
            let q = matmul(&normed, &lw.wq, seq, d, d)?;
            let k = matmul(&normed, &lw.wk, seq, d, d)?;
            let v = matmul(&normed, &lw.wv, seq, d, d)?;
            let patterns = attention_patterns(&q, &k, seq, self.config.n_heads, true)?;
            let attention_entropy = attention_entropy_per_head(&patterns)?;
            let attended = attention(&q, &k, &v, seq, self.config.n_heads, true)?;
            let attn_out = matmul(&attended, &lw.wo, seq, d, d)?;
            for (xi, &ai) in x.iter_mut().zip(&attn_out) {
                *xi += ai;
            }

            // --- MLP sublayer ---------------------------------------------
            let normed2 = layernorm_rows(&x, &lw.ln2_gamma, &lw.ln2_beta, LAYER_NORM_EPS, seq)?;
            let mut hidden = matmul(&normed2, &lw.w_up, seq, d, d_mlp)?;
            add_bias_rows(&mut hidden, &lw.b_up);
            let activated = gelu(&hidden);
            let mut mlp_out = matmul(&activated, &lw.w_down, seq, d_mlp, d)?;
            add_bias_rows(&mut mlp_out, &lw.b_down);
            for (xi, &mi) in x.iter_mut().zip(&mlp_out) {
                *xi += mi;
            }

            layers.push(LayerActivation {
                layer: index,
                residual_in,
                attn_out,
                mlp_out,
                attention_patterns: patterns,
                attention_entropy,
                mlp_hidden: hidden,
                residual_out: x.clone(),
            });
        }

        let residual_stream = x;
        let final_residual = layernorm_rows(
            &residual_stream,
            &w.ln_f_gamma,
            &w.ln_f_beta,
            LAYER_NORM_EPS,
            seq,
        )?;
        let logits = matmul(&final_residual, &w.unembed, seq, d, vocab)?;

        Ok(ForwardOutput {
            logits,
            layers,
            embedding,
            residual_stream,
            final_residual,
            seq_len: seq,
            config: self.config,
        })
    }

    /// Per-token predictive distributions (a shortcut for
    /// [`ForwardOutput::probabilities`]).
    pub fn probabilities(&self, tokens: &[usize]) -> Result<Vec<Vec<f64>>> {
        Ok(self.forward(tokens)?.probabilities())
    }

    /// Decomposes the logits at `position` into named contributions from the
    /// embedding and every sublayer.
    ///
    /// Each component `c` is projected through the final layernorm's scale and
    /// the unembedding, i.e. `contribution_c[j] = Σᵢ W_U[i][j] · γᵢ · xᵢ_c / s`
    /// where `s` is the final layernorm's standard deviation at that position.
    /// Because the layernorm's *centring* term and `β` are shared by all
    /// components rather than belonging to any one of them, they land in the
    /// report's [`AttributionReport::residual`] — which is exactly the number
    /// to watch: it is how much of the logit the named components cannot
    /// explain.
    ///
    /// # Errors
    ///
    /// Anything [`Engine::forward`] can return, plus [`Error::OutOfRange`]
    /// when `position` is not a valid position in `tokens`.
    pub fn logit_attribution_at(
        &self,
        tokens: &[usize],
        position: usize,
    ) -> Result<AttributionReport> {
        let out = self.forward(tokens)?;
        if position >= out.seq_len {
            return Err(Error::OutOfRange {
                what: "position",
                index: position,
                len: out.seq_len,
            });
        }
        let d = self.config.d_model;
        let vocab = self.config.vocab;
        let w = &self.weights;

        // Final layernorm statistics at this position.
        let x = &out.residual_stream[position * d..(position + 1) * d];
        let mean = x.iter().sum::<f64>() / d as f64;
        let var = x.iter().map(|&value| (value - mean).powi(2)).sum::<f64>() / d as f64;
        let inv_std = 1.0 / (var + LAYER_NORM_EPS).sqrt();

        let mut contributions: Vec<(String, Vec<f64>)> =
            Vec::with_capacity(out.layers.len() * 2 + 1);
        let embed_row = &out.embedding[position * d..(position + 1) * d];
        project_component(
            embed_row,
            &w.ln_f_gamma,
            &w.unembed,
            inv_std,
            vocab,
            "embed",
            &mut contributions,
        )?;
        for layer in &out.layers {
            let name = format!("L{}.attn", layer.layer);
            let row = &layer.attn_out[position * d..(position + 1) * d];
            project_component(
                row,
                &w.ln_f_gamma,
                &w.unembed,
                inv_std,
                vocab,
                &name,
                &mut contributions,
            )?;
            let name = format!("L{}.mlp", layer.layer);
            let row = &layer.mlp_out[position * d..(position + 1) * d];
            project_component(
                row,
                &w.ln_f_gamma,
                &w.unembed,
                inv_std,
                vocab,
                &name,
                &mut contributions,
            )?;
        }

        logit_attribution(out.token_logits(position)?, &contributions)
    }
}

/// Scales one residual-stream component through the final layernorm and the
/// unembedding, appending the result to `out`.
fn project_component(
    component: &[f64],
    gamma: &[f64],
    unembed: &[f64],
    inv_std: f64,
    vocab: usize,
    name: &str,
    out: &mut Vec<(String, Vec<f64>)>,
) -> Result<()> {
    let scaled: Vec<f64> = gamma
        .iter()
        .zip(component)
        .map(|(&g, &c)| g * c * inv_std)
        .collect();
    let values = matmul(&scaled, unembed, 1, gamma.len(), vocab)?;
    out.push((name.to_string(), values));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interp::entropy;

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-12
    }

    #[test]
    fn forward_pass_is_deterministic() {
        let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
        let tokens = [1usize, 7, 42, 3, 0];
        let a = engine.forward(&tokens).expect("ok");
        let b = engine.forward(&tokens).expect("ok");
        assert_eq!(
            a.logits, b.logits,
            "same seed must give bit-identical logits"
        );
        assert_eq!(a.layers, b.layers);

        // A different seed is a different model.
        let other = Engine::new(EngineConfig::new(64, 32, 2, 4, 64, 8)).expect("valid config");
        assert_ne!(a.logits, other.forward(&tokens).expect("ok").logits);

        // Different token sequences give different activations.
        assert_ne!(
            a.logits,
            engine.forward(&[7, 1, 42, 3, 0]).expect("ok").logits
        );
    }

    #[test]
    fn forward_pass_records_every_layer() {
        let config = EngineConfig::new(32, 16, 3, 4, 24, 5);
        let engine = Engine::new(config).expect("valid config");
        let out = engine.forward(&[1, 2, 3, 4]).expect("ok");

        assert_eq!(out.seq_len, 4);
        assert_eq!(out.logits.len(), 4 * 32);
        assert_eq!(out.layers.len(), 3);
        assert_eq!(out.embedding.len(), 4 * 16);
        assert_eq!(out.residual_stream.len(), 4 * 16);
        assert_eq!(out.final_residual.len(), 4 * 16);
        assert!(out
            .layers
            .iter()
            .all(|l| l.residual_out.iter().all(|v| v.is_finite())));

        for (index, layer) in out.layers.iter().enumerate() {
            assert_eq!(layer.layer, index);
            assert_eq!(layer.residual_in.len(), 4 * 16);
            assert_eq!(layer.attn_out.len(), 4 * 16);
            assert_eq!(layer.mlp_out.len(), 4 * 16);
            assert_eq!(layer.mlp_hidden.len(), 4 * 24);
            assert_eq!(layer.attention_patterns.len(), 4, "one matrix per head");
            assert_eq!(layer.attention_entropy.len(), 4);
            for pattern in &layer.attention_patterns {
                assert_eq!(pattern.len(), 16, "seq * seq per head");
                for (query, row) in pattern.chunks(4).enumerate() {
                    let sum: f64 = row.iter().sum();
                    assert!(approx(sum, 1.0), "layer {index} head row summed to {sum}");
                    for (key, &weight) in row.iter().enumerate() {
                        if key > query {
                            assert_eq!(weight, 0.0, "causal mask leaked at {query} -> {key}");
                        }
                    }
                }
            }
            // The residual stream really is the running sum of the sublayers.
            for token in 0..4 {
                let base = token * 16;
                for i in 0..16 {
                    let expected = layer.residual_in[base + i]
                        + layer.attn_out[base + i]
                        + layer.mlp_out[base + i];
                    assert!(
                        approx(layer.residual_out[base + i], expected),
                        "layer {index} token {token} dim {i} did not accumulate"
                    );
                }
            }
        }
    }

    #[test]
    fn residual_stream_is_the_sum_of_its_components() {
        let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
        let out = engine.forward(&[3, 1, 4, 1, 5]).expect("ok");
        let d = out.config.d_model;
        for token in 0..out.seq_len {
            let base = token * d;
            for i in 0..d {
                let mut expected = out.embedding[base + i];
                for layer in &out.layers {
                    expected += layer.attn_out[base + i] + layer.mlp_out[base + i];
                }
                assert!(
                    approx(out.residual_stream[base + i], expected),
                    "token {token} dim {i} residual mismatch"
                );
            }
        }
    }

    #[test]
    fn probabilities_are_distributions() {
        let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
        let out = engine.forward(&[2, 9, 4]).expect("ok");
        let probs = out.probabilities();
        assert_eq!(probs.len(), 3);
        for (position, row) in probs.iter().enumerate() {
            assert_eq!(row.len(), out.config.vocab);
            let sum: f64 = row.iter().sum();
            assert!(approx(sum, 1.0), "position {position} summed to {sum}");
            assert!(row.iter().all(|&p| (0.0..=1.0).contains(&p)));
        }
        // Entropy is bounded by ln(vocab).
        for (position, row) in probs.iter().enumerate() {
            let h = entropy(row);
            assert!(
                h >= 0.0 && h <= (out.config.vocab as f64).ln() + 1e-9,
                "H = {h} at {position}"
            );
        }
        // Top-k is well formed and sorted.
        let top = out.top_k(2, 5).expect("ok");
        assert_eq!(top.len(), 5);
        for pair in top.windows(2) {
            assert!(pair[0].1 >= pair[1].1);
        }
        assert!(
            out.token_logits(3).is_err(),
            "position out of range must error"
        );
        assert!(out.layer(9).is_err());
    }

    #[test]
    fn invalid_configs_and_tokens_are_rejected() {
        assert!(
            Engine::new(EngineConfig::new(0, 16, 1, 2, 8, 0)).is_err(),
            "vocab = 0"
        );
        assert!(
            Engine::new(EngineConfig::new(16, 0, 1, 2, 8, 0)).is_err(),
            "d_model = 0"
        );
        assert!(
            Engine::new(EngineConfig::new(16, 16, 1, 5, 8, 0)).is_err(),
            "n_heads must divide d_model"
        );
        assert!(
            Engine::new(EngineConfig::new(16, 16, 0, 2, 8, 0)).is_err(),
            "n_layers = 0"
        );

        let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
        assert!(matches!(engine.forward(&[]), Err(Error::Empty("tokens"))));
        assert!(matches!(
            engine.forward(&[1, 64]),
            Err(Error::TokenOutOfRange {
                token: 64,
                vocab: 64
            })
        ));
        assert!(matches!(engine.forward(&[0; 129]), Err(Error::Shape(_))));
    }

    #[test]
    fn parameter_count_matches_the_allocated_weights() {
        for config in [
            EngineConfig::tiny(),
            EngineConfig::small(),
            EngineConfig::new(64, 8, 1, 1, 16, 0),
        ] {
            let engine = Engine::new(config).expect("valid config");
            assert_eq!(engine.parameter_count(), config.parameter_count());
        }
    }

    #[test]
    fn logit_attribution_recovers_the_logit_vector() {
        let engine = Engine::new(EngineConfig::tiny()).expect("valid config");
        let tokens = [4usize, 9, 1];
        let report = engine.logit_attribution_at(&tokens, 2).expect("ok");
        let out = engine.forward(&tokens).expect("ok");
        assert_eq!(report.components.len(), 1 + 2 * out.config.n_layers);
        assert_eq!(report.components[0].name, "embed");
        assert_eq!(report.components[1].name, "L0.attn");
        assert_eq!(report.components[2].name, "L0.mlp");
        assert_eq!(report.components[3].name, "L1.attn");

        // The named components plus the residual must reconstruct the logits
        // exactly: this is what makes the decomposition trustworthy.
        for (index, &logit) in out.token_logits(2).expect("ok").iter().enumerate() {
            let mut reconstructed = report.residual[index];
            for component in &report.components {
                reconstructed += component.values[index];
            }
            assert!(
                approx(reconstructed, logit),
                "logit {index}: {reconstructed} != {logit}"
            );
        }
        assert!(report.residual_norm.is_finite());
        assert!(report.total_abs > 0.0);
        assert!(engine.logit_attribution_at(&tokens, 7).is_err());
    }

    #[test]
    fn presets_and_defaults_are_consistent() {
        let tiny = EngineConfig::default();
        assert_eq!(tiny, EngineConfig::tiny());
        assert_eq!(tiny.d_head(), tiny.d_model / tiny.n_heads);
        assert!(tiny.validate().is_ok());
        assert!(EngineConfig::small().validate().is_ok());
        assert_eq!(EngineConfig::new(1, 1, 1, 1, 1, 0).d_head(), 1);
    }
}
