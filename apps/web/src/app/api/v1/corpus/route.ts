import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CORPUS,
  corpusFacets,
  corpusStats,
  searchCorpus,
  suggest
} from "@repo/core";

/**
 * `/api/v1/corpus` — offline BM25 search over the harvested corpus.
 *
 * The index is built once and memoised inside `@repo/core`; this route is a
 * thin adapter over it.
 */
const querySchema = z.object({
  q: z.string().max(400).optional(),
  kind: z.string().max(32).optional(),
  tag: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "invalid query parameters",
          details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
        }
      },
      { status: 422 }
    );
  }

  const { q, kind, tag, limit, offset } = parsed.data;

  if (!q && !kind && !tag) {
    // No query: return the facets and stats so a caller can bootstrap the UI.
    return NextResponse.json({
      query: "",
      total: CORPUS.length,
      entries: [],
      facets: corpusFacets(CORPUS, 32),
      stats: corpusStats()
    });
  }

  const result = searchCorpus(q ?? "", {
    kind: kind as never,
    tags: tag ? [tag] : undefined,
    limit,
    offset
  });

  return NextResponse.json({
    ...result,
    facets: corpusFacets(CORPUS, 16)
  });
}

/** `/api/v1/corpus/suggest` — typeahead over the index vocabulary. */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "not JSON" } }, { status: 400 });
  }
  const parsed = z.object({ q: z.string().max(200) }).safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_request", message: "q is required" } }, { status: 422 });
  }
  return NextResponse.json({ query: parsed.data.q, suggestions: suggest(parsed.data.q, 8) });
}
