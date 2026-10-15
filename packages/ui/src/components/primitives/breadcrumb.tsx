import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Link } from "./link";

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbProps extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  items: readonly BreadcrumbItem[];
  /** Rendered between crumbs. */
  separator?: ReactNode;
  /** Accessible name. Defaults to "Breadcrumb". */
  label?: string;
}

function DefaultSeparator() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 text-slate" aria-hidden="true" focusable="false">
      <title>Separator</title>
      <path d="M4 2.5L8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Trail of ancestors. The last item is the current page, so it is rendered as
 * text with `aria-current="page"` rather than a link to itself.
 */
export function Breadcrumb({ items, separator, label = "Breadcrumb", className, ...rest }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={cn("min-w-0", className)} {...rest}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">{separator ?? <DefaultSeparator />}</span> : null}
              {last || item.href === undefined ? (
                <span aria-current={last ? "page" : undefined} className="truncate text-ink">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} variant="quiet" className="truncate">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
