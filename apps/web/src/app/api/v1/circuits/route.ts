import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CogitatomeModel,
  circuitToDot,
  circuitToJson,
  constructInductionModel,
  discoverCircuit,
  makeRepeated,
  pruneCircuit
} from "@repo/core";

/**
 * `/api/v1/circuits` — discover and prune the computational graph for a run.
 *
 * `format=dot` returns Graphviz so the circuit can be rendered by tooling that
 * is not this app.
 */
const querySchema = z.object({
  target: z.coerce.number().int().min(0).max(15).optional(),
  threshold: z.coerce.number().min(0).max(1).default(0.05),
  format: z.enum(["json", "dot"]).default("json")
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "invalid parameters" } }, { status: 422 });
  }

  const model = new CogitatomeModel(constructInductionModel());
  const tokens = makeRepeated([1, 2, 3, 4], 6);
  const graph = discoverCircuit(model, tokens, parsed.data.target ?? 0);
  const pruned = pruneCircuit(graph, parsed.data.threshold);

  if (parsed.data.format === "dot") {
    return new NextResponse(circuitToDot(pruned), {
      headers: { "content-type": "text/vnd.graphviz", "content-disposition": "inline; filename=circuit.dot" }
    });
  }

  return NextResponse.json({
    target: graph.targetToken,
    targetLogit: graph.targetLogit,
    threshold: parsed.data.threshold,
    nodes: pruned.nodes,
    edges: pruned.edges,
    counts: { nodes: graph.nodes.length, edges: graph.edges.length, prunedEdges: pruned.edges.length },
    json: circuitToJson(pruned)
  });
}
