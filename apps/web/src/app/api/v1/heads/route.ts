import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CogitatomeModel,
  constructInductionModel,
  inductionAccuracy,
  makeRepeated,
  profileHeads
} from "@repo/core";

/**
 * `/api/v1/heads` — profile every attention head of a run.
 *
 * This is the endpoint the dissect view polls, and the one a skeptic would hit
 * to check that the induction head is really where the UI says it is.
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
  const trace = model.forward(tokens);
  const heads = profileHeads(trace);
  const predicted = trace.logits.map((row) => argMax(Array.from(row)));

  return NextResponse.json({
    model: parsed.data.model,
    tokens,
    heads,
    predicted,
    inductionAccuracy: inductionAccuracy(predicted.slice(1), [1, 2, 3, 4], 0)
  });
}

function argMax(row: readonly number[]): number {
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < row.length; i += 1) {
    if ((row[i] ?? 0) > bestValue) {
      bestValue = row[i] ?? 0;
      best = i;
    }
  }
  return best;
}
