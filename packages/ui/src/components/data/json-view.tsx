import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/palette";

export interface JsonViewProps {
  data: unknown;
  /** How many levels start expanded. Defaults to 1. */
  defaultDepth?: number;
  /** Accessible name for the tree. */
  label?: string;
  /** Renders the tree inside a pane with a mono header. */
  pane?: boolean;
  maxHeight?: string | number;
  className?: string;
}

const TYPE_COLORS: Record<string, string> = {
  string: "text-amber",
  number: "text-cyan",
  boolean: "text-violet",
  null: "text-slate",
  object: "text-ink-dim",
  array: "text-ink-dim",
  undefined: "text-slate"
};

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function renderScalar(value: unknown): ReactNode {
  const type = typeOf(value);
  if (type === "string") return <span className={TYPE_COLORS.string}>&quot;{String(value)}&quot;</span>;
  if (type === "number") return <span className={TYPE_COLORS.number}>{formatNumber(value as number, 6)}</span>;
  if (type === "boolean") return <span className={TYPE_COLORS.boolean}>{String(value)}</span>;
  if (type === "null") return <span className={TYPE_COLORS.null}>null</span>;
  return <span className="text-slate">{String(value)}</span>;
}

function Node({ label, value, depth, defaultDepth }: { label: string | null; value: unknown; depth: number; defaultDepth: number }) {
  const type = typeOf(value);
  const container = type === "array" || type === "object";
  const [open, setOpen] = useState(depth < defaultDepth);

  if (!container) {
    return (
      <li className="flex gap-2 py-0.5">
        {label !== null ? <span className="text-ink-dim">{label}:</span> : null}
        {renderScalar(value)}
      </li>
    );
  }

  const entries: [string, unknown][] =
    type === "array"
      ? (value as unknown[]).map((item, index) => [String(index), item])
      : Object.entries(value as Record<string, unknown>);

  const summary = type === "array" ? `${entries.length} items` : `${entries.length} keys`;

  return (
    <li className="py-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex items-center gap-1 rounded-cell font-mono text-xs text-ink-dim transition-colors duration-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
      >
        <span aria-hidden="true" className="inline-block w-2 text-center">
          {open ? "▾" : "▸"}
        </span>
        {label !== null ? <span className="text-ink-dim">{label}:</span> : null}
        <span className="text-slate">
          {type} · {summary}
        </span>
      </button>
      {open ? (
        <ul className="m-0 list-none border-l border-line pl-3">
          {entries.map(([key, item]) => (
            <Node key={key} label={key} value={item} depth={depth + 1} defaultDepth={defaultDepth} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * An inspectable JSON tree.
 *
 * Objects and arrays collapse behind real buttons (`aria-expanded`), and each
 * scalar is coloured by type, so a trace is scannable without reading it.
 */
export function JsonView({
  data,
  defaultDepth = 1,
  label = "JSON data",
  pane = false,
  maxHeight,
  className
}: JsonViewProps) {
  const uid = useId();

  return (
    <div
      id={`json-view-${uid}`}
      className={cn(
        "overflow-auto font-mono text-xs leading-relaxed",
        pane && "pane p-3",
        className
      )}
      style={maxHeight !== undefined ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight } : undefined}
    >
      <ul role="list" aria-label={label} className="m-0 list-none p-0">
        <Node label={null} value={data} depth={0} defaultDepth={defaultDepth} />
      </ul>
    </div>
  );
}
