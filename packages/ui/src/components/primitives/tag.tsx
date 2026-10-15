import type { ComponentPropsWithRef, Ref, KeyboardEvent } from "react";
import { cn } from "../../lib/cn";

export interface TagProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Visible text. Also used to name the remove button. */
  label: string;
  /** Renders a dismiss button when provided. */
  onRemove?: () => void;
  /** Optional leading glyph, e.g. a count. */
  count?: number;
  /** Accessible name for the remove button. Defaults to `Remove {label}`. */
  removeLabel?: string;
  /** Non-interactive tag (used inside headings). */
  active?: boolean;
}

/**
 * A removable facet token. The tag itself is inert text; only the dismiss
 * control is a button, so screen readers hear one control, not two.
 */
export function Tag({
  label,
  onRemove,
  count,
  removeLabel,
  active = false,
  className,
  ref,
  ...rest
}: TagProps) {
  const handleRemove = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onRemove?.();
    }
  };

  return (
    <span
      ref={ref as Ref<HTMLSpanElement>}
      data-active={active || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-cell border border-line bg-surface-3 px-2 py-1 text-xs text-ink-dim",
        active && "border-cyan/40 text-cyan",
        className
      )}
      {...rest}
    >
      <span className="font-mono">{label}</span>
      {typeof count === "number" ? <span className="tabular-nums text-slate">{count}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          onKeyDown={handleRemove}
          aria-label={removeLabel ?? `Remove ${label}`}
          className="-mr-0.5 grid size-4 place-items-center rounded-cell text-slate transition-colors duration-fast hover:bg-rose/20 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan"
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true" focusable="false">
            <title>Remove</title>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
