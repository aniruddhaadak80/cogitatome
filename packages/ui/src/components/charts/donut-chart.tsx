import { formatPercent, palette } from "../../lib/palette";
import { ChartFrame } from "./chart-frame";

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: readonly DonutSlice[];
  title: string;
  description?: string;
  size?: number;
  /** Ring thickness. Defaults to a readable 22 units. */
  thickness?: number;
  /** Text in the middle of the ring. */
  centreLabel?: string;
  centreValue?: string;
  className?: string;
}

const SERIES_COLORS = [palette.cyan, palette.amber, palette.violet, palette.lime, palette.rose] as const;

function donutArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  if (endAngle - startAngle <= 0) return "";
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + outerRadius * Math.cos(startAngle);
  const y1 = cy + outerRadius * Math.sin(startAngle);
  const x2 = cx + outerRadius * Math.cos(endAngle);
  const y2 = cy + outerRadius * Math.sin(endAngle);
  const x3 = cx + innerRadius * Math.cos(endAngle);
  const y3 = cy + innerRadius * Math.sin(endAngle);
  const x4 = cx + innerRadius * Math.cos(startAngle);
  const y4 = cy + innerRadius * Math.sin(startAngle);

  return [
    `M${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A${outerRadius} ${outerRadius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A${innerRadius} ${innerRadius} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z"
  ].join(" ");
}

/** A part-to-whole ring. Slices are real `<path>` arcs, each with a tooltip. */
export function DonutChart({
  data,
  title,
  description,
  size = 220,
  thickness = 22,
  centreLabel,
  centreValue,
  className
}: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 2;
  const innerRadius = Math.max(1, outerRadius - thickness);

  let angle = -Math.PI / 2;
  const arcs = data.map((slice, index) => {
    const sweep = total > 0 ? (Math.max(0, slice.value) / total) * Math.PI * 2 : 0;
    const path = donutArc(cx, cy, outerRadius, innerRadius, angle, angle + sweep);
    angle += sweep;
    return {
      slice,
      path,
      color: slice.color ?? SERIES_COLORS[index % SERIES_COLORS.length] ?? palette.cyan,
      share: total > 0 ? Math.max(0, slice.value) / total : 0
    };
  });

  return (
    <ChartFrame
      title={title}
      description={description}
      width={size}
      height={size}
      empty={total <= 0}
      emptyMessage="No values to divide"
      className={className}
      legend={arcs.map((arc) => ({
        label: arc.slice.label,
        color: arc.color,
        value: formatPercent(arc.share, 0)
      }))}
    >
      {() => (
        <>
          {arcs.map((arc, index) =>
            arc.path.length === 0 ? null : (
              <g key={`${arc.slice.label}-${index}`}>
                <path d={arc.path} fill={arc.color} fillOpacity={0.85} stroke="var(--color-surface)" strokeWidth={1} />
                <title>{`${arc.slice.label}: ${formatPercent(arc.share, 1)}`}</title>
              </g>
            )
          )}

          {centreValue ? (
            <text
              x={cx}
              y={centreLabel ? cy - 4 : cy}
              fontSize={18}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {centreValue}
            </text>
          ) : null}
          {centreLabel ? (
            <text
              x={cx}
              y={centreValue ? cy + 14 : cy}
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--color-ink-dim)"
              textAnchor="middle"
            >
              {centreLabel}
            </text>
          ) : null}
        </>
      )}
    </ChartFrame>
  );
}
