import { formatNumber, palette } from "../../lib/palette";
import {
  bandScale,
  ChartFrame,
  areaPath,
  linearScale,
  niceDomain,
  niceTicks,
  AXIS
} from "./chart-frame";

export interface AreaSeries {
  label: string;
  values: readonly number[];
  color?: string;
}

export interface AreaChartProps {
  /** One label per x position. */
  labels: readonly string[];
  series: readonly AreaSeries[];
  title: string;
  description?: string;
  /**
   * Stack the series (each one drawn on top of the running total) instead of
   * overlapping them from a shared baseline.
   */
  stacked?: boolean;
  width?: number;
  height?: number;
  valueFormat?: (value: number) => string;
  className?: string;
}

const SERIES_COLORS = [palette.cyan, palette.violet, palette.amber, palette.lime, palette.rose] as const;

/** Area chart — overlapping by default, stacked on request. */
export function AreaChart({
  labels,
  series,
  title,
  description,
  stacked = false,
  width,
  height,
  valueFormat = (value) => formatNumber(value, 3),
  className
}: AreaChartProps) {
  const empty = series.length === 0 || labels.length === 0;

  const layers = series.map((entry, index) => {
    let runningTotal = 0;
    const values = entry.values.map((value) => {
      const safe = Number.isFinite(value) ? value : 0;
      runningTotal += safe;
      return stacked ? runningTotal : safe;
    });
    return {
      label: entry.label,
      values,
      color: entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length] ?? palette.cyan
    };
  });

  const allValues = layers.flatMap((layer) => layer.values);
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const minValue = stacked ? 0 : Math.min(0, allValues.length > 0 ? Math.min(...allValues) : 0);
  const domain = niceDomain(minValue, maxValue <= 0 ? 1 : maxValue, 4);
  const stride = Math.max(1, Math.ceil(labels.length / 14));

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={empty}
      className={className}
      legend={layers.map((layer) => ({ label: layer.label, color: layer.color, shape: "rect" }))}
    >
      {(geometry) => {
        const bands = bandScale(labels.length, [geometry.x0, geometry.x1]);
        const y = linearScale([domain[0], domain[1]], [geometry.y1, geometry.y0]);
        const ticks = niceTicks(domain[0], domain[1], 4);

        return (
          <>
            <g aria-hidden="true">
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={geometry.x0}
                    x2={geometry.x1}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={AXIS.grid}
                    strokeWidth={0.5}
                    strokeDasharray="2 3"
                  />
                  <text
                    x={geometry.x0 - 6}
                    y={y(tick)}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill={AXIS.label}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {valueFormat(tick)}
                  </text>
                </g>
              ))}
            </g>

            <line x1={geometry.x0} x2={geometry.x1} y1={geometry.y1} y2={geometry.y1} stroke={AXIS.line} strokeWidth={1} />

            <g aria-hidden="true">
              {labels.map((label, index) =>
                index % stride === 0 ? (
                  <text
                    key={`${label}-${index}`}
                    x={bands.center(index)}
                    y={geometry.y1 + 12}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill={AXIS.label}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                  >
                    {label}
                  </text>
                ) : null
              )}
            </g>

            {layers.map((layer) => {
              const points = layer.values.map(
                (value, index) => [bands.center(index), y(value)] as const
              );
              const baseline = stacked ? y(0) : geometry.y1;

              return (
                <g key={layer.label}>
                  <title>{`${layer.label}: ${layer.values.map(valueFormat).join(", ")}`}</title>
                  <path
                    d={areaPath(points, baseline)}
                    fill={layer.color}
                    fillOpacity={0.28}
                    stroke={layer.color}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
