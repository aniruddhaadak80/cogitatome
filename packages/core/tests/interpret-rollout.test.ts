import { describe, expect, it } from "vitest";
import { CogitatomeModel, constructInductionModel, makeRepeated } from "../src";
import { attentionRollout, rolloutInto, topRolloutSources } from "../src/interpret/rollout";

describe("attentionRollout", () => {
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated([1, 2, 3, 4], 2);

  it("produces a node for every position at every layer", () => {
    const graph = attentionRollout(model.forward(tokens));
    expect(graph.nodes.length).toBe(tokens.length * 2); // 2 layers
  });

  it("produces edges with positive weights", () => {
    const graph = attentionRollout(model.forward(tokens));
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(edge.weight).toBeGreaterThan(0);
    }
  });

  it("prunes edges below the threshold", () => {
    const graph = attentionRollout(model.forward(tokens), 0.1);
    for (const edge of graph.prunedEdges) {
      expect(edge.weight).toBeGreaterThanOrEqual(0.1);
    }
    expect(graph.prunedEdges.length).toBeLessThanOrEqual(graph.edges.length);
  });

  it("is deterministic — same trace gives the same graph", () => {
    const trace = model.forward(tokens);
    const a = attentionRollout(trace);
    const b = attentionRollout(trace);
    expect(a.edges).toEqual(b.edges);
  });

  it("rollout into the last position returns sources sorted by weight", () => {
    const graph = attentionRollout(model.forward(tokens));
    const sources = rolloutInto(graph, tokens.length - 1);
    expect(sources.length).toBeGreaterThan(0);
    for (let i = 1; i < sources.length; i += 1) {
      expect(sources[i - 1]!.weight).toBeGreaterThanOrEqual(sources[i]!.weight);
    }
  });

  it("topRolloutSources returns at most k sources", () => {
    const graph = attentionRollout(model.forward(tokens));
    const sources = topRolloutSources(graph, tokens.length - 1, 3);
    expect(sources.length).toBeLessThanOrEqual(3);
    expect(sources.length).toBeGreaterThan(0);
  });
});

