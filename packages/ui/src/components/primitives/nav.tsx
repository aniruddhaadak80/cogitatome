import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Link } from "./link";

export interface NavEntry {
  label: ReactNode;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
}

export interface NavProps extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  items?: readonly NavEntry[];
  children?: ReactNode;
  orientation?: "horizontal" | "vertical";
  /** Accessible name. Required whenever a page carries more than one nav. */
  label?: string;
  variant?: "underline" | "quiet" | "stacked";
}

const VARIANTS = {
  underline: "text-sm",
  quiet: "text-sm",
  stacked: "rounded-panel bg-surface-2 p-1 text-base"
} as const;

const ITEM_ACTIVE = {
  underline: "border-b-2 border-cyan text-cyan",
  quiet: "text-cyan",
  stacked: "rounded-cell bg-surface-3 text-ink"
} as const;

const ITEM_IDLE = {
  underline: "border-b-2 border-transparent text-ink-dim hover:text-ink",
  quiet: "text-ink-dim hover:text-cyan",
  stacked: "rounded-cell text-ink-dim hover:bg-surface-3 hover:text-ink"
} as const;

/** Navigation list. Renders `<ul>` of links from `items`, or any children. */
export function Nav({
  items,
  children,
  orientation = "horizontal",
  label,
  variant = "underline",
  className,
  ...rest
}: NavProps) {
  const activeClass = ITEM_ACTIVE[variant];
  const idleClass = ITEM_IDLE[variant];

  return (
    <nav aria-label={label} className={cn("min-w-0", VARIANTS[variant], className)} {...rest}>
      {items ? (
        <ul
          className={cn(
            "flex list-none flex-wrap items-stretch gap-1 p-0 m-0",
            orientation === "vertical" && "flex-col items-stretch"
          )}
        >
          {items.map((item, index) => {
            const shared = cn(
              "inline-flex items-center gap-2 rounded-cell px-2.5 py-1.5 font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
              item.active ? activeClass : idleClass,
              item.disabled && "pointer-events-none opacity-50"
            );

            return (
              <li key={index} className="flex min-w-0">
                {item.href !== undefined ? (
                  <Link href={item.href} aria-current={item.active ? "page" : undefined} className={shared}>
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                    {item.badge ? <span className="mono-label text-slate">{item.badge}</span> : null}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-current={item.active ? "page" : undefined}
                    disabled={item.disabled === true}
                    onClick={item.onClick}
                    className={cn(shared, "text-left")}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                    {item.badge ? <span className="mono-label text-slate">{item.badge}</span> : null}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        children
      )}
    </nav>
  );
}
