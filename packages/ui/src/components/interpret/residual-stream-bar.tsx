import { formatNumber, palette, withAlpha } from "../../lib/palette";
import { ChartFrame, linearScale, niceTicks, AXIS } from "../charts/chart-frame";

export type ResidualComponentKind = "embed" | "attn" | "mlp" | "unembed" | "other";

export interface ResidualComponent {
  name: string;
  value: number;
  kind: ResidualComponentKind;
}

export interface ResidualStreamBarProps {
  components: readonly ResidualComponent[];
  title: string;
  description?: string;
  /** Known total (the residual norm). Defaults to the sum of the parts. */
  total?: number;
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

const KIND_COLORS: Record<ResidualComponentKind, string> = {
  embed: palette.violet,
  attn: palette.cyan,
  mlp: palette.amber,
  unembed: palette.lime,
  other: palette.slate
};

const KIND_LABELS: Record<ResidualComponentKind, string> = {
  embed: "embedding",
  attn: "attention",
  mlp: "MLP",
  unembed: "unembedding",
  other: "other"
};

/**
 * The residual stream, decomposed.
 *
 * Each component's absolute contribution is a stacked segment, so the bar shows
 * both the parts and their sum — the picture behind "the residual stream is a
 * communication channel that every subspace writes to".
 */
export function ResidualStreamBar({
  components,
  title,
  description,
  total,
  width = 640,
  height = 96,
  formatValue = (value) => formatNumber(value, 3),
  className
}: ResidualStreamBarProps) {
  const sum = components.reduce((accumulator, component) => accumulator + Math.abs(component.value), 0);
  const barTotal = total ?? sum;
  const empty = components.length === 0 || barTotal <= 0;

  const kinds = [...new Set(components.map((component) => component.kind))];

  return (
    <ChartFrame
      title={title}
      description={description}
      width={width}
      height={height}
      empty={empty}
      emptyMessage="No components recorded for this position"
      className={className}
      legend={kinds.map((kind) => ({
        label: KIND_LABELS[kind],
        color: KIND_COLORS[kind],
        shape: "rect",
        value: formatValue(
          components
            .filter((component) => component.kind === kind)
            .reduce((accumulator, component) => accumulator + Math.abs(component.value), 0)
        )
      }))}
    >
      {(geometry) => {
        const barHeight = 34;
        const barY = geometry.y0 + 12;
        const scale = linearScale([0, barTotal], [geometry.x0, geometry.x1]);
        const ticks = niceTicks(0, barTotal, 5);
        let cursor = 0;

        return (
          <>
            <line x1={geometry.x0} x2={geometry.x1} y1={barY + barHeight} y2={barY + barHeight} stroke={AXIS.line} strokeWidth={1} />

            {ticks.map((tick) => (
              <g key={`tick-${tick}`} aria-hidden="true">
                <line
                  x1={scale(tick)}
                  x2={scale(tick)}
                  y1={barY - 4}
                  y2={barY + barHeight}
                  stroke={AXIS.grid}
                  strokeWidth={0.5}
                  strokeDasharray="2 3"
                />
                <text
                  x={scale(tick)}
                  y={barY + barHeight + 12}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill={AXIS.label}
                  textAnchor="middle"
                >
                  {formatValue(tick)}
                </text>
              </g>
            ))}

            {components.map((component, index) => {
              const start = cursor;
              cursor += Math.abs(component.value);
              const x = scale(start);
              const segmentWidth = Math.max(0, scale(cursor) - x);

              return (
                <g key={`${component.name}-${index}`}>
                  <title>{`${component.name} · ${KIND_LABELS[component.kind]}: ${formatValue(component.value)} (${formatValue(
                    (Math.abs(component.value) / barTotal) * 100
                  )} of the norm)`}</title>
                  <rect
                    x={x}
                    y={barY}
                    width={segmentWidth}
                    height={barHeight}
                    fill={KIND_COLORS[component.kind]}
                    fillOpacity={0.82}
                    stroke={palette.void}
                    strokeWidth={0.6}
                  />
                  {segmentWidth > 44 ? (
                    <text
                      x={x + segmentWidth / 2}
                      y={barY + barHeight / 2}
                      fontSize={8}
                      fontFamily="var(--font-mono)"
                      fill={palette.void}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {component.name}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <line
              x1={geometry.x1}
              x2={geometry.x1}
              y1={barY - 8}
              y2={barY + barHeight + 8}
              stroke={withAlpha(palette.cyan, 0.6)}
              strokeWidth={1}
            />
            <text x={geometry.x1} y={barY - 12} fontSize={9} fontFamily="var(--font-mono)" fill={palette.cyan} textAnchor="end">
              ‖residual‖ {formatValue(barTotal)}
            </text>
          </>
        );
      }}
    </ChartFrame>
  );
}
