import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useCopy } from "../../hooks/use-copy";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

export interface CopyButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "value" | "onCopy"> {
  /** What lands on the clipboard. */
  value: string;
  /** Content shown while idle. Defaults to the accessible label. */
  children?: ReactNode;
  /** Accessible name, and the idle label unless `children` is given. */
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Announce success in a polite live region. */
  announce?: boolean;
}

/**
 * Copy-to-clipboard button with a visible, keyboard-reachable confirmation.
 *
 * The icon is decorative; the state is communicated by the button's own label
 * (`aria-live="polite"` on a visually hidden span) so a screen-reader user hears
 * "Copied" without moving focus.
 */
export function CopyButton({
  value,
  children,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "secondary",
  size = "md",
  announce = true,
  className,
  onClick,
  ref,
  ...rest
}: CopyButtonProps) {
  const { copied, copy } = useCopy();

  return (
    <>
      <Button
        ref={ref as Ref<HTMLButtonElement>}
        variant={variant}
        size={size}
        aria-label={label}
        className={cn("tabular-nums", className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) void copy(value);
        }}
        {...rest}
      >
        {copied ? (
          <svg viewBox="0 0 12 12" className="size-3.5 text-lime" aria-hidden="true" focusable="false">
            <title>Copied</title>
            <path
              d="M2.5 6.4l2.3 2.3 4.7-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden="true" focusable="false">
            <title>Copy</title>
            <rect
              x="2"
              y="2"
              width="5.5"
              height="5.5"
              rx="1.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M4.5 9.5h4A1.5 1.5 0 0 0 10 8V4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {copied ? copiedLabel : (children ?? label)}
      </Button>
      {announce ? (
        <span aria-live="polite" className="sr-only">
          {copied ? copiedLabel : ""}
        </span>
      ) : null}
    </>
  );
}
