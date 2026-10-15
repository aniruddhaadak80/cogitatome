import { formatNumber, palette } from "../../lib/palette";
import {
  ChartFrame,
  linearScale,
  niceDomain,
  niceTicks,
  AXIS
} from "./chart-frame";

export interface ScatterPoint {
  x: number;
  y: number;
  /** Tooltip and accessible name for the point. */
  label?: string;
  /** Group key — selects the colour from `groups`. */
  group?: string;
}

export interface ScatterChartProps {
  points: readonly ScatterPoint[];
  title: string;
  description?: string;
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
  /** Colour per group, in the order they should be assigned. */
  groups?: readonly string[];
  /** Radius of the markers. */
  radius?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

const GROUP_COLORS = [palette.cyan, palette.amber, palette.violet, palette.lime, palette.rose] as const;

/** XY scatter with a numeric x and y axis, per-point tooltips and grouping. */
export function ScatterChart({
  points,
  title,
  description,
  xLabel,
  yLabel,
  width,
  height,
  groups,
  radius = 3,
  formatValue = (value) => formatNumber(value, 2),
  className
}: ScatterChartProps) {
  const usable = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const empty = usable.length === 0;

  const groupNames = groups ?? [...new Set(usable.map((point) => point.group ?? "point"))];
  const colorFor = (group: string | undefined): string => {
    const index = group ? groupNames.indexOf(group) : -1;
    return index >= 0 ? GROUP_COLORS[index % GROUP_COLORS.length] ?? palette.cyan : palette.slate;
  };

  const xs = usable.map((point) => point.x);
  const ys = usable.map((point) => point.y);
  const xDomain = niceDomain(Math.min(...xs, 0), Math.max(...xs, 1), 4);
  const yDomain = niceDomain(Math.min(...ys, 0), Math.max(...ys, 1), 4);

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={empty}
      className={className}
      legend={groupNames.map((name, index) => ({
        label: name,
        color: GROUP_COLORS[index % GROUP_COLORS.length] ?? palette.slate,
        shape: "dot"
      }))}
    >
      {(geometry) => {
        const x = linearScale([xDomain[0], xDomain[1]], [geometry.x0, geometry.x1]);
        const y = linearScale([yDomain[0], yDomain[1]], [geometry.y1, geometry.y0]);

        return (
          <>
            <g aria-hidden="true">
              {niceTicks(yDomain[0], yDomain[1], 4).map((tick) => (
                <g key={`y-${tick}`}>
                  <line x1={geometry.x0} x2={geometry.x1} y1={y(tick)} y2={y(tick)} stroke={AXIS.grid} strokeWidth={0.5} strokeDasharray="2 3" />
                  <text
                    x={geometry.x0 - 6}
                    y={y(tick)}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill={AXIS.label}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {formatValue(tick)}
                  </text>
                </g>
              ))}
              {niceTicks(xDomain[0], xDomain[1], 4).map((tick) => (
                <text
                  key={`x-${tick}`}
                  x={x(tick)}
                  y={geometry.y1 + 12}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill={AXIS.label}
                  textAnchor="middle"
                  dominantBaseline="hanging"
                >
                  {formatValue(tick)}
                </text>
              ))}
            </g>

            <line x1={geometry.x0} x2={geometry.x1} y1={geometry.y1} y2={geometry.y1} stroke={AXIS.line} strokeWidth={1} />
            <line x1={geometry.x0} x2={geometry.x0} y1={geometry.y0} y2={geometry.y1} stroke={AXIS.line} strokeWidth={1} />

            {xLabel ? (
              <text x={geometry.x1} y={geometry.y1 + 12} fontSize={9} fill={AXIS.label} textAnchor="end">
                {xLabel}
              </text>
            ) : null}
            {yLabel ? (
              <text x={geometry.x0 - 6} y={geometry.y0 - 2} fontSize={9} fill={AXIS.label} textAnchor="start">
                {yLabel}
              </text>
            ) : null}

            {usable.map((point, index) => (
              <g key={`${point.label ?? "point"}-${index}`}>
                <circle
                  cx={x(point.x)}
                  cy={y(point.y)}
                  r={radius}
                  fill={colorFor(point.group)}
                  fillOpacity={0.8}
                  stroke={palette.void}
                  strokeWidth={0.5}
                />
                <title>{`${point.label ?? `${point.group ?? "point"} ${index}`}: (${formatValue(point.x)}, ${formatValue(point.y)})`}</title>
              </g>
            ))}
          </>
        );
      }}
    </ChartFrame>
  );
}
