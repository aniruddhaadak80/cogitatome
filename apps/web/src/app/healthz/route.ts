import { NextResponse } from "next/server";

/**
 * Liveness probe. Deliberately dependency-free so it works before the engine,
 * the corpus index and the polyglot services are warm.
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      service: "cogitatome-web",
      version: "0.1.0",
      time: new Date().toISOString()
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
