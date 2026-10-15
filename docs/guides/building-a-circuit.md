# Building a circuit

A circuit is the subgraph that carries out one computation: nodes are the
model's own components, edges are measured evidence. This guide builds the
induction circuit three ways and checks they agree.

## The three evidences

1. **Direct logit attribution.** Decompose the target logit into per-component
   contributions: `logit = unembedᵀ·(embed + Σ attnOut + Σ mlpOut)`. Each term
   is a component; the induction head's term should dominate.
2. **QK composition.** `keyComposition` in weight space: how much of head B's
   key-reading weight lands in the dimensions head A writes. Lift over chance;
   3.0 for L0.H0 → L1.H0, 1.0 for random pairs.
3. **Behaviour.** The induction mass from the attention patterns (0.69) and the
   ablation result (accuracy collapses without L1.H0).

One evidence is a hint. Three agreeing is a circuit.

## In the UI

[/circuits](http://localhost:3000/circuits) builds the graph with
`discoverCircuit`, prunes edges under 0.05, and draws the rest with stroke
width encoding weight. The ground truth is stated on the page —
`L0.H0 → L1.H0 → logit` — because the weights are analytic. If discovery stops
finding that edge, the tool is broken, not the model.

## Export

- `GET /api/v1/circuits?format=json` — the pruned graph plus counts.
- `GET /api/v1/circuits?format=dot` — Graphviz DOT for external viewers.
- `circuitToJson` — the serialisable shape the API returns.

Pruning never adds edges and never mutates: `pruneCircuit` returns a new
graph. Nodes are kept even when orphaned — "this head exists and matters to
nothing" is information.

## The honest limit

This circuit has two layers and no MLP. Production circuits have dozens of
both, and discovery there is an open problem (see the corpus tag
`circuits`). The lab teaches the method on the case where the answer is
known, so you can tell when the method works.
