/**
 * The interpretability toolkit.
 *
 * Eight modules, one dependency direction, and no I/O anywhere:
 *
 *   heads       — what each attention head looks at, and what it costs to remove
 *   attribution — the logit lens and direct logit attribution
 *   activation  — neuron atlases, heatmaps, residual similarity
 *   probes      — logistic probes, trained for real
 *   patching    — residual patching, sweeps, head knockouts
 *   circuit     — circuit discovery and export
 *   metrics     — the scalar summaries an API returns
 *   sae         — a sparse autoencoder over the MLP pre-activations
 *
 * Everything is a pure function of a `ForwardTrace` and (where needed) a
 * `CogitatomeModel`, so the whole toolkit is reproducible and safe to run in a
 * server component.
 */

export * from "./heads";
export * from "./attribution";
export * from "./activation";
export * from "./probes";
export * from "./patching";
export * from "./circuit";
export * from "./metrics";
export * from "./sae";
