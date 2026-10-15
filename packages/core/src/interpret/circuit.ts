/**
 * Circuit discovery and export.
 *
 * A circuit is the answer to "which pieces of the model, wired together, are
 * responsible for this one prediction". Concretely it is a graph with the
 * model's own components as nodes and four kinds of evidence as edges:
 *
 *  - `direct`  direct logit attribution — how much a component pushes the
 *              target logit on its own.
 *  - `residual` how much of the residual stream one stage accounts for.
 *  - `ov`      the value path: how much of a head's attention comes from each
 *              source position, i.e. what it is able to copy.
 *  - `qk`      K-composition: whether head B's key reads the subspace head A
 *              writes into. This is the edge that makes a two-layer circuit
 *              out of two unrelated heads.
 *  - `feature` the MLP's own neurons, as features of the residual.
 *
 * The graph is read out at one position (the last one by default) because a
 * logit is a statement about one position; `discoverCircuit` says which.
 */
import { dot, gelu, norm, type NumberVector } from "../math";
import type { CogitatomeModel } from "../model";
import type { CircuitEdge, CircuitGraph, CircuitNode } from "../types";
import { logitAttribution } from "./attribution";
import { tokenSymbol, type HeadRef } from "./heads";

// ---------------------------------------------------------------------------
// Node ids
// ---------------------------------------------------------------------------

const tokenId = (position: number): string => `tok${position}`;
const embedId = (position: number): string => `emb${position}`;
const headId = (layer: number, head: number): string => `L${layer}H${head}`;
const mlpId = (layer: number): string => `mlp${layer}`;
const residId = (layer: number): string => `resid${layer}`;
const featureId = (layer: number, neuron: number): string => `N${layer}.${neuron}`;
const logitId = (token: number): string => `logit${token}`;

export interface CircuitOptions {
  /** Where to read the target logit out. Defaults to the last position. */
  readonly readPosition?: number;
  /** Minimum K-composition lift for a QK edge to be reported. 1 = chance. */
  readonly qkThreshold?: number;
  /** How many MLP neurons per layer to keep as feature nodes. */
  readonly featureTop?: number;
}

const DEFAULT_QK_THRESHOLD = 1.05;
const DEFAULT_FEATURE_TOP = 8;

// ---------------------------------------------------------------------------
// K-composition
// ---------------------------------------------------------------------------

/**
 * K-composition between two heads, measured in weight space.
 *
 * Head B's key at position j is `Wk_B · x_j`, so B reads the residual through
 * the rows of `Wk_B` that belong to its slice. Head A writes to the residual
 * through the corresponding slice of `W_O A`. The score is
 *
 *     (share of B's key-reading weight that lands in A's write dimensions)
 *     ────────────────────────────────────────────────────────────────────
 *     (share of the residual those dimensions represent)
 *
 * — that is, a *lift over chance*. 1.0 means B's key is no more pointed at
 * what A writes than a random subspace of the same size would be; a random
 * model gives exactly 1.0 for every pair, and the constructed induction model
 * gives 3.0 for previous-token → induction because the previous-token head
 * writes into 16 of the 48 residual dimensions and the induction head reads
 * precisely those 16.
 *
 * JUDGEMENT CALL: this is a weight-space statement, not a claim that the two
 * heads actually interact on this stimulus. The behavioural half of the test —
 * whether B's attention really lands where A says it should — is
 * `inductionScore` in `heads.ts`.
 */
export function keyComposition(model: CogitatomeModel, from: HeadRef, to: HeadRef): number {
  const { config } = model;
  const dHead = config.dModel / config.nHeads;
  const cols = config.nHeads * dHead;
  const source = model.weights.layers[from.layer];
  const target = model.weights.layers[to.layer];
  if (!source || !target) throw new RangeError("keyComposition: layer outside the model");

  // The residual dimensions head `from` can write into.
  const writes = new Array<boolean>(config.dModel).fill(false);
  let writeCount = 0;
  for (let r = 0; r < config.dModel; r += 1) {
    for (let c = from.head * dHead; c < (from.head + 1) * dHead; c += 1) {
      if (Math.abs(source.wo[r * cols + c] ?? 0) > 0) {
        writes[r] = true;
        writeCount += 1;
        break;
      }
    }
  }

  // The key-reading weight of head `to`, and how much of it lands there.
  let total = 0;
  let inside = 0;
  for (let r = 0; r < config.dModel; r += 1) {
    for (let c = to.head * dHead; c < (to.head + 1) * dHead; c += 1) {
      const weight = target.wk[r * cols + c] ?? 0;
      total += weight * weight;
      if (writes[r]) inside += weight * weight;
    }
  }
  if (total <= 0 || writeCount === 0) return 0;
  const chance = writeCount / config.dModel;
  return inside / total / chance;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Row `index` of a row-major flat matrix, copied out as a fresh vector. */
function embeddingRow(model: CogitatomeModel, token: number): Float64Array {
  const out = new Float64Array(model.config.dModel);
  for (let d = 0; d < model.config.dModel; d += 1) {
    out[d] = model.weights.embedding[token * model.config.dModel + d] ?? 0;
  }
  return out;
}

/** One head's slice of the layer output: W_O[head] · headOut[head]. */
function headWrite(
  weights: { readonly wo: ArrayLike<number> },
  head: number,
  headOut: NumberVector,
  dModel: number,
  dHead: number
): Float64Array {
  const out = new Float64Array(dModel);
  for (let c = head * dHead; c < (head + 1) * dHead; c += 1) {
    const value = headOut[c] ?? 0;
    if (value === 0) continue;
    for (let d = 0; d < dModel; d += 1) out[d] = (out[d] ?? 0) + (weights.wo[c * dModel + d] ?? 0) * value;
  }
  return out;
}

/**
 * Build the circuit for one token at one position.
 *
 * The construction is deliberately transparent: every edge is one formula over
 * the trace and the weights, so a reader can check any single number in the
 * graph by hand. Nothing is fitted and nothing is sampled.
 */
export function discoverCircuit(
  model: CogitatomeModel,
  tokens: readonly number[],
  targetToken: number,
  options: CircuitOptions = {}
): CircuitGraph {
  const { config } = model;
  const trace = model.forward(tokens);
  const readPosition = options.readPosition ?? tokens.length - 1;
  if (!Number.isInteger(readPosition) || readPosition < 0 || readPosition >= tokens.length) {
    throw new RangeError(`discoverCircuit: read position ${readPosition} outside the sequence`);
  }
  const dHead = config.dModel / config.nHeads;
  const qkThreshold = options.qkThreshold ?? DEFAULT_QK_THRESHOLD;
  const featureTop = options.featureTop ?? DEFAULT_FEATURE_TOP;

  const direction = new Float64Array(config.dModel);
  for (let d = 0; d < config.dModel; d += 1) {
    direction[d] = model.weights.unembed[d * config.vocabSize + targetToken] ?? 0;
  }

  const nodes: CircuitNode[] = [];
  const edges: CircuitEdge[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    nodes.push({
      id: tokenId(i),
      kind: "token",
      label: `${i}:${tokenSymbol(tokens[i] ?? -1)}`,
      layer: -1,
      weight: norm(embeddingRow(model, tokens[i] ?? -1))
    });
  }

  const attribution = logitAttribution(model, trace, readPosition, targetToken);
  const inputValue = attribution.components.find((c) => c.name === "token")?.value ?? 0;
  nodes.push({
    id: embedId(readPosition),
    kind: "embed",
    label: `embed@${readPosition}`,
    layer: 0,
    weight: Math.abs(inputValue)
  });
  edges.push({
    from: tokenId(readPosition),
    to: embedId(readPosition),
    weight: inputValue,
    kind: "direct"
  });

  // ---- heads, MLPs, neurons ---------------------------------------------
  for (let l = 0; l < config.nLayers; l += 1) {
    const record = trace.layers[l];
    const weights = model.weights.layers[l];
    if (!record || !weights) continue;
    const headRow: NumberVector = record.headOut[readPosition] ?? new Float64Array(0);
    for (let h = 0; h < config.nHeads; h += 1) {
      const written = headWrite(weights, h, headRow, config.dModel, dHead);
      const value = dot(written, direction);
      nodes.push({
        id: headId(l, h),
        kind: "head",
        label: `L${l}·H${h}`,
        layer: l,
        weight: Math.abs(value)
      });
      edges.push({ from: headId(l, h), to: logitId(targetToken), weight: value, kind: "direct" });
    }
    // The OV path: what each position hands this head.
    for (let h = 0; h < config.nHeads; h += 1) {
      const rows = record.attention[h];
      if (!rows) continue;
      let mass = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row) continue;
        for (let k = 0; k < i; k += 1) mass += row[k] ?? 0;
      }
      if (mass <= 0) continue;
      for (let k = 0; k < rows.length - 1; k += 1) {
        let received = 0;
        let queries = 0;
        for (let i = k + 1; i < rows.length; i += 1) {
          received += rows[i]?.[k] ?? 0;
          queries += 1;
        }
        if (queries === 0 || received <= 0) continue;
        edges.push({
          from: tokenId(k),
          to: headId(l, h),
          weight: received / queries,
          kind: "ov"
        });
      }
    }

    // MLP neurons as features, when the layer has an MLP to speak of.
    if (model.weights.useMlp) {
      const mlpValue = dot(record.mlpOut[readPosition] ?? [], direction);
      nodes.push({ id: mlpId(l), kind: "mlp", label: `mlp${l}`, layer: l, weight: Math.abs(mlpValue) });
      edges.push({ from: mlpId(l), to: logitId(targetToken), weight: mlpValue, kind: "direct" });

      const pre = record.mlpPre[readPosition] ?? [];
      const scored: { neuron: number; value: number }[] = [];
      for (let n = 0; n < pre.length; n += 1) {
        const activation = gelu(pre[n] ?? 0);
        let value = 0;
        for (let d = 0; d < config.dModel; d += 1) {
          value += activation * ((weights.w2[n * config.dModel + d] ?? 0) * (direction[d] ?? 0));
        }
        scored.push({ neuron: n, value });
      }
      scored.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.neuron - b.neuron);
      for (const item of scored.slice(0, Math.max(0, featureTop))) {
        nodes.push({
          id: featureId(l, item.neuron),
          kind: "feature",
          label: `N${l}.${item.neuron}`,
          layer: l,
          weight: Math.abs(item.value)
        });
        edges.push({ from: featureId(l, item.neuron), to: mlpId(l), weight: item.value, kind: "feature" });
      }
    }
  }

  // ---- residual flow -----------------------------------------------------
  for (let l = 0; l < config.nLayers; l += 1) {
    const record = trace.layers[l];
    const previous = trace.layers[l - 1]?.residual[readPosition] ?? trace.ids[readPosition];
    const current = record?.residual[readPosition];
    if (!record || !current || !previous) continue;
    nodes.push({ id: residId(l), kind: "residual", label: `resid${l}`, layer: l, weight: norm(current) });
    const written = norm((record.attnOut[readPosition] ?? []).map((v, d) => v + (record.mlpOut[readPosition]?.[d] ?? 0)));
    const share = norm(current) > 0 ? written / norm(current) : 0;
    const source = l === 0 ? embedId(readPosition) : residId(l - 1);
    edges.push({ from: source, to: residId(l), weight: share, kind: "residual" });
  }

  const finalResidual = trace.finalResidual[readPosition] ?? [];
  const alignment = norm(finalResidual) > 0 ? Math.abs(dot(finalResidual, direction)) / norm(finalResidual) : 0;
  const lastResidual = trace.layers[config.nLayers - 1]?.residual[readPosition];
  if (lastResidual) {
    edges.push({ from: residId(config.nLayers - 1), to: logitId(targetToken), weight: alignment, kind: "residual" });
  }

  // ---- K-composition -----------------------------------------------------
  for (let lA = 0; lA < config.nLayers; lA += 1) {
    for (let hA = 0; hA < config.nHeads; hA += 1) {
      for (let lB = lA + 1; lB < config.nLayers; lB += 1) {
        for (let hB = 0; hB < config.nHeads; hB += 1) {
          const weight = keyComposition(model, { layer: lA, head: hA }, { layer: lB, head: hB });
          if (weight < qkThreshold) continue;
          edges.push({ from: headId(lA, hA), to: headId(lB, hB), weight, kind: "qk" });
        }
      }
    }
  }

  const targetLogit = trace.logits[readPosition]?.[targetToken] ?? 0;
  nodes.push({
    id: logitId(targetToken),
    kind: "logit",
    label: `logit(${tokenSymbol(targetToken)})`,
    layer: config.nLayers,
    weight: Math.abs(targetLogit)
  });

  return sortGraph({ nodes, edges, targetToken, targetLogit });
}

/** Deterministic order: nodes by id, edges by (from, to, kind). */
function sortGraph(graph: CircuitGraph): CircuitGraph {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
  );
  return { ...graph, nodes, edges };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Drop every edge whose magnitude is below `threshold`.
 *
 * Nodes are kept even when they end up orphaned: a node is a component the
 * model actually has, so a UI can say "this head exists and matters to
 * nothing" rather than silently hiding it. The returned graph is a new object;
 * nothing is mutated.
 */
export function pruneCircuit(graph: CircuitGraph, threshold = 0): CircuitGraph {
  const edges = graph.edges.filter((edge) => Math.abs(edge.weight) >= Math.abs(threshold));
  return { ...graph, edges };
}

/** Graphviz shape and colour per node kind, for the DOT export. */
const NODE_STYLE: Record<CircuitNode["kind"], { shape: string; color: string }> = {
  token: { shape: "ellipse", color: "#8b5cf6" },
  embed: { shape: "box", color: "#22d3ee" },
  head: { shape: "box", color: "#34d399" },
  mlp: { shape: "box", color: "#fbbf24" },
  residual: { shape: "diamond", color: "#f472b6" },
  feature: { shape: "box", color: "#f87171" },
  logit: { shape: "doubleoctagon", color: "#e879f9" }
};

const EDGE_STYLE: Record<CircuitEdge["kind"], { color: string; style: string }> = {
  direct: { color: "#34d399", style: "solid" },
  residual: { color: "#f472b6", style: "dashed" },
  ov: { color: "#8b5cf6", style: "solid" },
  qk: { color: "#22d3ee", style: "bold" },
  feature: { color: "#f87171", style: "dotted" }
};

/**
 * Graphviz DOT export.
 *
 * Exists because "paste this into a viewer" is the fastest way to share a
 * circuit with someone who does not have the app open. Deterministic ordering
 * means two runs produce byte-identical output, which is what makes a diff of
 * two circuits meaningful.
 */
export function circuitToDot(graph: CircuitGraph): string {
  const lines: string[] = ["digraph circuit {", "  rankdir=LR;", "  node [fontname=\"monospace\"];"];
  for (const node of graph.nodes) {
    const style = NODE_STYLE[node.kind];
    lines.push(
      `  "${node.id}" [label="${escapeDot(node.label)}", shape=${style.shape}, color="${style.color}"];`
    );
  }
  for (const edge of graph.edges) {
    const style = EDGE_STYLE[edge.kind];
    lines.push(
      `  "${edge.from}" -> "${edge.to}" [label="${edge.weight.toFixed(4)}", color="${style.color}", style=${style.style}];`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

function escapeDot(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** A plain, JSON-round-trippable view of the graph, for an API route. */
export interface CircuitJson {
  readonly targetToken: number;
  readonly targetLogit: number;
  readonly nodes: { id: string; kind: CircuitNode["kind"]; label: string; layer: number; weight: number }[];
  readonly edges: { from: string; to: string; weight: number; kind: CircuitEdge["kind"] }[];
}

export function circuitToJson(graph: CircuitGraph): CircuitJson {
  return {
    targetToken: graph.targetToken,
    targetLogit: graph.targetLogit,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      layer: node.layer,
      weight: node.weight
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
      kind: edge.kind
    }))
  };
}
