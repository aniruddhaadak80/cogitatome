import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface ScrollAreaProps extends ComponentPropsWithRef<"div"> {
  orientation?: "vertical" | "horizontal" | "both";
  /** Accessible name. Required — the region is focusable, so it needs a name. */
  label?: string;
  /** Dim the edges where content is clipped. */
  fade?: boolean;
  maxHeight?: string | number;
}

const OVERFLOW = {
  vertical: "overflow-y-auto overflow-x-hidden",
  horizontal: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto"
} as const;

/**
 * A keyboard-scrollable region.
 *
 * `tabIndex={0}` makes it reachable without a mouse, which is the only way a
 * keyboard user can scroll a nested container. Styled scrollbars are opt-in
 * through the `thin` utility so the native behaviour is preserved everywhere.
 */
export function ScrollArea({
  orientation = "vertical",
  label,
  fade = false,
  maxHeight,
  className,
  style,
  ref,
  ...rest
}: ScrollAreaProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{ maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight, ...style }}
      className={cn(
        "relative rounded-cell focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
        "[scrollbar-width:thin] [scrollbar-color:var(--color-indigo-3)_transparent]",
        OVERFLOW[orientation],
        fade && "[mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_calc(100%-12px),transparent_100%)]",
        className
      )}
      {...rest}
    />
  );
}
