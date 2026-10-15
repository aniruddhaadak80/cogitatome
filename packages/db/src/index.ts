/**
 * `@repo/db` — optional persistence.
 *
 * The app runs entirely from the deterministic in-memory engine when no
 * database is configured, so a fresh clone works with zero setup. When
 * `DATABASE_URL` is set, callers may import the Prisma client from here.
 * This module never throws at import time — it reports availability instead.
 */

export interface DbStatus {
  readonly configured: boolean;
  readonly url: string | null;
  readonly note: string;
}

/** Whether a database URL is configured via `{env:DATABASE_URL}`. */
export function dbStatus(): DbStatus {
  const url = process.env.DATABASE_URL ?? null;
  if (!url) {
    return {
      configured: false,
      url: null,
      note: "No DATABASE_URL set — using the deterministic in-memory store. Set {env:DATABASE_URL} to enable persistence."
    };
  }
  return { configured: true, url: "[redacted]", note: "Database configured via {env:DATABASE_URL}." };
}

export const DB_STATUS: DbStatus = dbStatus();
