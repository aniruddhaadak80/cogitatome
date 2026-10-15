import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "amber" | "cyan" | "violet" | "lime" | "rose" | "slate" | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends ComponentPropsWithRef<"span"> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Render as a `<code>`-style mono badge. Defaults to true — the badge is a
   *  label, and mono labels are the instrument-panel voice. */
  mono?: boolean;
}

const TONES: Record<BadgeTone, string> = {
  amber: "border-amber/40 bg-amber/12 text-amber",
  cyan: "border-cyan/40 bg-cyan/12 text-cyan",
  violet: "border-violet/40 bg-violet/12 text-violet",
  lime: "border-lime/40 bg-lime/12 text-lime",
  rose: "border-rose/40 bg-rose/12 text-rose",
  slate: "border-line bg-surface-3 text-ink-dim",
  outline: "border-line bg-transparent text-ink-dim"
};

const SIZES: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-2xs",
  md: "px-2 py-0.5 text-xs"
};

/** A compact status pill. Mono, uppercase, hairline-bordered. */
export function Badge({ tone = "slate", size = "md", mono = true, className, ref, ...rest }: BadgeProps) {
  return (
    <span
      ref={ref as Ref<HTMLSpanElement>}
      className={cn(
        "inline-flex items-center gap-1 rounded-cell border font-medium whitespace-nowrap",
        SIZES[size],
        TONES[tone],
        mono && "font-mono uppercase tracking-wider",
        className
      )}
      {...rest}
    />
  );
}
