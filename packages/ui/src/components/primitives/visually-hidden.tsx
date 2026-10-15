import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface VisuallyHiddenProps extends ComponentPropsWithRef<"span"> {
  /** Element to render. Use `div` only when a block is genuinely needed. */
  as?: "span" | "div" | "p";
}

/**
 * Content that is available to assistive tech but takes no layout space.
 * Use it for table captions, extra context on charts, and skip links.
 */
export function VisuallyHidden({ as = "span", className, ref, ...rest }: VisuallyHiddenProps) {
  const Tag = as as "span";
  return <Tag ref={ref as Ref<HTMLSpanElement>} className={cn("sr-only", className)} {...rest} />;
}
