import { useId } from "react";
import { attentionColor, formatNumber } from "../../lib/palette";
import { ChartFrame } from "./chart-frame";

export interface AttentionMatrixChartProps {
  /** `values[queryIndex][keyIndex]` — one row per query position. */
  values: readonly (readonly number[])[];
  /** Token labels shared by both axes. */
  labels: readonly string[];
  title: string;
  description?: string;
  /** Cell size in user units. */
  cellSize?: number;
  formatValue?: (value: number) => string;
  /** Row to highlight — usually the query position under inspection. */
  focusRow?: number | null;
  /** Domain of the colour scale. Defaults to the data extent. */
  max?: number;
  className?: string;
}

const DEFAULT_FORMAT = (value: number): string => formatNumber(value, 3);

/**
 * Attention as an N×N matrix.
 *
 * Columns are keys, rows are queries, so a previous-token head shows a stripe
 * just below the diagonal and an induction head lights up the token that came
 * after this one last time. Every cell has a `<title>`, and the colour ramp is
 * the palette's attention scale with a legend underneath.
 */
export function AttentionMatrixChart({
  values,
  labels,
  title,
  description,
  cellSize = 20,
  formatValue = DEFAULT_FORMAT,
  focusRow = null,
  max,
  className
}: AttentionMatrixChartProps) {
  const rowCount = values.length;
  const columnCount = values.reduce((widest, row) => Math.max(widest, row.length), 0);
  const empty = rowCount === 0 || columnCount === 0;
  const flat = values.flatMap((row) => [...row]).filter((value) => Number.isFinite(value));
  const domainMax = max ?? (flat.length > 0 ? Math.max(...flat) : 1);
  const gradientId = `attention-scale-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const header = 16;
  const labelWidth = 92;
  const width = labelWidth + columnCount * cellSize + 4;
  const height = header + rowCount * cellSize + 36;

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
      empty={empty}
      emptyMessage="No attention to draw — the sequence is empty"
      className={className}
    >
      {() => (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
              {[0, 0.25, 0.5, 0.75, 1].map((stop) => (
                <stop key={stop} offset={`${stop * 100}%`} stopColor={attentionColor(stop)} />
              ))}
            </linearGradient>
          </defs>

          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <text
              key={`col-${labels[columnIndex] ?? columnIndex}-${columnIndex}`}
              x={labelWidth + columnIndex * cellSize + cellSize / 2}
              y={10}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink-dim)"
              textAnchor="middle"
            >
              {labels[columnIndex] ?? columnIndex}
            </text>
          ))}

          {values.map((row, rowIndex) => (
            <g key={`row-${labels[rowIndex] ?? rowIndex}-${rowIndex}`}>
              <text
                x={labelWidth - 6}
                y={header + rowIndex * cellSize + cellSize / 2}
                fontSize={8}
                fontFamily="var(--font-mono)"
                fill={focusRow === rowIndex ? "var(--color-cyan)" : "var(--color-ink-dim)"}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {labels[rowIndex] ?? rowIndex}
              </text>

              {row.map((value, columnIndex) => {
                const t = domainMax === 0 ? 0 : value / domainMax;
                const x = labelWidth + columnIndex * cellSize;
                const y = header + rowIndex * cellSize;
                const focused = focusRow === rowIndex;

                return (
                  <g key={`cell-${rowIndex}-${columnIndex}`}>
                    <rect
                      x={x + 0.5}
                      y={y + 0.5}
                      width={cellSize - 1}
                      height={cellSize - 1}
                      rx={2}
                      fill={attentionColor(Math.max(0, Math.min(1, t)))}
                      stroke={focused ? "var(--color-cyan)" : "none"}
                      strokeWidth={focused ? 1 : 0}
                    />
                    <title>{`${labels[rowIndex] ?? rowIndex} → ${labels[columnIndex] ?? columnIndex}: ${formatValue(value)}`}</title>
                  </g>
                );
              })}
            </g>
          ))}

          <g aria-hidden="true">
            <rect
              x={labelWidth}
              y={header + rowCount * cellSize + 8}
              width={Math.min(120, columnCount * cellSize)}
              height={6}
              rx={2}
              fill={`url(#${gradientId})`}
            />
            <text
              x={labelWidth}
              y={header + rowCount * cellSize + 24}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink-dim)"
            >
              0
            </text>
            <text
              x={labelWidth + Math.min(120, columnCount * cellSize)}
              y={header + rowCount * cellSize + 24}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink-dim)"
              textAnchor="end"
            >
              {formatValue(domainMax)}
            </text>
          </g>
        </>
      )}
    </ChartFrame>
  );
}
