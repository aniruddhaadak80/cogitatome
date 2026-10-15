import { formatNumber, palette } from "../../lib/palette";
import { ChartFrame } from "./chart-frame";

export interface RadarAxis {
  label: string;
  value: number;
}

export interface RadarChartProps {
  axes: readonly RadarAxis[];
  title: string;
  description?: string;
  size?: number;
  /** Value that maps to the outer ring. Defaults to 1 (or the data max). */
  max?: number;
  /** Accessible name of the series, used by the legend and tooltips. */
  seriesLabel?: string;
  className?: string;
}

/** A polygon over a polar grid — good for a handful of comparable scores. */
export function RadarChart({
  axes,
  title,
  description,
  size = 240,
  max,
  seriesLabel = "score",
  className
}: RadarChartProps) {
  const empty = axes.length === 0;
  const radius = size / 2 - 28;
  const cx = size / 2;
  const cy = size / 2;
  const dataMax = axes.reduce((peak, axis) => Math.max(peak, Math.abs(axis.value)), 0);
  const domainMax = max ?? (dataMax > 0 ? dataMax : 1);

  const point = (index: number, value: number): readonly [number, number] => {
    const angle = (index / Math.max(1, axes.length)) * Math.PI * 2 - Math.PI / 2;
    const r = (Math.max(0, Math.min(value, domainMax)) / domainMax) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const polygon = axes
    .map((axis, index) => {
      const [x, y] = point(index, Math.abs(axis.value));
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <ChartFrame
      title={title}
      description={description}
      width={size}
      height={size}
      empty={empty}
      emptyMessage="A radar needs at least three axes"
      className={className}
      legend={[{ label: seriesLabel, color: palette.amber, shape: "rect" }]}
    >
      {() => (
        <>
          {rings.map((ring) => (
            <polygon
              key={ring}
              points={axes
                .map((_, index) => {
                  const [x, y] = point(index, ring * domainMax);
                  return `${x.toFixed(2)} ${y.toFixed(2)}`;
                })
                .join(" ")}
              fill="none"
              stroke={palette.indigo2}
              strokeWidth={0.6}
            />
          ))}

          {axes.map((axis, index) => {
            const [x, y] = point(index, domainMax);
            return (
              <line
                key={`spoke-${axis.label}-${index}`}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={palette.indigo2}
                strokeWidth={0.6}
              />
            );
          })}

          <polygon points={polygon} fill={palette.amber} fillOpacity={0.2} stroke={palette.amber} strokeWidth={1.5} />

          {axes.map((axis, index) => {
            const [x, y] = point(index, Math.abs(axis.value));
            return (
              <g key={`point-${axis.label}-${index}`}>
                <circle cx={x} cy={y} r={2.4} fill={palette.amber} />
                <title>{`${axis.label}: ${formatNumber(Math.abs(axis.value), 3)} (max ${formatNumber(domainMax, 3)})`}</title>
              </g>
            );
          })}

          {axes.map((axis, index) => {
            const [x, y] = point(index, domainMax * 1.14);
            return (
              <text
                key={`label-${axis.label}-${index}`}
                x={x}
                y={y}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill="var(--color-ink-dim)"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {axis.label}
              </text>
            );
          })}
        </>
      )}
    </ChartFrame>
  );
}
