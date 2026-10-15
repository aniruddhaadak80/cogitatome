import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";
import { formatNumber, formatPercent } from "../../lib/palette";

export type ProgressTone = "amber" | "cyan" | "lime" | "rose" | "violet";

export interface ProgressProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** Omit for an indeterminate bar. */
  value?: number;
  max?: number;
  /** Accessible name. Provide it unless the surrounding context names the bar. */
  label?: string;
  /** Show the numeric value beside the bar. */
  showValue?: boolean;
  size?: "sm" | "md";
  tone?: ProgressTone;
  /** Formats the readout. Defaults to a percentage of `max`. */
  formatValue?: (value: number, max: number) => string;
}

const TONES: Record<ProgressTone, string> = {
  amber: "bg-amber",
  cyan: "bg-cyan",
  lime: "bg-lime",
  rose: "bg-rose",
  violet: "bg-violet"
};

/** A determinate (or indeterminate) progress bar with a real ARIA role. */
export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  tone = "amber",
  formatValue,
  className,
  ref,
  ...rest
}: ProgressProps) {
  const indeterminate = value === undefined || Number.isNaN(value);
  const clamped = indeterminate ? 0 : Math.min(max, Math.max(0, value));
  const percent = max <= 0 ? 0 : (clamped / max) * 100;
  const readout = formatValue
    ? formatValue(clamped, max)
    : `${formatPercent(percent, 0)}`;

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuetext={indeterminate ? "Indeterminate" : readout}
      data-indeterminate={indeterminate || undefined}
      className={cn("flex items-center gap-3", className)}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-surface-3",
          size === "sm" ? "h-1" : "h-1.5",
          indeterminate && "after:absolute after:inset-y-0 after:left-0 after:w-1/3 after:animate-pulse after:bg-amber/60"
        )}
      >
        {indeterminate ? null : (
          <span
            className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-base", TONES[tone])}
            style={{ width: `${percent}%` }}
          />
        )}
      </span>
      {showValue ? (
        <span className="mono-label shrink-0 tabular-nums text-ink-dim">
          {indeterminate ? "…" : readout}
        </span>
      ) : null}
    </div>
  );
}

/** Convenience wrapper for a labelled bar with the value inside the label. */
export function ProgressWithLabel({
  label,
  hint,
  ...props
}: ProgressProps & { hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink">{label}</span>
        {hint ? <span className="mono-label tabular-nums">{hint}</span> : null}
      </div>
      <Progress label={label} {...props} />
    </div>
  );
}

/** Format a progress value with a fixed number of significant digits. */
export function formatProgress(value: number, max: number, digits = 1): string {
  return max <= 0 ? formatNumber(value, digits) : formatPercent(value / max, digits);
}
