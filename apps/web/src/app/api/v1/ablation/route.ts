import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ablationSweep,
  CogitatomeModel,
  constructInductionModel,
  makeRepeated,
  rankByImportance
} from "@repo/core";

/**
 * `/api/v1/ablation` — remove every head, one at a time, and rank them.
 *
 * The standard first-pass causal analysis: which heads does the model actually
 * need for its prediction? Importance is measured as the drop in top logit at
 * the final position when the head's output gain is zeroed.
 *
 * Query params: `model=induction|random`, optional `tokens` (comma-separated).
 * POST with `{tokens?}` for future-proofing.
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

  const { tokens: tokenParam } = parsed.data;
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
  const sweep = ablationSweep(model, tokens);

  return NextResponse.json({
    model: parsed.data.model,
    tokens,
    sweep: sweep.rows,
    mostImportant: sweep.mostImportant,
    leastImportant: sweep.leastImportant,
    ranked: rankByImportance(sweep),
    baselineTopLogit: sweep.rows[0]?.baselineTopLogit ?? 0
  });
}
