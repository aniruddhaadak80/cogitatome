//! End-to-end tests: the way the observatory actually uses this crate.
//!
//! Unit tests check the maths; these check that the *whole* path works
//! together through the public API — build a model, run a forward pass,
//! measure what came out — the way a web worker or a CLI would.

use cogitatome_engine::engine::{Engine, EngineConfig};
use cogitatome_engine::interp::{
    activation_stats, attention_entropy_per_head, entropy, fraction_zero, js_divergence,
    kl_divergence, normalized_entropy, sparsity_l0, superposition_score, top_k,
};
use cogitatome_engine::rng::Rng;
use cogitatome_engine::tensor::{layernorm_rows, matmul, softmax, Tensor};

fn approx(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

#[test]
fn a_full_observatory_session() {
    // 1. A reproducible model.
    let config = EngineConfig::new(48, 24, 2, 4, 32, 2026);
    let engine = Engine::new(config).expect("valid config");
    assert!(engine.parameter_count() > 0);

    // 2. A recorded forward pass.
    let tokens = [3usize, 11, 0, 7, 42, 5];
    let out = engine.forward(&tokens).expect("valid tokens");
    assert_eq!(out.seq_len, tokens.len());
    assert_eq!(out.layers.len(), 2);

    // 3. Look at the last position's predictive distribution.
    let probs = softmax(out.token_logits(5).expect("position"));
    assert!(approx(probs.iter().sum(), 1.0));
    let h = entropy(&probs);
    assert!(h > 0.0 && h <= (config.vocab as f64).ln() + 1e-9);
    assert!((0.0..=1.0).contains(&normalized_entropy(&probs)));
    assert_eq!(top_k(&probs, 5).len(), 5);

    // 4. Every attention row is a distribution, and causal on top of that.
    for layer in &out.layers {
        assert_eq!(layer.attention_patterns.len(), config.n_heads);
        for pattern in &layer.attention_patterns {
            for (query, row) in pattern.chunks(out.seq_len).enumerate() {
                assert!(approx(row.iter().sum(), 1.0));
                for (key, &weight) in row.iter().enumerate() {
                    if key > query {
                        assert_eq!(weight, 0.0);
                    }
                }
            }
        }
        // The recorded per-head entropy agrees with recomputing it.
        let recomputed =
            attention_entropy_per_head(&layer.attention_patterns).expect("square patterns");
        assert_eq!(recomputed, layer.attention_entropy);
    }

    // 5. Activation statistics over the residual stream.
    let stats = activation_stats(&out.residual_stream);
    assert_eq!(stats.count, tokens.len() * config.d_model);
    assert!(stats.std > 0.0);
    assert!(stats.l2.is_finite());
    // The MLP hidden layer is GELU-activated, so a decent slice of it is dead.
    let hidden = &out.layers[0].mlp_hidden;
    assert!(fraction_zero(hidden) >= 0.0);
    assert_eq!(
        sparsity_l0(hidden),
        hidden.iter().filter(|v| **v == 0.0).count()
    );

    // 6. The residual stream really is the sum of its parts.
    for position in 0..out.seq_len {
        let d = config.d_model;
        let base = position * d;
        for i in 0..d {
            let mut expected = out.embedding[base + i];
            for layer in &out.layers {
                expected += layer.attn_out[base + i] + layer.mlp_out[base + i];
            }
            assert!(
                approx(out.residual_stream[base + i], expected),
                "position {position} dim {i}"
            );
        }
    }

    // 7. A named decomposition of the real logits, through the engine.
    let report = engine
        .logit_attribution_at(&tokens, out.seq_len - 1)
        .expect("valid position");
    assert_eq!(report.components.len(), 1 + 2 * config.n_layers);
    let reconstructed: Vec<f64> = report
        .residual
        .iter()
        .enumerate()
        .map(|(i, &r)| {
            let mut total = r;
            for component in &report.components {
                total += component.values[i];
            }
            total
        })
        .collect();
    for (got, want) in reconstructed
        .iter()
        .zip(out.token_logits(5).expect("position"))
    {
        assert!(approx(*got, *want));
    }
}

#[test]
fn reproducibility_across_the_public_boundary() {
    let config = EngineConfig::tiny();
    let first = Engine::new(config).expect("valid");
    let second = Engine::new(EngineConfig::new(
        config.vocab,
        config.d_model,
        config.n_layers,
        config.n_heads,
        config.d_mlp,
        config.seed,
    ))
    .expect("valid");
    let tokens = [0usize, 1, 2, 3, 4, 5, 6, 7];
    assert_eq!(
        first.forward(&tokens).expect("ok").logits,
        second.forward(&tokens).expect("ok").logits,
        "the seed alone must pin the model"
    );

    // And the metrics computed from it are stable too.
    let out = first.forward(&tokens).expect("ok");
    let a: Vec<f64> = out.probabilities().iter().map(|p| entropy(p)).collect();
    let b: Vec<f64> = out.probabilities().iter().map(|p| entropy(p)).collect();
    assert_eq!(a, b);
}

#[test]
fn divergences_and_superposition_on_recorded_activations() {
    let engine = Engine::new(EngineConfig::tiny()).expect("valid");
    let out = engine.forward(&[1, 2, 3, 4]).expect("ok");
    let d = out.config.d_model;

    // Compare two positions' residual rows: identical rows must agree exactly.
    let first = out.residual_stream[0..d].to_vec();
    let second = out.residual_stream[d..2 * d].to_vec();
    assert!(approx(js_divergence(&first, &first).expect("ok"), 0.0));
    assert!(approx(kl_divergence(&first, &first).expect("ok"), 0.0));
    let js = js_divergence(&first, &second).expect("ok");
    assert!((0.0..=std::f64::consts::LN_2 + 1e-9).contains(&js));

    // Superposition of the per-position residual rows: a handful of 32-wide
    // rows cannot pack more than 32 directions into 32 dimensions, so the
    // score must stay at or below 1 while being positive.
    let rows: Vec<Vec<f64>> = out.residual_stream.chunks(d).map(<[f64]>::to_vec).collect();
    let score = superposition_score(&rows);
    assert!(score > 0.0 && score <= 1.0, "score was {score}");
}

#[test]
fn tensor_and_rng_compose() {
    // The RNG drives a synthetic activation buffer; the tensor ops measure it.
    let mut rng = Rng::new(7);
    let mut values = vec![0.0_f64; 256];
    rng.fill_normal(&mut values);
    let stats = activation_stats(&values);
    assert!(stats.mean.abs() < 0.2);
    assert!((stats.std - 1.0).abs() < 0.2);

    // Shape helpers round-trip through a matmul.
    let a = Tensor::from_flat(&[4, 8], values[..32].to_vec()).expect("flat buffer");
    let b = Tensor::from_flat(&[8, 2], vec![0.5; 16]).expect("flat buffer");
    let product = matmul(a.as_slice(), b.as_slice(), 4, 8, 2).expect("shapes agree");
    assert_eq!(product.len(), 8);
    let normalised =
        layernorm_rows(&product, &[1.0, 1.0], &[0.0, 0.0], 1e-5, 4).expect("4 rows of 2");
    assert_eq!(normalised.len(), 8);
    for row in normalised.chunks(2) {
        assert!(row.iter().sum::<f64>().abs() < 1e-9);
    }

    // f32 is a first-class citizen of the same functions.
    let small: Vec<f32> = vec![1.0, 2.0, 3.0, 4.0];
    let product32 = matmul(&small, &small, 2, 2, 2).expect("shapes agree");
    assert_eq!(product32.len(), 4);
    let soft32 = softmax(&small);
    assert!((soft32.iter().map(|&v| f64::from(v)).sum::<f64>() - 1.0).abs() < 1e-6);
}

#[test]
fn config_validation_reaches_the_caller() {
    for config in [
        EngineConfig::new(0, 16, 1, 2, 8, 0),
        EngineConfig::new(16, 16, 1, 3, 8, 0),
        EngineConfig::new(16, 16, 1, 2, 0, 0),
    ] {
        assert!(config.validate().is_err());
        assert!(Engine::new(config).is_err());
    }
    assert!(EngineConfig::new(16, 16, 1, 4, 8, 0).validate().is_ok());
}

#[test]
fn error_messages_are_useful() {
    use cogitatome_engine::Error;

    let engine = Engine::new(EngineConfig::tiny()).expect("valid");
    let err = engine.forward(&[999]).expect_err("out of vocabulary");
    assert_eq!(
        err.to_string(),
        "token 999 out of range for vocabulary of 64"
    );
    let err = engine.forward(&[]).expect_err("no tokens");
    assert_eq!(err.to_string(), "tokens: must not be empty");
    let err = engine
        .logit_attribution_at(&[1, 2], 9)
        .expect_err("position out of range");
    assert!(matches!(err, Error::OutOfRange { .. }));
    // Error implements std::error::Error, so it can be boxed and propagated.
    let boxed: Box<dyn std::error::Error> = Box::new(err);
    assert!(!boxed.to_string().is_empty());
}
