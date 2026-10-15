/**
 * `@repo/sdk` — the typed cogitatome client.
 *
 * Hand-written against `packages/sdk/src/openapi.ts` so the contract has exactly
 * one source of truth. Zero runtime dependencies: it is `fetch` plus a couple of
 * tiny helpers, which means it runs in a browser, in a Node script and in a
 * Next.js server component identically.
 */
import { z } from "zod";

export const API_VERSION = "0.1.0";
export const BASE_URL = "";

/** Machine-readable failure. Never a bare string. */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly { readonly path: readonly string[]; readonly message: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorBody["details"];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
  time: z.string().optional()
});

export type Health = z.infer<typeof healthSchema>;

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly baseUrl?: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
}

function buildUrl(path: string, query?: RequestOptions["query"], base = BASE_URL): string {
  const url = new URL(`${base}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return `${base}${path}${url.search}`;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const res = await fetch(buildUrl(path, options?.query, options?.baseUrl), {
    method,
    headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options?.signal
  });

  if (!res.ok) {
    let payload: ApiErrorBody;
    try {
      payload = (await res.json()) as ApiErrorBody;
    } catch {
      payload = { code: `http_${res.status}`, message: res.statusText || "request failed" };
    }
    throw new ApiError(res.status, payload);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}

const corpusEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  authors: z.array(z.string()).readonly(),
  year: z.number(),
  venue: z.string(),
  url: z.string(),
  oneLiner: z.string(),
  tags: z.array(z.string()).readonly()
});

export type CorpusEntryDto = z.infer<typeof corpusEntrySchema>;

const corpusSearchSchema = z.object({
  query: z.string(),
  total: z.number(),
  entries: z.array(corpusEntrySchema).readonly(),
  facets: z
    .array(z.object({ tag: z.string(), label: z.string(), count: z.number() }))
    .readonly()
});

export type CorpusSearchResultDto = z.infer<typeof corpusSearchSchema>;

const headProfileSchema = z.object({
  layer: z.number(),
  head: z.number(),
  prevTokenScore: z.number(),
  focus: z.number(),
  entropy: z.number(),
  firstTokenScore: z.number(),
  role: z.string()
});

export type HeadProfileDto = z.infer<typeof headProfileSchema>;

export const client = {
  async health(options?: RequestOptions): Promise<Health> {
    return request("GET", "/healthz", healthSchema, undefined, options);
  },

  async interpret(
    body: { readonly tokens: readonly number[]; readonly model?: "induction" | "random" },
    options?: RequestOptions
  ): Promise<unknown> {
    return request("POST", "/api/v1/interpret", z.unknown(), body, options);
  },

  async heads(
    query: { readonly model?: "induction" | "random"; readonly tokens?: string },
    options?: RequestOptions
  ): Promise<readonly HeadProfileDto[]> {
    return request("GET", "/api/v1/heads", z.array(headProfileSchema).readonly(), undefined, { ...options, query });
  },

  async searchCorpus(
    query: {
      readonly q?: string;
      readonly kind?: string;
      readonly tag?: string;
      readonly limit?: number;
      readonly offset?: number;
    },
    options?: RequestOptions
  ): Promise<CorpusSearchResultDto> {
    return request("GET", "/api/v1/corpus", corpusSearchSchema, undefined, { ...options, query });
  }
};

export type CogitatomeClient = typeof client;
