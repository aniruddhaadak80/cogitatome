import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CogitatomeModel,
  constructInductionModel,
  decodeAlphabet
} from "@repo/core";

/**
 * `/api/v1/probes` — linear probes on the model's activations.
 *
 * The target property is "is this token the same as the one immediately before
 * it", which is exactly the signal an induction head has to read; the control is
 * a plain token identity.
 */
const bodySchema = z.object({
  tokens: z.array(z.number().int().min(0).max(15)).min(1).max(32).optional(),
  property: z.enum(["previous-token", "token-identity"]).default("previous-token")
});

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "not JSON" } }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "invalid body" } }, { status: 422 });
  }

  const { makeRepeated, probeLayers } = await import("@repo/core");
  const model = new CogitatomeModel(constructInductionModel());
  const tokens = parsed.data.tokens ?? makeRepeated([1, 2, 3, 4], 6);

  const probes = probeLayers(model, tokens, (token, index, sequence) => {
    if (parsed.data.property === "token-identity") return token === 1 ? 1 : 0;
    return index > 0 && sequence[index - 1] === token ? 1 : 0;
  });

  return NextResponse.json({
    property: parsed.data.property,
    tokens,
    symbols: decodeAlphabet(tokens),
    probes
  });
}
