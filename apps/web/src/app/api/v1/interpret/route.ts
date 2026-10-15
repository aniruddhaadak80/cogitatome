import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet,
  inductionAccuracy,
  logitLens,
  profileHeads,
  randomWeights
} from "@repo/core";

/**
 * `/api/v1/interpret` — run a forward pass and return the full trace.
 *
 * Deterministic: the same request always produces the same response, which is
 * why there is no cache and no clock in the output.
 */
const bodySchema = z.object({
  tokens: z.array(z.number().int().min(0).max(15)).min(1).max(32),
  model: z.enum(["induction", "random"]).default("induction")
});

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "request body is not valid JSON" } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "tokens must be an array of 1..32 integers in 0..15",
          details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
        }
      },
      { status: 422 }
    );
  }

  const { tokens, model: modelId } = parsed.data;
  const cogitatome =
    modelId === "random"
      ? new CogitatomeModel(randomWeights())
      : new CogitatomeModel(constructInductionModel());

  const started = performance.now();
  const trace = cogitatome.forward(tokens);
  const durationMs = performance.now() - started;

  const predicted = trace.logits.map((row) => argMax(Array.from(row)));
  const motif = [...new Set(tokens)].filter((t) => t > 0);

  return NextResponse.json({
    model: modelId,
    label: cogitatome.weights.label,
    config: cogitatome.config,
    tokens,
    symbols: decodeAlphabet(tokens),
    predicted,
    layers: trace.layers.map((layer) => ({
      index: layer.index,
      heads: layer.attention.length,
      attention: layer.attention,
      attnOut: layer.attnOut,
      mlpOut: layer.mlpOut
    })),
    finalResidual: trace.finalResidual,
    logits: trace.logits,
    heads: profileHeads(trace),
    logitLens: logitLens(cogitatome, trace),
    motif,
    inductionAccuracy: inductionAccuracy(predicted.slice(1), motif, 0),
    durationMs
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
