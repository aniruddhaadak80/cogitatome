import { NextResponse } from "next/server";
import { z } from "zod";
import { attentionRollout, CogitatomeModel, constructInductionModel, makeRepeated, topRolloutSources } from "@repo/core";

/**
 * `/api/v1/rollout` — attention rollout across layers.
 *
 * Composes attention matrices across layers to answer: if token A attends to B
 * in layer 0, and B attends to C in layer 1, what is the effective A→C flow?
 * Returns the full graph plus pruned edges (≥ threshold).
 *
 * Query params: `model`, optional `tokens`, optional `threshold` (default 0.05),
 * optional `position` for the top sources into that position.
 */
const querySchema = z.object({
  model: z.enum(["induction", "random"]).default("induction"),
  tokens: z.string().max(300).optional(),
  threshold: z.string().regex(/^\d+(\.\d+)?$/).optional().transform((s) => s ? Number(s) : undefined),
  position: z.string().regex(/^\d+$/).optional().transform((s) => s ? Number(s) : undefined)
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "invalid parameters" } }, { status: 422 });
  }

  const { tokens: tokenParam, threshold, position } = parsed.data;
  const tokens =
    tokenParam === undefined
      ? makeRepeated([1, 2, 3, 4], 6)
      : tokenParam
          .split(",")
          .map((t) => Number.parseInt(t.trim(), 10))
          .filter((t) => Number.isInteger(t) && t >= 0 && t <= 15);

  if (tokens.length === 0 || tokens.length > 32) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "tokens must resolve to 1..32 ids in 0..15" } },
      { status: 422 }
    );
  }

  const model = new CogitatomeModel(constructInductionModel());
  const trace = model.forward(tokens);
  const graph = attentionRollout(trace, threshold ?? 0.05);

  return NextResponse.json({
    model: parsed.data.model,
    tokens,
    nodes: graph.nodes,
    edges: graph.edges,
    prunedEdges: graph.prunedEdges,
    threshold: graph.threshold,
    topSources: position !== undefined ? topRolloutSources(graph, position) : undefined
  });
}
