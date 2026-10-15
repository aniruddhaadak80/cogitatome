import { useId, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { palette } from "../../lib/palette";
import { chartTokens } from "../../lib/tokens";
import { EmptyState } from "../primitives/empty-state";

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly padding: ChartPadding;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface ChartLegendItem {
  label: string;
  color: string;
  value?: string;
  shape?: "line" | "rect" | "dot";
}

/** Default geometry for a chart of the given box. */
export function chartGeometry(options: {
  width?: number;
  height?: number;
  padding?: Partial<ChartPadding>;
}): ChartGeometry {
  const width = options.width ?? chartTokens.defaultWidth;
  const height = options.height ?? chartTokens.defaultHeight;
  const padding: ChartPadding = {
    top: options.padding?.top ?? 12,
    right: options.padding?.right ?? 12,
    bottom: options.padding?.bottom ?? 22,
    left: options.padding?.left ?? 34
  };

  return {
    width,
    height,
    padding,
    innerWidth: Math.max(1, width - padding.left - padding.right),
    innerHeight: Math.max(1, height - padding.top - padding.bottom),
    x0: padding.left,
    y0: padding.top,
    x1: width - padding.right,
    y1: height - padding.bottom
  };
}

/** Map a numeric domain onto a pixel range. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number]
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** Round tick steps to 1/2/5 × 10ⁿ so axis labels stay readable. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [min, max];
  if (max <= min) return [min];
  const raw = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = (normalised >= 5 ? 10 : normalised >= 2 ? 5 : normalised >= 1 ? 2 : 1) * magnitude;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/** The tick-bounded domain — use it so bars do not stop short of the top. */
export function niceDomain(min: number, max: number, count = 4): [number, number] {
  const ticks = niceTicks(min, max, count);
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (first === undefined || last === undefined) return [min, max];
  return [Math.min(min, first), Math.max(max, last)];
}

export interface BandScale {
  readonly step: number;
  readonly band: number;
  readonly start: (index: number) => number;
  readonly center: (index: number) => number;
}

/** Equal-width slots across a range, for categorical axes. */
export function bandScale(count: number, range: readonly [number, number], paddingRatio = 0.2): BandScale {
  const [from, to] = range;
  const step = count > 0 ? (to - from) / count : 0;
  const band = Math.max(1, step * (1 - paddingRatio));
  return {
    step,
    band,
    start: (index: number) => from + step * index + (step - band) / 2,
    center: (index: number) => from + step * index + step / 2
  };
}

/** SVG path through a list of points. */
export function linePath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

/** Closed SVG path for an area between a series and a baseline. */
export function areaPath(
  points: readonly (readonly [number, number])[],
  baseline: number
): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  const top = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  return `${top} L${last[0].toFixed(2)} ${baseline.toFixed(2)} L${first[0].toFixed(2)} ${baseline.toFixed(2)} Z`;
}

/** Smooth-ish curve through points using quadratic midpoints. */
export function curvePath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 3) return linePath(points);
  const first = points[0];
  if (!first) return "";
  let path = `M${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) continue;
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    path += ` Q${current[0].toFixed(2)} ${current[1].toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  if (last) path += ` L${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
  return path;
}

export interface ChartFrameProps {
  /** Chart name. Becomes the SVG `<title>` and the figcaption. */
  title: string;
  /** What the chart shows, in words. Also the SVG `<desc>`. */
  description?: string;
  width?: number;
  height?: number;
  padding?: Partial<ChartPadding>;
  legend?: readonly ChartLegendItem[];
  /** Render the empty state instead of the plot. */
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
  footer?: ReactNode;
  /** Plot contents, or a render function that receives the geometry. */
  children: ReactNode | ((geometry: ChartGeometry) => ReactNode);
}

/**
 * The shared frame for every hand-rolled chart.
 *
 * It owns the responsive `<svg>` (`viewBox` + `width="100%"`), the accessible
 * name and description, the legend, and the empty state. Charts themselves only
 * ever draw marks, which is why they stay short.
 */
export function ChartFrame({
  title,
  description,
  width,
  height,
  padding,
  legend,
  empty = false,
  emptyMessage = "No data to plot",
  className,
  footer,
  children
}: ChartFrameProps) {
  const uid = useId();
  const titleId = `chart-title-${uid}`;
  const descriptionId = `chart-description-${uid}`;
  const geometry = chartGeometry({ width, height, padding });

  return (
    <figure className={cn("m-0 flex flex-col gap-2", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span id={titleId} className="font-display text-sm font-semibold tracking-tight text-ink">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="mono-label max-w-md text-right">
            {description}
          </span>
        ) : null}
      </figcaption>

      {empty ? (
        <EmptyState title={emptyMessage} bordered className="py-8" />
      ) : (
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width="100%"
          height={geometry.height}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible"
        >
          <title>{title}</title>
          {description ? <desc>{description}</desc> : null}
          {typeof children === "function" ? children(geometry) : children}
        </svg>
      )}

      {legend && legend.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 p-0 m-0 list-none">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-dim">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block shrink-0",
                  item.shape === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-cell"
                )}
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
              {item.value ? <span className="font-mono tabular-nums text-ink">{item.value}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {footer}
    </figure>
  );
}

/** Shared axis colours, so every chart ticks in the same voice. */
export const AXIS = {
  line: palette.indigo3,
  label: palette.slate,
  grid: palette.indigo2
} as const;
