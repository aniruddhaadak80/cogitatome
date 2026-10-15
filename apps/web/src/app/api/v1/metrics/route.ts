import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CogitatomeModel,
  allMetrics,
  constructInductionModel,
  makeRepeated,
  randomWeights
} from "@repo/core";

/**
 * `/api/v1/metrics` — the whole interpretability metric battery in one object.
 *
 * One forward pass, every number: mean attention entropy, head role counts,
 * MLP sparsity, superposition score, induction strength and the winner, plus
 * the top-logit stability series. This is the endpoint the landing page's
 * "audit the engine itself" capability points at.
 */
const querySchema = z.object({
  model: z.enum(["induction", "random"]).default("induction"),
  tokens: z.string().max(300).optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "invalid parameters" } }, { status: 422 });
  }

  const { tokens: tokenParam, model: modelId } = parsed.data;
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

  const model =
    modelId === "random"
      ? new CogitatomeModel(randomWeights())
      : new CogitatomeModel(constructInductionModel());

  return NextResponse.json({
    model: modelId,
    label: model.weights.label,
    tokens,
    ...allMetrics(model, tokens)
  });
}
