//! # cogitatome-engine
//!
//! The heavy-numerics half of the [cogitatome](https://github.com/aniruddhaadak/cogitatome)
//! interpretability observatory. The web app (Next.js) and the TypeScript
//! `@repo/core` package own the interactive surfaces; this crate owns the
//! arithmetic that has to be *deterministic* and *fast*: a reproducible RNG,
//! tensor-lite transformer math, the interpretability primitives used to
//! dissect a model (entropy, KL/JS divergence, top-k, logit attribution,
//! attention entropy, sparsity, superposition) and a tiny configurable
//! transformer forward pass that records its own internals.
//!
//! ## Design rules
//!
//! * **std only** — no external crates, ever. The dependency tree of this crate
//!   is exactly one optional entry (`wasm-bindgen`, behind the `wasm` feature),
//!   which keeps `cargo build`/`cargo test` hermetic and fast.
//! * **deterministic** — every "random" quantity is drawn from
//!   [`Rng`] seeded by [`EngineConfig::seed`], so a seed plus a token sequence
//!   pins the entire experiment bit for bit.
//! * **explicit over clever** — shapes are validated and fallible functions
//!   return [`Result`] instead of panicking on user input.
//!
//! ## Module map
//!
//! | module | what lives there |
//! |--------|------------------|
//! | [`rng`] | `splitmix64` generator, uniform/normal/shuffle sampling |
//! | [`tensor`] | `Tensor` buffer, `matmul`, `softmax`, `layernorm`, `gelu`, `silu`, multi-head causal `attention` |
//! | [`linalg`] | Jacobi eigenvalue solver (used by [`superposition_score`](interp::superposition_score)) |
//! | [`interp`] | entropy / KL / JS / top-k / attribution / sparsity / activation stats |
//! | [`engine`] | [`EngineConfig`], [`Engine`] and the recorded forward pass |
//! | [`error`] | [`Error`] and the [`Result`] alias |
//!
//! ## Example
//!
//! ```
//! use cogitatome_engine::engine::EngineConfig;
//! use cogitatome_engine::interp::{entropy, top_k};
//! use cogitatome_engine::tensor::softmax;
//!
//! // A tiny, fully deterministic transformer.
//! let config = EngineConfig::tiny();
//! let engine = cogitatome_engine::engine::Engine::new(config).expect("valid config");
//! let out = engine.forward(&[1, 7, 42]).expect("in-vocabulary tokens");
//!
//! // Per-token predictive distribution over the vocabulary.
//! let probs = softmax(out.token_logits(2).expect("position in range"));
//! assert!((probs.iter().sum::<f64>() - 1.0).abs() < 1e-9);
//!
//! // The observatory's favourite two numbers: how surprised the model is,
//! // and what it is currently betting on.
//! let h = entropy(&probs);
//! assert!(h >= 0.0 && h <= (config.vocab as f64).ln() + 1e-9);
//! assert_eq!(top_k(&probs, 3).len(), 3);
//! ```

#![warn(missing_docs)]
#![forbid(unsafe_code)]

pub mod engine;
pub mod error;
pub mod interp;
pub mod linalg;
pub mod rng;
pub mod tensor;

#[cfg(feature = "wasm")]
pub mod wasm_bindings;

pub use engine::{Engine, EngineConfig, ForwardOutput, LayerActivation};
pub use error::{Error, Result};
pub use interp::{
    activation_stats, attention_entropy_per_head, entropy, fraction_zero, js_divergence,
    kl_divergence, logit_attribution, normalized_entropy, sparsity_l0, superposition_score, top_k,
    ActivationStats, Attribution, AttributionReport,
};
pub use rng::Rng;
pub use tensor::{attention, gelu, layernorm, matmul, silu, softmax, softmax_inplace, Tensor};
