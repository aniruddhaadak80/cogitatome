import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "label"> {
  /** Accessible name. Required — an icon alone cannot be named by the browser. */
  label: string;
  /** The icon itself. */
  children: ReactNode;
  /** Reveal the label as a tooltip on hover and keyboard focus. */
  tooltip?: ReactNode;
  className?: string;
}

/**
 * Square, icon-only button. `label` becomes `aria-label`; the button stays a
 * real `<button>` so it is reachable and operable from the keyboard.
 */
export function IconButton({ label, children, tooltip, className, ...rest }: IconButtonProps) {
  const button = (
    <Button
      aria-label={label}
      title={label}
      className={cn("size-9 p-0", className)}
      {...rest}
    >
      {children}
    </Button>
  );

  if (!tooltip) return button;
  return (
    <Tooltip content={tooltip}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  );
}
