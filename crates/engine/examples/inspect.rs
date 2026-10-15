//! A tiny "interpretability session" on the command line.
//!
//! Run it with:
//!
//! ```text
//! cargo run --example inspect -- [seed] [token, token, ...]
//! ```
//!
//! It builds a model from a seed, runs a forward pass over a token sequence,
//! and prints the numbers the observatory cares about: per-head attention
//! entropy, activation statistics and a logit attribution for the last
//! position. Because everything is seeded, the output is byte-for-byte
//! reproducible.

use cogitatome_engine::engine::{Engine, EngineConfig};
use cogitatome_engine::interp::{activation_stats, entropy, top_k};
use cogitatome_engine::tensor::softmax;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let seed: u64 = args
        .first()
        .and_then(|s| s.parse().ok())
        .unwrap_or(EngineConfig::tiny().seed);
    let tokens: Vec<usize> = if args.len() > 1 {
        args[1]
            .split(',')
            .filter_map(|t| t.trim().parse().ok())
            .collect()
    } else {
        vec![1, 7, 42, 3, 0]
    };

    let config = EngineConfig::new(96, 32, 3, 4, 64, seed);
    let engine = match Engine::new(config) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("cannot build model: {error}");
            std::process::exit(1);
        }
    };

    println!(
        "cogitatome-engine — seed {seed}, {} parameters",
        engine.parameter_count()
    );
    println!("tokens: {tokens:?}");

    let out = match engine.forward(&tokens) {
        Ok(out) => out,
        Err(error) => {
            eprintln!("forward pass failed: {error}");
            std::process::exit(1);
        }
    };

    let position = out.seq_len - 1;
    let probs = softmax(out.token_logits(position).expect("position"));
    println!("\nnext-token distribution at position {position}:");
    println!(
        "  entropy        {:8.4} nats (max {:.4})",
        entropy(&probs),
        (config.vocab as f64).ln()
    );
    print!("  top 5          ");
    for (token, prob) in top_k(&probs, 5) {
        print!(" {token}:{prob:.4}");
    }
    println!();

    for layer in &out.layers {
        println!("\nlayer {}:", layer.layer);
        for (head, value) in layer.attention_entropy.iter().enumerate() {
            println!("  head {head} entropy {value:8.4} nats");
        }
        let hidden = activation_stats(&layer.mlp_hidden);
        println!(
            "  mlp hidden     mean {:+.4} std {:.4}  dead {:.1}%",
            hidden.mean,
            hidden.std,
            100.0 * hidden.l0_fraction
        );
    }

    let report = match engine.logit_attribution_at(&tokens, position) {
        Ok(report) => report,
        Err(error) => {
            eprintln!("attribution failed: {error}");
            std::process::exit(1);
        }
    };
    println!("\nlogit attribution at position {position}:");
    for component in &report.components {
        println!(
            "  {:<10} sum {:+.4}  share {:.1}%",
            component.name,
            component.sum,
            100.0 * component.share
        );
    }
    println!(
        "  {:<10} |residual| {:.4}",
        "residual", report.residual_norm
    );
}
