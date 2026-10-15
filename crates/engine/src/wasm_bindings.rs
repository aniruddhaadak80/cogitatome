//! `wasm-bindgen` bindings, compiled **only** with `--features wasm`.
//!
//! The engine itself is dependency-free `std` Rust. This module is the seam the
//! browser uses: it is compiled out of the default build so `cargo test`,
//! `cargo clippy` and `cargo build` stay native, hermetic and fast, and it is
//! switched on explicitly when producing a WebAssembly bundle for the Next.js
//! app:
//!
//! ```text
//! rustup target add wasm32-unknown-unknown
//! wasm-pack build --release --target web --features wasm crates/engine
//! ```
//!
//! Everything here returns plain `f64`/`Vec<f64>`/`String` — no `serde`, no
//! `js-sys` object graphs — so the TypeScript wrapper is ~20 lines and never
//! has to chase a struct rename.

use wasm_bindgen::prelude::*;

use crate::engine::{Engine, EngineConfig};
use crate::interp;
use crate::tensor;

/// Softmax over a flat slice of values.
#[wasm_bindgen]
pub fn wasm_softmax(values: Vec<f64>) -> Vec<f64> {
    tensor::softmax(&values)
}

/// Shannon entropy (nats) of a probability slice.
#[wasm_bindgen]
pub fn wasm_entropy(probs: Vec<f64>) -> f64 {
    interp::entropy(&probs)
}

/// Entropy on a `[0, 1]` scale (`H / ln n`).
#[wasm_bindgen]
pub fn wasm_normalized_entropy(probs: Vec<f64>) -> f64 {
    interp::normalized_entropy(&probs)
}

/// Kullback–Leibler divergence `D(p ‖ q)` in nats.
///
/// Returns `f64::INFINITY` when `q` has no mass on an outcome `p` does.
#[wasm_bindgen]
pub fn wasm_kl_divergence(p: Vec<f64>, q: Vec<f64>) -> Result<f64, JsValue> {
    interp::kl_divergence(&p, &q).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Jensen–Shannon divergence in nats (symmetric, bounded by `ln 2`).
#[wasm_bindgen]
pub fn js_divergence(p: Vec<f64>, q: Vec<f64>) -> Result<f64, JsValue> {
    interp::js_divergence(&p, &q).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// The `k` largest entries as a flat `[index, value, index, value, …]` list.
///
/// Flat rather than a list of tuples because that is what JavaScript wants
/// anyway: `new Float64Array(result)` and slice it.
#[wasm_bindgen]
pub fn wasm_top_k(scores: Vec<f64>, k: usize) -> Vec<f64> {
    let mut out = Vec::with_capacity(k * 2);
    for (index, value) in interp::top_k(&scores, k) {
        out.push(index as f64);
        out.push(value);
    }
    out
}

/// Flattened attention patterns: `heads` row-major `seq × seq` matrices.
#[wasm_bindgen]
pub fn wasm_attention_patterns(
    q: Vec<f64>,
    k: Vec<f64>,
    seq: usize,
    heads: usize,
    causal: bool,
) -> Result<Vec<f64>, JsValue> {
    let patterns = tensor::attention_patterns(&q, &k, seq, heads, causal)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(patterns.into_iter().flatten().collect())
}

/// Mean attention entropy (nats) per head, for the given `q`/`k` pair.
#[wasm_bindgen]
pub fn wasm_attention_entropy(
    q: Vec<f64>,
    k: Vec<f64>,
    seq: usize,
    heads: usize,
) -> Result<Vec<f64>, JsValue> {
    let patterns = tensor::attention_patterns(&q, &k, seq, heads, true)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    interp::attention_entropy_per_head(&patterns).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Summary statistics of one activation tensor.
///
/// A `#[wasm_bindgen]` struct rather than a `Vec<f64>` so the JS side reads
/// `stats.mean` instead of indexing magic positions.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WasmActivationStats {
    count: usize,
    mean: f64,
    std: f64,
    min: f64,
    max: f64,
    l2: f64,
    l0_fraction: f64,
}

#[wasm_bindgen]
impl WasmActivationStats {
    /// Number of elements measured.
    #[wasm_bindgen(getter)]
    pub fn count(&self) -> usize {
        self.count
    }

    /// Arithmetic mean.
    #[wasm_bindgen(getter)]
    pub fn mean(&self) -> f64 {
        self.mean
    }

    /// Population standard deviation.
    #[wasm_bindgen(getter)]
    pub fn std(&self) -> f64 {
        self.std
    }

    /// Smallest element.
    #[wasm_bindgen(getter)]
    pub fn min(&self) -> f64 {
        self.min
    }

    /// Largest element.
    #[wasm_bindgen(getter)]
    pub fn max(&self) -> f64 {
        self.max
    }

    /// Euclidean length.
    #[wasm_bindgen(getter)]
    pub fn l2(&self) -> f64 {
        self.l2
    }

    /// Fraction of exactly-zero elements.
    #[wasm_bindgen(getter)]
    pub fn l0_fraction(&self) -> f64 {
        self.l0_fraction
    }
}

/// Computes [`interp::activation_stats`] from a flat activation buffer.
#[wasm_bindgen]
pub fn wasm_activation_stats(values: Vec<f64>) -> WasmActivationStats {
    let stats = interp::activation_stats(&values);
    WasmActivationStats {
        count: stats.count,
        mean: stats.mean,
        std: stats.std,
        min: stats.min,
        max: stats.max,
        l2: stats.l2,
        l0_fraction: stats.l0_fraction,
    }
}

/// Superposition score of `vectors` vectors of `dims` dimensions, supplied as
/// one flat row-major buffer.
#[wasm_bindgen]
pub fn wasm_superposition_score(
    flat: Vec<f64>,
    vectors: usize,
    dims: usize,
) -> Result<f64, JsValue> {
    if dims == 0 || vectors == 0 || flat.len() != vectors * dims {
        return Err(JsValue::from_str(
            "flat buffer must hold vectors * dims elements",
        ));
    }
    let vectors: Vec<Vec<f64>> = flat.chunks(dims).map(<[f64]>::to_vec).collect();
    Ok(interp::superposition_score(&vectors))
}

/// Runs the tiny transformer and returns the flattened `seq × vocab` logits.
///
/// The build is deterministic: identical arguments return identical logits.
#[wasm_bindgen]
pub fn wasm_forward_logits(
    vocab: usize,
    d_model: usize,
    n_layers: usize,
    n_heads: usize,
    d_mlp: usize,
    seed: u64,
    tokens: Vec<usize>,
) -> Result<Vec<f64>, JsValue> {
    let config = EngineConfig::new(vocab, d_model, n_layers, n_heads, d_mlp, seed);
    let engine = Engine::new(config).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let out = engine
        .forward(&tokens)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(out.logits)
}

/// Per-head attention entropy (nats) for every layer, flattened.
#[wasm_bindgen]
pub fn wasm_forward_attention_entropy(
    vocab: usize,
    d_model: usize,
    n_layers: usize,
    n_heads: usize,
    d_mlp: usize,
    seed: u64,
    tokens: Vec<usize>,
) -> Result<Vec<f64>, JsValue> {
    let config = EngineConfig::new(vocab, d_model, n_layers, n_heads, d_mlp, seed);
    let engine = Engine::new(config).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let out = engine
        .forward(&tokens)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(out
        .layers
        .iter()
        .flat_map(|layer| layer.attention_entropy.iter().copied())
        .collect())
}
