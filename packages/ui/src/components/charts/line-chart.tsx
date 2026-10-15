import { formatNumber, palette } from "../../lib/palette";
import {
  bandScale,
  ChartFrame,
  linePath,
  linearScale,
  niceDomain,
  niceTicks,
  AXIS
} from "./chart-frame";

export interface LineSeries {
  label: string;
  values: readonly number[];
  color?: string;
}

export interface LineChartProps {
  /** One label per x position. */
  labels: readonly string[];
  series: readonly LineSeries[];
  title: string;
  description?: string;
  width?: number;
  height?: number;
  /** Draw a marker at every point. */
  dots?: boolean;
  valueFormat?: (value: number) => string;
  className?: string;
}

const SERIES_COLORS = [palette.cyan, palette.amber, palette.violet, palette.lime, palette.rose] as const;

function colorAt(index: number, override?: string): string {
  return override ?? SERIES_COLORS[index % SERIES_COLORS.length] ?? palette.cyan;
}

/** Multi-series line chart with a numeric y-axis and a categorical x-axis. */
export function LineChart({
  labels,
  series,
  title,
  description,
  width,
  height,
  dots = false,
  valueFormat = (value) => formatNumber(value, 3),
  className
}: LineChartProps) {
  const empty =
    series.length === 0 ||
    labels.length === 0 ||
    series.every((entry) => entry.values.every((value) => !Number.isFinite(value)));
  const allValues = series.flatMap((entry) => [...entry.values]).filter((value) => Number.isFinite(value));
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const domain = niceDomain(Math.min(0, minValue), maxValue, 4);
  const stride = Math.max(1, Math.ceil(labels.length / 14));

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={empty}
      className={className}
      legend={series.map((entry, index) => ({
        label: entry.label,
        color: colorAt(index, entry.color),
        shape: "line"
      }))}
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

            {series.map((entry, seriesIndex) => {
              const color = colorAt(seriesIndex, entry.color);
              const points = entry.values
                .map((value, index) => [bands.center(index), y(Number.isFinite(value) ? value : 0)] as const)
                .filter((point): point is readonly [number, number] => point[0] !== undefined && point[1] !== undefined);

              return (
                <g key={entry.label}>
                  <title>{`${entry.label}: ${entry.values.map((value) => valueFormat(value)).join(", ")}`}</title>
                  <path
                    d={linePath(points)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {dots
                    ? points.map((point, index) => (
                        <circle
                          key={index}
                          cx={point[0]}
                          cy={point[1]}
                          r={2.4}
                          fill={color}
                          stroke={palette.void}
                          strokeWidth={0.6}
                        />
                      ))
                    : null}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
