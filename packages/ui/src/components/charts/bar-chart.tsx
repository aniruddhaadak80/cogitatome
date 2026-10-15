import { formatNumber, palette } from "../../lib/palette";
import {
  bandScale,
  ChartFrame,
  linearScale,
  niceDomain,
  niceTicks,
  AXIS,
  type ChartGeometry
} from "./chart-frame";

export interface BarDatum {
  label: string;
  value: number;
  /** Override the bar colour. */
  color?: string;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  /** Chart name — also the SVG `<title>`. */
  title: string;
  description?: string;
  orientation?: "vertical" | "horizontal";
  width?: number;
  height?: number;
  color?: string;
  valueFormat?: (value: number) => string;
  /** A rule with a label, e.g. a chance-level baseline. */
  reference?: { value: number; label: string };
  className?: string;
}

function Axis({
  geometry,
  value,
  ticks,
  format,
  orientation
}: {
  geometry: ChartGeometry;
  value: (input: number) => number;
  ticks: readonly number[];
  format: (input: number) => string;
  orientation: "vertical" | "horizontal";
}) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick}>
          {orientation === "vertical" ? (
            <>
              <line
                x1={geometry.x0}
                x2={geometry.x1}
                y1={value(tick)}
                y2={value(tick)}
                stroke={AXIS.grid}
                strokeWidth={0.5}
                strokeDasharray="2 3"
              />
              <text
                x={geometry.x0 - 6}
                y={value(tick)}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill={AXIS.label}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {format(tick)}
              </text>
            </>
          ) : (
            <>
              <line
                x1={value(tick)}
                x2={value(tick)}
                y1={geometry.y0}
                y2={geometry.y1}
                stroke={AXIS.grid}
                strokeWidth={0.5}
                strokeDasharray="2 3"
              />
              <text
                x={value(tick)}
                y={geometry.y1 + 12}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill={AXIS.label}
                textAnchor="middle"
                dominantBaseline="hanging"
              >
                {format(tick)}
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  );
}

/** Vertical or horizontal bars with a value axis, a zero baseline and tooltips. */
export function BarChart({
  data,
  title,
  description,
  orientation = "vertical",
  width,
  height,
  color = palette.amber,
  valueFormat = (value) => formatNumber(value, 2),
  reference,
  className
}: BarChartProps) {
  const maxValue = data.reduce((max, datum) => Math.max(max, datum.value), 0);
  const domainMax = reference ? Math.max(maxValue, reference.value) : maxValue;
  const domain = niceDomain(0, domainMax <= 0 ? 1 : domainMax, 4);

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={data.length === 0}
      className={className}
    >
      {(geometry) => {
        const bands = bandScale(data.length, [geometry.x0, geometry.x1], 0.25);
        const value =
          orientation === "vertical"
            ? linearScale([domain[0], domain[1]], [geometry.y1, geometry.y0])
            : linearScale([domain[0], domain[1]], [geometry.x0, geometry.x1]);
        const ticks = niceTicks(domain[0], domain[1], 4);

        return (
          <>
            <Axis geometry={geometry} value={value} ticks={ticks} format={valueFormat} orientation={orientation} />

            <line
              x1={orientation === "vertical" ? geometry.x0 : value(0)}
              x2={geometry.x1}
              y1={orientation === "vertical" ? geometry.y1 : geometry.y0}
              y2={geometry.y1}
              stroke={AXIS.line}
              strokeWidth={1}
            />

            {data.map((datum, index) => {
              const bandStart = bands.start(index);
              const fill = datum.color ?? color;

              return (
                <g key={`${datum.label}-${index}`}>
                  <title>{`${datum.label}: ${valueFormat(datum.value)}`}</title>
                  {orientation === "vertical" ? (
                    <>
                      <rect
                        x={bandStart}
                        y={value(datum.value)}
                        width={bands.band}
                        height={Math.max(0, geometry.y1 - value(datum.value))}
                        rx={2}
                        fill={fill}
                      />
                      <text
                        x={bands.center(index)}
                        y={geometry.y1 + 12}
                        fontSize={9}
                        fontFamily="var(--font-mono)"
                        fill={AXIS.label}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                      >
                        {datum.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={geometry.x0}
                        y={bandStart}
                        width={Math.max(0, value(datum.value) - geometry.x0)}
                        height={bands.band}
                        rx={2}
                        fill={fill}
                      />
                      <text
                        x={geometry.x0 - 6}
                        y={bands.center(index)}
                        fontSize={9}
                        fontFamily="var(--font-mono)"
                        fill={AXIS.label}
                        textAnchor="end"
                        dominantBaseline="middle"
                      >
                        {datum.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {reference ? (
              <g>
                <title>{`${reference.label}: ${valueFormat(reference.value)}`}</title>
                <line
                  x1={geometry.x0}
                  x2={geometry.x1}
                  y1={value(reference.value)}
                  y2={value(reference.value)}
                  stroke={palette.cyan}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={geometry.x1}
                  y={value(reference.value) - 4}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill={palette.cyan}
                  textAnchor="end"
                >
                  {reference.label}
                </text>
              </g>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
