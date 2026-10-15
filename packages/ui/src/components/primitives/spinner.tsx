import type { ComponentPropsWithRef } from "react";
import { cn } from "../../lib/cn";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends Omit<ComponentPropsWithRef<"svg">, "role" | "aria-label"> {
  /** Accessible name. Pass `null` when the surrounding control already names
   *  itself — the spinner is then hidden from assistive tech. */
  label?: string | null;
  size?: SpinnerSize;
}

const SIZES: Record<SpinnerSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6"
};

/** Determinate-looking SVG spinner. `role="status"` when it carries a name. */
export function Spinner({ label = "Loading", size = "md", className, ...rest }: SpinnerProps) {
  const hidden = label === null;

  return (
    <svg
      viewBox="0 0 16 16"
      role={hidden ? undefined : "status"}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : label}
      focusable="false"
      className={cn("animate-spin", SIZES[size], className)}
      {...rest}
    >
      <title>{hidden ? "Spinner" : label}</title>
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
      <path
        d="M8 1.6a6.4 6.4 0 0 1 6.4 6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
