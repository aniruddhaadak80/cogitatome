import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface KeyValueEntry {
  key: ReactNode;
  value: ReactNode;
  /** Secondary text under the value. */
  note?: ReactNode;
}

export interface KeyValueProps {
  items: readonly KeyValueEntry[];
  columns?: 1 | 2 | 3;
  /** Hairlines between rows. Defaults to true. */
  divided?: boolean;
  /** Wraps the list in a pane. */
  pane?: boolean;
  className?: string;
}

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3"
} as const;

/**
 * Compact key/value rows for configuration and trace metadata.
 *
 * Keys are mono and dim, values are the readable part — the same hierarchy the
 * instrument panels use, so a config dump reads like a control surface.
 */
export function KeyValue({ items, columns = 1, divided = true, pane = false, className }: KeyValueProps) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-0", COLUMNS[columns], className)}>
      {items.map((entry, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2",
            divided && "border-b border-line/70 last:border-b-0",
            pane && "px-3"
          )}
        >
          <dt className="font-mono text-xs tracking-wide text-ink-dim uppercase">{entry.key}</dt>
          <dd className="m-0 text-right text-base text-ink">
            {entry.value}
            {entry.note ? <p className="m-0 text-xs text-ink-dim">{entry.note}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
