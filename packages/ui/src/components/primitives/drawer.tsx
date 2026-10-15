import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import { cn } from "../../lib/cn";
import { useFocusTrap } from "../../hooks/use-focus-trap";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  /** Panel width at the `sm` breakpoint and up. */
  width?: "sm" | "md" | "lg";
  dismissOnBackdrop?: boolean;
  closeLabel?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

const WIDTHS = {
  sm: "sm:max-w-xs",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl"
} as const;

const SIDES: Record<DrawerSide, string> = {
  left: "left-0 border-r",
  right: "right-0 border-l"
};

/**
 * A side sheet. Same guarantees as `<Dialog>` — focus trap, Escape to close,
 * focus handed back to whatever opened it — but it docks to an edge instead of
 * floating over the content.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "md",
  dismissOnBackdrop = true,
  closeLabel = "Close",
  className,
  ref
}: DrawerProps) {
  const uid = useId();
  const titleId = `drawer-title-${uid}`;
  const descriptionId = `drawer-description-${uid}`;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useFocusTrap({ container: panelRef, active: open, onEscape: () => onOpenChange(false) });

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[60] flex"
      onPointerDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="fixed inset-0 bg-void/80" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "panel relative ml-auto flex h-full w-full flex-col rounded-none border-y-0 border-r-0 transition-transform duration-base",
          SIDES[side],
          WIDTHS[width],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="m-0 font-display text-lg font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="m-0 text-base leading-snug text-ink-dim">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={closeLabel}
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-cell text-ink-dim transition-colors duration-fast hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan"
          >
            <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden="true" focusable="false">
              <title>Close</title>
              <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-base text-ink-dim">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
