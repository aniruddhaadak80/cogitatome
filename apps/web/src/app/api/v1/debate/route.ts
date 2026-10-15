import { NextResponse } from "next/server";
import { z } from "zod";
import { debate } from "@repo/core";

/**
 * `/api/v1/debate` — a deterministic three-agent argument over a claim.
 *
 * The Interpreter proposes, the Skeptic attacks, the RedTeam proposes an
 * alternative. Same claim and seed always produce the same transcript.
 */
const bodySchema = z.object({
  claim: z.string().min(1).max(400),
  seed: z.number().int().min(0).optional()
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
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "a claim string is required",
          details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
        }
      },
      { status: 422 }
    );
  }

  const result = debate(parsed.data.claim, parsed.data.seed);
  return NextResponse.json(result);
}
