/**
 * `@repo/core` — the cogitatome interpretability engine.
 *
 * The public surface is deliberately narrow: the tensor maths, the two models,
 * the analysis toolkit, the domain modules, and nothing else. Everything here
 * is pure and deterministic, which is what lets a server component run a full
 * forward pass and hand the trace to the UI without an API key anywhere.
 */
export * from "./types";
export * from "./math";
export * from "./rng";
export * from "./tokenizer";
export * from "./model";
export * from "./interpret";
export * from "./domain";
