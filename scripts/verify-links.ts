/**
 * cogitatome link verifier.
 *
 * Every URL in the corpus is a factual claim: if the link rots, the corpus page
 * starts lying to the reader. This script re-checks them on demand.
 *
 * Sources
 *   - `packages/seed/data/corpus.papers.json`  — every `url` and `pdf` field.
 *   - `packages/seed/data/corpus.media.ts`     — every http(s) string literal
 *                                               in the file, plus the X (Twitter)
 *                                               template literal, which is
 *                                               resolved from its arguments.
 *
 * Behaviour
 *   - HEAD first; a 405/501 (method not allowed) falls back to GET, because a
 *     few hosts reject HEAD outright.
 *   - 8 concurrent requests, 15s timeout each, no retries by default.
 *   - Prints a per-host summary and exits non-zero if any URL failed.
 *
 * Usage:
 *   bun scripts/verify-links.ts                  # check everything
 *   bun scripts/verify-links.ts --offline        # parse + report only, no network
 *   bun scripts/verify-links.ts --limit 50       # first N URLs
 *   bun scripts/verify-links.ts --timeout 30000  # per-request timeout in ms
 *   bun scripts/verify-links.ts --json           # machine-readable summary
 */

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const PAPERS_PATH = resolve(ROOT, "packages/seed/data/corpus.papers.json");
const MEDIA_PATH = resolve(ROOT, "packages/seed/data/corpus.media.ts");

const CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 15_000;

interface PaperEntry {
  readonly id?: unknown;
  readonly url?: unknown;
  readonly pdf?: unknown;
  readonly title?: unknown;
}

export interface LinkRecord {
  /** The URL that will be requested. */
  readonly url: string;
  /** Where it was found, e.g. `corpus.papers.json[12].pdf`. */
  readonly origin: string;
}

export interface CheckResult extends LinkRecord {
  readonly status: number | "network-error" | "skipped";
  readonly method: "HEAD" | "GET" | "-";
  readonly ok: boolean;
  readonly ms: number;
  readonly detail?: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Every absolute http(s) URL written as a quoted string literal in the file.
 * The corpus is hand-authored, so a plain literal scan is exact enough — and it
 * deliberately does not try to execute the module.
 */
export function extractQuotedUrls(source: string): string[] {
  const out: string[] = [];
  const quoted = /["'](https?:\/\/[^"'\s]+)["']/g;
  for (const m of source.matchAll(quoted)) out.push(m[1]!);
  return out;
}

/** Resolve the `tweet(...)` template literal into concrete status URLs. */
export function extractTweetUrls(source: string): string[] {
  const out: string[] = [];
  const call = /\btweet\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g;
  for (const m of source.matchAll(call)) {
    const handle = m[2]!;
    const statusId = m[3]!;
    out.push(`https://x.com/${handle}/status/${statusId}`);
  }
  return out;
}

/** Collect every checkable URL from both corpus sources, de-duplicated. */
export function collectLinks(): LinkRecord[] {
  const seen = new Map<string, LinkRecord>();

  const add = (url: unknown, origin: string): void => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!/^https?:\/\//.test(trimmed)) return;
    const key = trimmed.replace(/^http:\/\//, "https://").replace(/\/+$/, "");
    if (seen.has(key)) return;
    seen.set(key, { url: trimmed, origin });
  };

  let papers: readonly PaperEntry[] = [];
  try {
    papers = JSON.parse(readFileSync(PAPERS_PATH, "utf8")) as PaperEntry[];
  } catch (err) {
    process.stderr.write(`! cannot read ${basename(PAPERS_PATH)}: ${String(err)}\n`);
  }
  papers.forEach((entry, i) => {
    add(entry.url, `corpus.papers.json[${i}].url`);
    add(entry.pdf, `corpus.papers.json[${i}].pdf`);
  });

  try {
    const media = readFileSync(MEDIA_PATH, "utf8");
    extractQuotedUrls(media).forEach((u) => add(u, "corpus.media.ts (literal)"));
    extractTweetUrls(media).forEach((u) => add(u, "corpus.media.ts (tweet)"));
  } catch (err) {
    process.stderr.write(`! cannot read ${basename(MEDIA_PATH)}: ${String(err)}\n`);
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

async function probe(link: LinkRecord, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now();
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(link.url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "cogitatome-link-checker/1.0" }
      });
      if (res.ok) {
        return { ...link, status: res.status, method, ok: true, ms: Date.now() - started };
      }
      // 405/501 means "the host dislikes this method", not "the link is dead".
      if (res.status !== 405 && res.status !== 501) {
        return { ...link, status: res.status, method, ok: false, ms: Date.now() - started };
      }
      await res.body?.cancel();
    } catch (err) {
      const detail = err instanceof Error ? err.name : String(err);
      const timedOut = detail === "TimeoutError" || detail === "AbortError";
      return {
        ...link,
        status: "network-error",
        method,
        ok: false,
        ms: Date.now() - started,
        detail: timedOut ? "timeout" : detail
      };
    }
  }
  return {
    ...link,
    status: "network-error",
    method: "GET",
    ok: false,
    ms: Date.now() - started,
    detail: "HEAD and GET both rejected"
  };
}

/** Run `links` through the pool with at most `concurrency` in flight. */
export async function checkAll(
  links: readonly LinkRecord[],
  timeoutMs: number,
  concurrency = CONCURRENCY
): Promise<CheckResult[]> {
  const results: CheckResult[] = new Array(links.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.max(1, concurrency); w += 1) {
    workers.push(
      (async () => {
        while (cursor < links.length) {
          const i = cursor;
          cursor += 1;
          const link = links[i]!;
          results[i] = await probe(link, timeoutMs);
          if (results[i]!.ok) process.stdout.write(`  ok   ${results[i]!.status}  ${link.url}\n`);
          else process.stderr.write(`  FAIL ${results[i]!.status}  ${link.url}\n`);
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const offline = argv.includes("--offline");
const jsonOut = argv.includes("--json");
const limitArg = Number(flag("limit") ?? "0");
const timeoutMs = Math.max(1_000, Number(flag("timeout") ?? String(DEFAULT_TIMEOUT_MS)));

const all = collectLinks();
const links = limitArg > 0 ? all.slice(0, limitArg) : all;

if (links.length === 0) {
  process.stderr.write("! no links found — is the corpus present?\n");
  process.exit(1);
}

const started = Date.now();
const results: CheckResult[] = offline
  ? links.map((l) => ({ ...l, status: "skipped" as const, method: "-" as const, ok: true, ms: 0 }))
  : await checkAll(links, timeoutMs);
const elapsedMs = Date.now() - started;

const byHost = new Map<string, { ok: number; fail: number }>();
const failures: CheckResult[] = [];
for (const r of results) {
  const host = new URL(r.url).hostname.replace(/^www\./, "");
  const bucket = byHost.get(host) ?? { ok: 0, fail: 0 };
  if (r.ok) bucket.ok += 1;
  else bucket.fail += 1;
  byHost.set(host, bucket);
  if (!r.ok) failures.push(r);
}

if (jsonOut) {
  process.stdout.write(
    `${JSON.stringify(
      {
        checked: results.length,
        ok: results.length - failures.length,
        failed: failures.length,
        elapsedMs,
        hosts: Object.fromEntries([...byHost].sort((a, b) => b[1].ok + b[1].fail - (a[1].ok + a[1].fail))),
        failures: failures.map((f) => ({ url: f.url, origin: f.origin, status: f.status, detail: f.detail }))
      },
      null,
      2
    )}\n`
  );
} else {
  process.stdout.write(`\n  cogitatome link check${offline ? " (offline — parse only)" : ""}\n`);
  process.stdout.write(`  ${"host".padEnd(28)} ${"ok".padStart(6)} ${"fail".padStart(6)}\n`);
  process.stdout.write(`  ${"-".repeat(28)} ${"-".repeat(6)} ${"-".repeat(6)}\n`);
  for (const [host, v] of [...byHost].sort((a, b) => b[1].ok + b[1].fail - (a[1].ok + a[1].fail))) {
    process.stdout.write(`  ${host.padEnd(28)} ${String(v.ok).padStart(6)} ${String(v.fail).padStart(6)}\n`);
  }
  process.stdout.write(`  ${"-".repeat(28)} ${"-".repeat(6)} ${"-".repeat(6)}\n`);
  process.stdout.write(
    `  ${"TOTAL".padEnd(28)} ${String(results.length - failures.length).padStart(6)} ${String(failures.length).padStart(6)}\n`
  );
  process.stdout.write(
    `\n  ${results.length} links in ${results.length > 0 ? (elapsedMs / 1000).toFixed(1) : "0.0"}s` +
      ` · parsed from packages/seed/data/corpus.papers.json + corpus.media.ts\n`
  );
  for (const f of failures.slice(0, 20)) {
    process.stdout.write(`  FAIL ${f.url}\n       origin=${f.origin} status=${f.status} detail=${f.detail ?? "-"}\n`);
  }
  if (failures.length > 20) process.stdout.write(`  ... and ${failures.length - 20} more\n`);
}

if (offline) {
  process.stdout.write("\n  offline mode: no requests were made. Re-run without --offline to check.\n");
  process.exit(0);
}

if (failures.length > 0) {
  process.stderr.write(`\n  FAIL: ${failures.length} of ${results.length} links did not resolve.\n`);
  process.exit(1);
}
process.stdout.write("\n  PASS: every corpus link resolved.\n");
process.exit(0);
