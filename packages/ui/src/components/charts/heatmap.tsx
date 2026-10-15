import { attentionColor, formatNumber } from "../../lib/palette";
import { ChartFrame } from "./chart-frame";

export interface HeatmapProps {
  /** Row labels — usually neurons or keys. */
  rows: readonly string[];
  /** Column labels — usually positions or queries. */
  columns: readonly string[];
  /** `values[rowIndex][columnIndex]`. Ragged rows are tolerated. */
  values: readonly (readonly number[])[];
  title: string;
  description?: string;
  /** Domain of the colour scale. Defaults to the data extent. */
  min?: number;
  max?: number;
  /** 0..1 → colour. Defaults to the attention ramp. */
  colorScale?: (value: number) => string;
  /** Cell size in user units. */
  cellSize?: number;
  formatValue?: (value: number) => string;
  /** Width of the row-label gutter. */
  labelWidth?: number;
  className?: string;
}

const DEFAULT_FORMAT = (value: number): string => formatNumber(value, 3);

/**
 * A generic row × column heat matrix — neurons × positions, layers × heads,
 * heads × heads. Every cell carries a `<title>` so a hover or a screen-reader
 * sweep yields the exact number.
 */
export function Heatmap({
  rows,
  columns,
  values,
  title,
  description,
  min,
  max,
  colorScale = attentionColor,
  cellSize = 18,
  formatValue = DEFAULT_FORMAT,
  labelWidth = 88,
  className
}: HeatmapProps) {
  const empty = rows.length === 0 || columns.length === 0;
  const flat = values.flatMap((row) => [...row]).filter((value) => Number.isFinite(value));
  const domainMin = min ?? (flat.length > 0 ? Math.min(...flat) : 0);
  const domainMax = max ?? (flat.length > 0 ? Math.max(...flat) : 1);
  const span = domainMax - domainMin;

  const header = 12;
  const width = labelWidth + columns.length * cellSize + 4;
  const height = header + rows.length * cellSize + 4;

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
      empty={empty}
      emptyMessage="No matrix to draw — the trace is empty"
      className={className}
    >
      {() => (
        <>
          {columns.map((label, columnIndex) => (
            <text
              key={`col-${label}-${columnIndex}`}
              x={labelWidth + columnIndex * cellSize + cellSize / 2}
              y={8}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink-dim)"
              textAnchor="middle"
            >
              {label}
            </text>
          ))}

          {rows.map((label, rowIndex) => (
            <g key={`row-${label}-${rowIndex}`}>
              <text
                x={labelWidth - 6}
                y={header + rowIndex * cellSize + cellSize / 2}
                fontSize={8}
                fontFamily="var(--font-mono)"
                fill="var(--color-ink-dim)"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {label}
              </text>

              {columns.map((columnLabel, columnIndex) => {
                const value = values[rowIndex]?.[columnIndex] ?? 0;
                const t = span === 0 ? 0 : (value - domainMin) / span;
                const cellX = labelWidth + columnIndex * cellSize;
                const cellY = header + rowIndex * cellSize;

                return (
                  <g key={`cell-${label}-${columnLabel}`}>
                    <rect
                      x={cellX + 0.5}
                      y={cellY + 0.5}
                      width={cellSize - 1}
                      height={cellSize - 1}
                      rx={2}
                      fill={colorScale(Math.max(0, Math.min(1, t)))}
                    />
                    <title>{`${label} × ${columnLabel}: ${formatValue(value)}`}</title>
                  </g>
                );
              })}
            </g>
          ))}
        </>
      )}
    </ChartFrame>
  );
}
