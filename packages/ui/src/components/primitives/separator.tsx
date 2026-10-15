import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface SeparatorProps extends ComponentPropsWithRef<"div"> {
  orientation?: "horizontal" | "vertical";
  /**
   * When true (default) the separator is exposed to assistive tech as a
   * `separator` role. Set to false inside purely decorative rules.
   */
  decorative?: boolean;
}

/** A hairline rule between blocks of content. */
export function Separator({
  orientation = "horizontal",
  decorative = false,
  className,
  ref,
  ...rest
}: SeparatorProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-line",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
        className
      )}
      {...rest}
    />
  );
}
