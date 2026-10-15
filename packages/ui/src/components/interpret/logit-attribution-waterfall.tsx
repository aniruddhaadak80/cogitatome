import { formatNumber, palette } from "../../lib/palette";
import { bandScale, ChartFrame, linearScale, niceDomain, niceTicks, AXIS } from "../charts/chart-frame";

export interface WaterfallStep {
  /** Where the contribution comes from — a head, a neuron, a feature. */
  name: string;
  /** Signed contribution to the target logit. */
  value: number;
}

export interface LogitAttributionWaterfallProps {
  steps: readonly WaterfallStep[];
  title: string;
  description?: string;
  /** Shown in the footer, e.g. the token whose logit is being explained. */
  targetToken?: string;
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

/**
 * Direct logit attribution as a waterfall.
 *
 * Each step moves the running total up (amber) or down (cyan); the last bar is
 * the reconstructed logit itself. A step whose bar is taller than the sum of the
 * others is the story — that is the circuit finding you.
 */
export function LogitAttributionWaterfall({
  steps,
  title,
  description,
  targetToken,
  width = 640,
  height = 260,
  formatValue = (value) => formatNumber(value, 3),
  className
}: LogitAttributionWaterfallProps) {
  const usable = steps.filter((step) => Number.isFinite(step.value));
  const running: number[] = [];
  let cursor = 0;
  for (const step of usable) {
    running.push(cursor);
    cursor += step.value;
  }
  const final = cursor;
  const levels = [...running, final];
  const domain = niceDomain(Math.min(0, ...levels), Math.max(0, ...levels), 4);
  const total = usable.reduce((sum, step) => sum + step.value, 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={usable.length === 0 || (usable.length === 1 && usable[0]?.value === 0)}
      emptyMessage="No attribution to explain — run a trace first"
      className={className}
      footer={
        targetToken ? (
          <span className="mono-label">
            target logit · {targetToken} · net {formatValue(total)}
          </span>
        ) : undefined
      }
    >
      {(geometry) => {
        const slots = bandScale(usable.length + 1, [geometry.x0, geometry.x1], 0.35);
        const y = linearScale([domain[0], domain[1]], [geometry.y1, geometry.y0]);
        const ticks = niceTicks(domain[0], domain[1], 5);

        return (
          <>
            <g aria-hidden="true">
              {ticks.map((tick) => (
                <g key={`tick-${tick}`}>
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
                    {formatValue(tick)}
                  </text>
                </g>
              ))}
            </g>

            <line x1={geometry.x0} x2={geometry.x1} y1={geometry.y1} y2={geometry.y1} stroke={AXIS.line} strokeWidth={1} />

            {usable.map((step, index) => {
              const from = running[index] ?? 0;
              const to = from + step.value;
              const bottom = Math.max(from, to);
              const positive = step.value >= 0;
              const x = slots.start(index + 1);

              return (
                <g key={`${step.name}-${index}`}>
                  <title>{`${step.name}: ${formatValue(step.value)}`}</title>
                  <line
                    x1={slots.center(index)}
                    x2={x}
                    y1={y(from)}
                    y2={y(from)}
                    stroke={palette.slate}
                    strokeWidth={0.6}
                    strokeDasharray="2 2"
                  />
                  <rect
                    x={x}
                    y={y(bottom)}
                    width={slots.band}
                    height={Math.max(1, Math.abs(y(to) - y(from)))}
                    rx={2}
                    fill={positive ? palette.amber : palette.cyan}
                    fillOpacity={0.85}
                  />
                  <text
                    x={x + slots.band / 2}
                    y={y(bottom) - 5}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill={positive ? palette.amber : palette.cyan}
                    textAnchor="middle"
                  >
                    {formatValue(step.value)}
                  </text>
                  <text
                    x={x + slots.band / 2}
                    y={geometry.y1 + 12}
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill={AXIS.label}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                  >
                    {step.name}
                  </text>
                </g>
              );
            })}

            <g>
              <title>{`Reconstructed logit: ${formatValue(final)}`}</title>
              <rect
                x={slots.start(0)}
                y={y(Math.max(0, final))}
                width={slots.band}
                height={Math.max(1, Math.abs(y(final) - y(0)))}
                rx={2}
                fill={palette.violet}
                fillOpacity={0.9}
              />
              <line
                x1={slots.center(0)}
                x2={slots.start(1)}
                y1={y(final)}
                y2={y(final)}
                stroke={palette.violet}
                strokeWidth={0.8}
                strokeDasharray="3 3"
              />
              <text
                x={slots.start(0) + slots.band / 2}
                y={y(Math.max(0, final)) - 5}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill={palette.violet}
                textAnchor="middle"
              >
                {formatValue(final)}
              </text>
              <text
                x={slots.start(0) + slots.band / 2}
                y={geometry.y1 + 12}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill={AXIS.label}
                textAnchor="middle"
                dominantBaseline="hanging"
              >
                total
              </text>
            </g>
          </>
        );
      }}
    </ChartFrame>
  );
}
