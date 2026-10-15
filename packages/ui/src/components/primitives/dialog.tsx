import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import { cn } from "../../lib/cn";
import { useFocusTrap } from "../../hooks/use-focus-trap";

export type DialogSize = "sm" | "md" | "lg";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons or actions pinned to the bottom of the panel. */
  footer?: ReactNode;
  size?: DialogSize;
  /** Close when the backdrop is pressed. Defaults to true. */
  dismissOnBackdrop?: boolean;
  /** Accessible name for the close button. */
  closeLabel?: string;
  className?: string;
  /** Escape hatch for the outer wrapper (positioning, testing). */
  overlayClassName?: string;
  ref?: Ref<HTMLDivElement>;
}

const SIZES: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl"
};

/**
 * A modal dialog: focus is trapped while open, Escape closes it, focus returns
 * to the trigger, and the page behind it cannot scroll.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissOnBackdrop = true,
  closeLabel = "Close",
  className,
  overlayClassName,
  ref
}: DialogProps) {
  const uid = useId();
  const titleId = `dialog-title-${uid}`;
  const descriptionId = `dialog-description-${uid}`;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useFocusTrap({
    container: panelRef,
    active: open,
    onEscape: () => onOpenChange(false)
  });

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center",
        overlayClassName
      )}
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
        className={cn("panel relative w-full p-0 shadow-[0_1px_0_0_var(--cog-line)]", SIZES[size], className)}
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

        {children ? <div className="px-4 py-3 text-base text-ink-dim">{children}</div> : null}
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
