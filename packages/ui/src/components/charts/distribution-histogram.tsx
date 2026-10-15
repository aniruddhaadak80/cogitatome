import { formatNumber, palette, withAlpha } from "../../lib/palette";
import { bandScale, ChartFrame, linearScale, niceTicks, AXIS } from "./chart-frame";

export interface HistogramMarker {
  value: number;
  label: string;
  color?: string;
}

export interface DistributionHistogramProps {
  values: readonly number[];
  title: string;
  description?: string;
  /** Number of equal-width bins. Defaults to the square-root rule. */
  bins?: number;
  markers?: readonly HistogramMarker[];
  width?: number;
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

interface Bin {
  start: number;
  end: number;
  count: number;
}

function buildBins(values: readonly number[], requested: number): Bin[] {
  if (values.length === 0) return [];
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const count = Math.max(1, Math.min(50, Math.floor(requested)));
  const span = max - min;
  if (span === 0) {
    return [{ start: min, end: min, count: finite.length }];
  }
  const step = span / count;
  const bins: Bin[] = Array.from({ length: count }, (_, index) => ({
    start: min + step * index,
    end: min + step * (index + 1),
    count: 0
  }));
  for (const value of finite) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((value - min) / step)));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }
  return bins;
}

/**
 * Histogram of a distribution with optional mean/quantile markers.
 *
 * Bins are equal-width and derived with the square-root rule unless `bins` says
 * otherwise; markers are dashed rules so they read as annotations, not data.
 */
export function DistributionHistogram({
  values,
  title,
  description,
  bins = Math.max(4, Math.round(Math.sqrt(Math.max(1, values.length)))),
  markers,
  width,
  height,
  color = palette.cyan,
  formatValue = (value) => formatNumber(value, 2),
  className
}: DistributionHistogramProps) {
  const binned = buildBins(values, bins);
  const empty = binned.length === 0;
  const peak = binned.reduce((max, bin) => Math.max(max, bin.count), 0);
  const total = binned.reduce((sum, bin) => sum + bin.count, 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={empty}
      emptyMessage="No samples to bin"
      className={className}
      footer={
        empty ? undefined : (
          <span className="mono-label">
            {total} samples · {binned.length} bins
            {markers && markers.length > 0 ? ` · ${markers.map((marker) => marker.label).join(", ")}` : ""}
          </span>
        )
      }
    >
      {(geometry) => {
        const slots = bandScale(binned.length, [geometry.x0, geometry.x1]);
        const y = linearScale([0, Math.max(1, peak)], [geometry.y1, geometry.y0]);
        const ticks = niceTicks(0, Math.max(1, peak), 4);
        const minStart = binned[0]?.start ?? 0;
        const maxEnd = binned[binned.length - 1]?.end ?? 1;
        const x = linearScale([minStart, maxEnd], [geometry.x0, geometry.x1]);

        return (
          <>
            <g aria-hidden="true">
              {ticks.map((tick) => (
                <g key={`count-${tick}`}>
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
                    {tick}
                  </text>
                </g>
              ))}
              <text
                x={geometry.x0 - 6}
                y={geometry.y0 - 4}
                fontSize={8}
                fontFamily="var(--font-mono)"
                fill={AXIS.label}
                textAnchor="end"
              >
                count
              </text>
            </g>

            <line x1={geometry.x0} x2={geometry.x1} y1={geometry.y1} y2={geometry.y1} stroke={AXIS.line} strokeWidth={1} />

            {binned.map((bin, index) => (
              <g key={`bin-${bin.start.toFixed(6)}`}>
                <title>{`${formatValue(bin.start)} – ${formatValue(bin.end)}: ${bin.count}`}</title>
                <rect
                  x={slots.start(index)}
                  y={y(bin.count)}
                  width={slots.band}
                  height={Math.max(0, geometry.y1 - y(bin.count))}
                  rx={2}
                  fill={bin.count === peak ? color : withAlpha(color, 0.55)}
                />
              </g>
            ))}

            {(markers ?? []).map((marker) => (
              <g key={`${marker.label}-${marker.value}`}>
                <title>{`${marker.label}: ${formatValue(marker.value)}`}</title>
                <line
                  x1={x(marker.value)}
                  x2={x(marker.value)}
                  y1={geometry.y0}
                  y2={geometry.y1}
                  stroke={marker.color ?? palette.amber}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={x(marker.value)}
                  y={geometry.y0 - 2}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill={marker.color ?? palette.amber}
                  textAnchor="middle"
                >
                  {marker.label}
                </text>
              </g>
            ))}

            <text
              x={geometry.x1}
              y={geometry.y1 + 18}
              fontSize={9}
              fill={AXIS.label}
              textAnchor="end"
            >
              value
            </text>
          </>
        );
      }}
    </ChartFrame>
  );
}
