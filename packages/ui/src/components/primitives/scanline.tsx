import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";
import { useReducedMotion } from "../../hooks/use-reduced-motion";

export interface ScanlineProps extends ComponentPropsWithRef<"div"> {
  /** Override the automatic reduced-motion check. */
  animated?: boolean;
  /** `subtle` is a hairline wash, `strong` lifts the sweep contrast. */
  intensity?: "subtle" | "strong";
  /** Decorative by default; set only when the pattern conveys meaning. */
  label?: string;
}

/**
 * Decorative CRT hairline pattern.
 *
 * The sweep animates only when the user has not asked for reduced motion —
 * `useReducedMotion` reads the live media query, so toggling the OS setting
 * takes effect without a reload.
 */
export function Scanline({ animated, intensity = "subtle", label, className, ref, ...rest }: ScanlineProps) {
  const reduced = useReducedMotion();
  const moving = animated ?? !reduced;

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "scanline pointer-events-none absolute inset-0",
        moving && "scanline-sweep",
        intensity === "strong" && "opacity-100 [background-image:repeating-linear-gradient(to_bottom,rgba(94,241,255,0.12)_0px,rgba(94,241,255,0.12)_1px,transparent_1px,transparent_3px)]",
        intensity === "subtle" && "opacity-70",
        className
      )}
      {...rest}
    />
  );
}
