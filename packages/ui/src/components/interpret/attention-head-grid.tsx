import { useId, useState } from "react";
import { cn } from "../../lib/cn";
import { attentionColor, formatNumber } from "../../lib/palette";
import { ChartFrame } from "../charts/chart-frame";
import { EmptyState } from "../primitives/empty-state";
import type { HeadRole } from "../interpret/head-role-badge";
import { HeadRoleBadge } from "../interpret/head-role-badge";

export interface HeadMatrix {
  /** Stable id such as `L2H3`. */
  readonly id: string;
  readonly layer: number;
  readonly head: number;
  /** `values[query][key]`. */
  readonly values: readonly (readonly number[])[];
}

export interface AttentionHeadGridProps {
  heads: readonly HeadMatrix[];
  /** Optional classifications, keyed by head id. */
  roles?: Readonly<Record<string, HeadRole>>;
  title: string;
  description?: string;
  /** Currently selected head id. */
  selectedHead?: string | null;
  onSelectHead?: (headId: string) => void;
  /** Cell size of each mini matrix. */
  cellSize?: number;
  tokenLabels?: readonly string[];
  max?: number;
  className?: string;
}

/**
 * Every attention head at once.
 *
 * Each tile is a button (so it is keyboard reachable and announced), showing
 * that head's attention matrix at a glance. Selecting one details it elsewhere;
 * the grid never hides the rest, because the point is comparison.
 */
export function AttentionHeadGrid({
  heads,
  roles,
  title,
  description,
  selectedHead,
  onSelectHead,
  cellSize = 6,
  tokenLabels,
  max,
  className
}: AttentionHeadGridProps) {
  const uid = useId();
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = selectedHead !== undefined ? selectedHead : internalSelected;

  const domainMax =
    max ??
    heads
      .flatMap((head) => head.values.flatMap((row) => [...row]))
      .reduce((peak, value) => Math.max(peak, Number.isFinite(value) ? value : 0), 1);

  if (heads.length === 0) {
    return (
      <EmptyState
        title="No heads recorded"
        description="Run a forward pass to capture per-head attention."
        className={className}
      />
    );
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(heads.length)));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="group"
        aria-label={`${title}. ${description ?? ""}`.trim()}
      >
        {heads.map((head) => {
          const isSelected = selected === head.id;
          const size = 12 + cellSize * (tokenLabels?.length ?? 4);
          const role = roles?.[head.id];

          return (
            <button
              key={head.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`Layer ${head.layer} head ${head.head}${role ? `, ${role}` : ""}`}
              onClick={() => {
                setInternalSelected(head.id);
                onSelectHead?.(head.id);
              }}
              className={cn(
                "flex flex-col gap-1.5 rounded-panel border p-2 text-left transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                isSelected ? "border-cyan bg-cyan/5" : "border-line bg-surface-2 hover:border-indigo-3"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="mono-label">
                  L{head.layer} H{head.head}
                </span>
                {role ? <HeadRoleBadge role={role} size="sm" /> : null}
              </span>

              <ChartFrame
                title={`Attention for L${head.layer} H${head.head}`}
                description={`${head.values.length} queries by ${head.values[0]?.length ?? 0} keys`}
                width={Math.max(size, 48)}
                height={Math.max(size, 48)}
                padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                {() => (
                  <>
                    <title id={`${uid}-head-${head.id}`}>{`L${head.layer} H${head.head} attention`}</title>
                    {head.values.map((row, rowIndex) =>
                      row.map((value, columnIndex) => (
                        <rect
                          key={`${rowIndex}-${columnIndex}`}
                          x={columnIndex * cellSize}
                          y={rowIndex * cellSize}
                          width={cellSize}
                          height={cellSize}
                          fill={attentionColor(
                            domainMax === 0 ? 0 : Math.max(0, Math.min(1, (value ?? 0) / domainMax))
                          )}
                        />
                      ))
                    )}
                  </>
                )}
              </ChartFrame>
            </button>
          );
        })}
      </div>

      <p className="mono-label m-0">
        {heads.length} heads · select one to inspect · brightest cell ={" "}
        {formatNumber(domainMax, 2)}
      </p>
    </div>
  );
}
