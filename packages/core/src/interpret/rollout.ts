/**
 * Attention rollout — trace information flow across layers.
 *
 * Attention rollout (Syed et al., 2019) composes attention matrices across
 * layers to answer: "if token A attends to token B in layer 0, and token B
 * attends to token C in layer 1, what is the effective A→C flow?" The answer
 * is the matrix product of the per-head attention matrices, averaged over heads.
 *
 * The result is a graph of effective information flow from every position to
 * every later position. Pruning edges below a threshold gives the skeleton of
 * the circuit — which positions actually influence the final prediction.
 *
 * This complements the QK-composition analysis in `heads.ts`: QK composition
 * asks whether head B's key reads head A's output lane (a static, weight-space
 * question), while rollout asks whether attention actually flows through that
 * path on this input (a dynamic, activation-space question).
 */
import type { ForwardTrace, RolloutEdge, RolloutGraph, RolloutNode } from "../types";

/**
 * Build the attention rollout graph from a trace.
 *
 * The rollout matrix at layer L is: A_L · A_{L-1} · ... · A_0, where A_l is the
 * per-head-averaged attention matrix at layer l. The entry [i][j] is the
 * effective attention from position j to position i after composing all layers.
 *
 * @param trace The forward pass trace.
 * @param threshold Edges below this weight are pruned. Default 0.05.
 * @param startLayer First layer to compose (default 0).
 */
export function attentionRollout(
  trace: ForwardTrace,
  threshold = 0.05,
  startLayer = 0
): RolloutGraph {
  const seq = trace.tokens.length;
  const nLayers = trace.config.nLayers;
  const nodes: RolloutNode[] = [];
  const edges: RolloutEdge[] = [];

  // Create a node for every position at every layer.
  for (let l = 0; l < nLayers; l += 1) {
    for (let p = 0; p < seq; p += 1) {
      nodes.push({
        id: `L${l}:P${p}`,
        label: `L${l} P${p} "${trace.tokens[p] ?? "?"}"`,
        layer: l,
        position: p
      });
    }
  }

  // Compute the composed attention matrix.
  // composed[l] = A_l · composed[l-1], starting from identity at startLayer.
  let composed: number[][] | null = null;

  for (let l = startLayer; l < nLayers; l += 1) {
    const record = trace.layers[l];
    if (!record) continue;

    // Average attention over heads for this layer.
    const avg = new Array<number[]>(seq);
    for (let i = 0; i < seq; i += 1) {
      avg[i] = new Array<number>(seq).fill(0);
    }
    const nHeads = record.attention.length;
    for (let h = 0; h < nHeads; h += 1) {
      const rows = record.attention[h];
      if (!rows) continue;
      for (let i = 0; i < seq; i += 1) {
        const row = rows[i];
        if (!row) continue;
        for (let j = 0; j <= i; j += 1) {
          avg[i]![j] = (avg[i]![j] ?? 0) + (row[j] ?? 0) / nHeads;
        }
      }
    }

    if (composed === null) {
      composed = avg;
    } else {
      // composed = avg · composed
      const next = new Array<number[]>(seq);
      for (let i = 0; i < seq; i += 1) {
        next[i] = new Array<number>(seq).fill(0);
      }
      for (let i = 0; i < seq; i += 1) {
        for (let j = 0; j <= i; j += 1) {
          let sum = 0;
          for (let k = j; k <= i; k += 1) {
            sum += (avg[i]?.[k] ?? 0) * (composed[k]?.[j] ?? 0);
          }
          next[i]![j] = sum;
        }
      }
      composed = next;
    }
  }

  if (!composed) {
    return { nodes, edges, prunedEdges: [], threshold };
  }

  // Build edges from the final composed matrix (flow into the last position
  // is what matters for the prediction, but we expose all edges).
  for (let i = 0; i < seq; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      const weight = composed[i]?.[j] ?? 0;
      if (weight > 0.001) {
        const edge: RolloutEdge = {
          from: `L0:P${j}`,
          to: `L${nLayers - 1}:P${i}`,
          weight
        };
        edges.push(edge);
      }
    }
  }

  const prunedEdges = edges.filter((e) => e.weight >= threshold);

  return { nodes, edges, prunedEdges, threshold };
}

/**
 * Rollout edges that flow *into* a specific position — the inputs that
 * position effectively reads from across all layers.
 */
export function rolloutInto(graph: RolloutGraph, position: number): RolloutEdge[] {
  const target = `L${Math.max(...graph.nodes.map((n) => n.layer), 0)}:P${position}`;
  return graph.edges
    .filter((e) => e.to === target)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * The top-k positions by rollout weight into a position — "what does this
 * position actually read?"
 */
export function topRolloutSources(
  graph: RolloutGraph,
  position: number,
  k = 5
): readonly { readonly position: number; readonly weight: number }[] {
  return rolloutInto(graph, position)
    .slice(0, k)
    .map((e) => {
      const match = e.from.match(/P(\d+)/);
      return { position: match ? parseInt(match[1]!, 10) : -1, weight: e.weight };
    });
}
