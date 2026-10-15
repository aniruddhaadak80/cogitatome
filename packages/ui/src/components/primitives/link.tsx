import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";
import { VisuallyHidden } from "./visually-hidden";

export type LinkVariant = "inline" | "quiet" | "standalone";

export interface LinkProps extends ComponentPropsWithRef<"a"> {
  variant?: LinkVariant;
  /** Force the underline even when not hovered. */
  underline?: boolean;
  /** Marks the link as leaving the site: `rel` hardening plus a spoken hint. */
  external?: boolean;
}

const VARIANTS: Record<LinkVariant, string> = {
  inline: "text-cyan underline decoration-cyan/40 decoration-1 underline-offset-4 hover:decoration-cyan",
  quiet: "text-ink-dim hover:text-cyan",
  standalone:
    "inline-flex items-center gap-1 rounded-control border border-line bg-surface-2 px-3 py-1.5 text-base text-ink hover:border-cyan/40 hover:text-cyan"
};

/** A styled anchor. `external` adds `rel` and tells screen readers what happens. */
export function Link({
  variant = "inline",
  underline = false,
  external = false,
  className,
  children,
  target,
  rel,
  ref,
  ...rest
}: LinkProps) {
  const isExternal = external || target === "_blank";

  return (
    <a
      ref={ref as Ref<HTMLAnchorElement>}
      target={isExternal ? "_blank" : target}
      rel={isExternal ? "noreferrer noopener" : rel}
      className={cn(
        "rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
        VARIANTS[variant],
        underline && "underline underline-offset-4",
        className
      )}
      {...rest}
    >
      {children}
      {isExternal ? <VisuallyHidden> (opens in a new tab)</VisuallyHidden> : null}
    </a>
  );
}
