import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "../../lib/cn";

export type TooltipSide = "top" | "right" | "bottom" | "left";

export interface TooltipProps {
  /** The tooltip bubble contents. */
  content: ReactNode;
  /** The trigger. Kept as-is — no ref or handler cloning required. */
  children: ReactNode;
  side?: TooltipSide;
  delay?: number;
  /** Set false to reveal the tooltip only for keyboard users. */
  showOnHover?: boolean;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

const SIDES: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "top-1/2 right-full -translate-y-1/2 mr-2",
  right: "top-1/2 left-full -translate-y-1/2 ml-2"
};

/**
 * A hover/focus tooltip.
 *
 * The relationship is `aria-describedby`, never `aria-labelledby` — a tooltip
 * describes the trigger, it does not name it. Escape dismisses it, and focus
 * alone is enough to open it, so keyboard users get the same information.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delay = 150,
  showOnHover = true,
  className,
  ref
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(true), Math.max(0, delay));
  }, [clear, delay]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      aria-describedby={open ? id : undefined}
      onPointerEnter={showOnHover ? show : undefined}
      onPointerLeave={showOnHover ? clear : undefined}
      onFocus={show}
      onBlur={clear}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clear();
          setOpen(false);
        }
      }}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          "pointer-events-none absolute z-50 max-w-64 rounded-cell border border-line bg-surface-3 px-2 py-1 text-xs leading-snug text-ink shadow-[0_1px_0_0_var(--cog-line)]",
          SIDES[side],
          className
        )}
      >
        {content}
      </span>
    </span>
  );
}
