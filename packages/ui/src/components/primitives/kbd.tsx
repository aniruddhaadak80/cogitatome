import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface KbdProps extends ComponentPropsWithRef<"kbd"> {
  size?: "sm" | "md";
}

/** A keycap. Mono, hairline-bordered, slightly raised off the surface. */
export function Kbd({ size = "md", className, children, ref, ...rest }: KbdProps) {
  return (
    <kbd
      ref={ref as Ref<HTMLElement>}
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-cell border border-line bg-surface-3 font-mono font-medium text-ink-dim",
        size === "sm" ? "h-5 px-1 text-2xs" : "h-6 px-1.5 text-xs",
        className
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}

export interface KbdSequenceProps extends ComponentPropsWithRef<"span"> {
  /** Keys rendered in order, separated by a `+`. */
  keys: readonly string[];
}

/** `Ctrl + K` — several keycaps with a visible joiner. */
export function KbdSequence({ keys, className, ...rest }: KbdSequenceProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} {...rest}>
      {keys.map((key, index) => (
        <span key={key} className="inline-flex items-center gap-1">
          {index > 0 ? (
            <span className="text-2xs text-slate" aria-hidden="true">
              +
            </span>
          ) : null}
          <Kbd size="sm">{key}</Kbd>
        </span>
      ))}
    </span>
  );
}
