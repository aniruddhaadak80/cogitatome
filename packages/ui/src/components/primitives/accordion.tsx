import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface AccordionItem {
  value: string;
  title: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  /** `single` keeps one section open, `multiple` lets them stack. */
  type?: "single" | "multiple";
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (values: readonly string[]) => void;
  /** Accessible name for the group of headers. */
  label?: string;
  className?: string;
  /** Renders the whole accordion inside a pane. */
  pane?: boolean;
}

/** Disclosure list with proper `aria-expanded` wiring on every header. */
export function Accordion({
  items,
  type = "single",
  value,
  defaultValue = [],
  onValueChange,
  label,
  className,
  pane = false
}: AccordionProps) {
  const uid = useId();
  const baseId = `accordion-${uid}`;
  const [internal, setInternal] = useState<readonly string[]>(defaultValue);
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const controlled = value !== undefined;
  const open = controlled ? value : internal;

  const toggle = (next: string): void => {
    const isOpen = open.includes(next);
    const values =
      type === "single" ? (isOpen ? [] : [next]) : isOpen ? open.filter((v) => v !== next) : [...open, next];
    if (!controlled) setInternal(values);
    onValueChange?.(values);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    for (let guard = 0; guard < items.length; guard += 1) {
      const next = (index + step + items.length) % items.length;
      if (items[next]?.disabled !== true) {
        headerRefs.current[next]?.focus();
        return;
      }
    }
  };

  return (
    <div
      aria-label={label}
      className={cn("flex flex-col", pane && "pane divide-y divide-[var(--cog-line)]", className)}
    >
      {items.map((item, index) => {
        const expanded = open.includes(item.value);
        const headerId = `${baseId}-header-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div key={item.value} className={cn(!pane && "border-b border-line")}>
            <h3 className="m-0">
              <button
                ref={(node) => {
                  headerRefs.current[index] = node;
                }}
                type="button"
                id={headerId}
                aria-expanded={expanded}
                aria-controls={panelId}
                disabled={item.disabled === true}
                onClick={() => toggle(item.value)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-display text-base font-semibold text-ink transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">{item.title}</span>
                <svg
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  focusable="false"
                  className={cn(
                    "size-3.5 shrink-0 text-ink-dim transition-transform duration-fast",
                    expanded && "rotate-90"
                  )}
                >
                  <title>{expanded ? "Collapse" : "Expand"}</title>
                  <path d="M4 2.5L8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </h3>
            <div
              role="region"
              id={panelId}
              aria-labelledby={headerId}
              hidden={!expanded}
              className="px-3 pb-3 text-base leading-snug text-ink-dim"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
