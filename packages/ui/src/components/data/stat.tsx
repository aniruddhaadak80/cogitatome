import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatNumber, formatPercent } from "../../lib/palette";

export type StatAccent = "amber" | "cyan" | "violet" | "lime" | "rose" | "none";

export interface StatProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  label: ReactNode;
  value: ReactNode;
  /** Relative change, e.g. `0.12` renders `+12.0%`. */
  delta?: number;
  /** Delta display mode. Defaults to `percent`. */
  deltaFormat?: "percent" | "absolute";
  /** Overrides the direction implied by `delta`. */
  trend?: "up" | "down" | "flat";
  hint?: ReactNode;
  accent?: StatAccent;
  size?: "sm" | "md" | "lg";
  /** Render the value in the mono family. Defaults to true. */
  monoValue?: boolean;
}

const ACCENTS: Record<StatAccent, string> = {
  amber: "text-amber",
  cyan: "text-cyan",
  violet: "text-violet",
  lime: "text-lime",
  rose: "text-rose",
  none: "text-ink"
};

const SIZES: Record<NonNullable<StatProps["size"]>, { value: string; label: string }> = {
  sm: { value: "text-md", label: "text-2xs" },
  md: { value: "text-xl", label: "text-xs" },
  lg: { value: "text-3xl", label: "text-sm" }
};

function DeltaText({ delta, format }: { delta: number; format: "percent" | "absolute" }) {
  const positive = delta > 0;
  const flat = Math.abs(delta) < 1e-9;
  const text =
    format === "percent"
      ? `${positive ? "+" : ""}${formatPercent(delta, 1)}`
      : `${positive ? "+" : ""}${formatNumber(delta, 3)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        flat ? "text-ink-dim" : positive ? "text-lime" : "text-rose"
      )}
    >
      <span aria-hidden="true">{flat ? "→" : positive ? "▲" : "▼"}</span>
      {text}
    </span>
  );
}

/** One number, labelled. The instrument-panel readout. */
export function Stat({
  label,
  value,
  delta,
  deltaFormat = "percent",
  trend: trendProp,
  hint,
  accent = "none",
  size = "md",
  monoValue = true,
  className,
  ref,
  ...rest
}: StatProps) {
  const trend = trendProp ?? (delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat");

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={cn("flex flex-col gap-1", className)} {...rest}>
      <p className={cn("mono-label m-0", SIZES[size].label)}>{label}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "font-semibold tracking-tight",
            SIZES[size].value,
            ACCENTS[accent],
            monoValue && "font-mono"
          )}
        >
          {value}
        </span>
        {delta !== undefined ? <DeltaText delta={delta} format={deltaFormat} /> : null}
      </div>
      {hint ? <p className="m-0 text-xs leading-snug text-ink-dim">{hint}</p> : null}
      <span className="sr-only">Trend: {trend}</span>
    </div>
  );
}
