import { NextResponse } from "next/server";
import { z } from "zod";
import { attributionSummary, CogitatomeModel, constructInductionModel, makeRepeated, rankByAttribution, tokenAttribution } from "@repo/core";

/**
 * `/api/v1/attribution` — which input tokens matter for the prediction.
 *
 * Discrete analog of integrated gradients: for each position, replace the
 * token with the baseline (0, the anchor) and measure the change in the
 * target logit. The importance score is the absolute change, normalised so
 * the most important position scores 1.0.
 *
 * Query params: `model`, optional `tokens`, optional `targetToken`, optional
 * `targetPosition` (default: last).
 */
const querySchema = z.object({
  model: z.enum(["induction", "random"]).default("induction"),
  tokens: z.string().max(300).optional(),
  targetToken: z.string().regex(/^\d+$/).optional().transform((s) => s ? Number(s) : undefined),
  targetPosition: z.string().regex(/^\d+$/).optional().transform((s) => s ? Number(s) : undefined)
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "invalid parameters" } }, { status: 422 });
  }

  const { tokens: tokenParam, targetToken, targetPosition } = parsed.data;
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
  const targetPos = targetPosition === undefined ? tokens.length - 1 : Math.min(targetPosition, tokens.length - 1);
  const targetTok = targetToken === undefined ? tokens[targetPos] ?? 0 : Math.min(Math.max(targetToken, 0), 15);

  const report = tokenAttribution(model, tokens, targetTok, targetPos);

  return NextResponse.json({
    model: parsed.data.model,
    tokens,
    targetToken: targetTok,
    targetPosition: targetPos,
    attributions: report.attributions,
    ranked: rankByAttribution(report),
    summary: attributionSummary(report)
  });
}
