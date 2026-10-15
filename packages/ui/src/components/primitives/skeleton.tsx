import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface SkeletonProps extends ComponentPropsWithRef<"div"> {
  variant?: "line" | "block" | "circle";
  width?: string | number;
  height?: string | number;
  /** Number of stacked lines (only for the `line` variant). */
  lines?: number;
}

const VARIANTS: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  line: "h-3 w-full rounded-cell",
  block: "h-16 w-full rounded-panel",
  circle: "size-10 rounded-full"
};

function style(width: SkeletonProps["width"], height: SkeletonProps["height"]): Record<string, string> | undefined {
  if (width === undefined && height === undefined) return undefined;
  return {
    ...(width !== undefined ? { width: typeof width === "number" ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : {})
  };
}

/**
 * Loading placeholder. The animation is a slow opacity pulse, which the global
 * reduced-motion block collapses to a static surface.
 */
export function Skeleton({
  variant = "line",
  width,
  height,
  lines = 1,
  className,
  ref,
  ...rest
}: SkeletonProps) {
  if (variant === "line" && lines > 1) {
    return (
      <span ref={ref as Ref<HTMLSpanElement>} className="flex flex-col gap-2" aria-hidden="true" {...rest}>
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className={cn(VARIANTS.line, "animate-pulse bg-surface-3", className)} />
        ))}
      </span>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      aria-hidden="true"
      style={style(width, height)}
      className={cn("animate-pulse bg-surface-3", VARIANTS[variant], className)}
      {...rest}
    />
  );
}
