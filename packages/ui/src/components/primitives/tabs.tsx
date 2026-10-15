import { useId, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface TabItem {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
  /** Count or dot shown after the label. */
  badge?: ReactNode;
}

export interface TabsProps
  extends Omit<ComponentPropsWithRef<"div">, "onChange" | "defaultValue" | "children"> {
  items: readonly TabItem[];
  /** Controlled active value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * `automatic` follows focus with the arrow keys; `manual` moves focus only and
   * waits for Enter/Space. Manual is the safer default for expensive panels.
   */
  activationMode?: "automatic" | "manual";
  variant?: "underline" | "pill";
  /** Render only the tab strip (used as a filter control). */
  hidePanels?: boolean;
  /** Accessible name for the tab list. */
  label?: string;
}

const VARIANTS = {
  underline: "border-b border-line",
  pill: "gap-1 rounded-panel bg-surface-2 p-1"
} as const;

const TAB_ACTIVE = {
  underline: "border-b-2 border-cyan text-cyan",
  pill: "rounded-cell bg-surface-3 text-ink"
} as const;

const TAB_IDLE = {
  underline: "border-b-2 border-transparent text-ink-dim hover:text-ink",
  pill: "rounded-cell text-ink-dim hover:text-ink"
} as const;

/** A WAI-ARIA tab set: roving tabindex, arrow keys, one panel per tab. */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  activationMode = "manual",
  variant = "underline",
  hidePanels = false,
  label,
  className,
  ...rest
}: TabsProps) {
  const uid = useId();
  const baseId = `tabs-${uid}`;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [internal, setInternal] = useState<string>(defaultValue ?? items[0]?.value ?? "");

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.value === current)
  );

  const select = (next: string): void => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();

    let next = activeIndex;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else {
      for (let guard = 0; guard < items.length; guard += 1) {
        next = (next + step + items.length) % items.length;
        if (items[next]?.disabled !== true) break;
      }
    }

    const item = items[next];
    if (!item || item.disabled === true) return;
    tabRefs.current[next]?.focus();
    if (activationMode === "automatic") select(item.value);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)} {...rest}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn("flex flex-wrap items-stretch", VARIANTS[variant])}
      >
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={item.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled === true}
              onClick={() => select(item.value)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50",
                active ? TAB_ACTIVE[variant] : TAB_IDLE[variant]
              )}
            >
              {item.label}
              {item.badge !== undefined && item.badge !== null ? (
                <span className="mono-label text-slate">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hidePanels
        ? null
        : items.map((item, index) => (
            <div
              key={item.value}
              role="tabpanel"
              id={`${baseId}-panel-${index}`}
              aria-labelledby={`${baseId}-tab-${index}`}
              hidden={index !== activeIndex}
              tabIndex={0}
              className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              {item.content}
            </div>
          ))}
    </div>
  );
}
