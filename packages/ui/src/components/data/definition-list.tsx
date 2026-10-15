import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface DefinitionEntry {
  term: ReactNode;
  description: ReactNode;
}

export interface DefinitionListProps {
  items: readonly DefinitionEntry[];
  /** Number of columns at `sm` and up. Defaults to 1. */
  columns?: 1 | 2;
  /** Hairlines between rows. Defaults to true. */
  divided?: boolean;
  /** Wraps the list in a pane. */
  pane?: boolean;
  className?: string;
}

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2"
} as const;

/**
 * A description list for prose-y explainers — what a term means, rather than
 * what a field is set to (that is `<KeyValue>`).
 */
export function DefinitionList({
  items,
  columns = 1,
  divided = true,
  pane = false,
  className
}: DefinitionListProps) {
  return (
    <dl className={cn("grid gap-x-8", COLUMNS[columns], className)}>
      {items.map((entry, index) => (
        <div
          key={index}
          className={cn("py-2.5", divided && "border-b border-line/70 last:border-b-0", pane && "px-3")}
        >
          <dt className="font-display text-base font-semibold text-ink">{entry.term}</dt>
          <dd className="m-0 mt-1 text-base leading-relaxed text-ink-dim">{entry.description}</dd>
        </div>
      ))}
    </dl>
  );
}
