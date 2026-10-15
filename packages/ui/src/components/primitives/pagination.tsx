import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export interface PaginationProps extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Pages shown either side of the current one. Defaults to 1. */
  siblingCount?: number;
  /** Accessible name. Defaults to "Pagination". */
  label?: string;
  className?: string;
}

/** Pages to render, with `null` standing for an ellipsis. */
function pageWindow(page: number, pageCount: number, siblings: number): (number | null)[] {
  const total = siblings * 2 + 5;
  if (pageCount <= total) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const left = Math.max(2, page - siblings);
  const right = Math.min(pageCount - 1, page + siblings);
  const pages: (number | null)[] = [1];

  if (left > 2) pages.push(null);
  for (let value = left; value <= right; value += 1) pages.push(value);
  if (right < pageCount - 1) pages.push(null);

  pages.push(pageCount);
  return pages;
}

/** Numbered pager. The current page is announced with `aria-current`. */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  label = "Pagination",
  className,
  ...rest
}: PaginationProps) {
  const clamped = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const pages = pageWindow(clamped, pageCount, siblingCount);
  const first = pages[0] ?? 1;
  const last = pages[pages.length - 1] ?? pageCount;

  return (
    <nav aria-label={label} className={cn("flex items-center gap-1", className)} {...rest}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Previous page"
        disabled={clamped <= 1}
        onClick={() => onPageChange(clamped - 1)}
      >
        <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden="true" focusable="false">
          <title>Previous</title>
          <path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Button>

      {pages.map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-xs text-slate">
            …
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === clamped ? "secondary" : "ghost"}
            size="sm"
            aria-label={`Page ${entry}`}
            aria-current={entry === clamped ? "page" : undefined}
            onClick={() => onPageChange(entry)}
            className={cn("min-w-8 tabular-nums", entry === clamped && "border-cyan/45 text-cyan")}
          >
            {entry}
          </Button>
        )
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label="Next page"
        disabled={clamped >= pageCount}
        onClick={() => onPageChange(clamped + 1)}
      >
        <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden="true" focusable="false">
          <title>Next</title>
          <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Button>

      <span aria-live="polite" className="sr-only">
        Page {clamped} of {pageCount}
      </span>
      <span className="ml-1 hidden text-xs text-ink-dim tabular-nums sm:inline" aria-hidden="true">
        {first}–{last} / {pageCount}
      </span>
    </nav>
  );
}
