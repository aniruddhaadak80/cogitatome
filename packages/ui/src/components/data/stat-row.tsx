import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface StatRowProps extends ComponentPropsWithRef<"div"> {
  /** Number of columns at the `sm` breakpoint and up. */
  columns?: 2 | 3 | 4 | 6 | "auto";
  /** Hairlines between cells. Defaults to true. */
  divided?: boolean;
  /** Wraps the row in a panel. */
  panel?: boolean;
}

const COLUMNS: Record<NonNullable<StatRowProps["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  6: "grid-cols-3 lg:grid-cols-6",
  auto: "sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"
};

/**
 * A row of `<Stat>` cells.
 *
 * Dividers are painted with a left border on every cell but the first, so they
 * only appear where there is genuinely a neighbour.
 */
export function StatRow({
  columns = 4,
  divided = true,
  panel = false,
  className,
  children,
  ref,
  ...rest
}: StatRowProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3",
        COLUMNS[columns],
        divided && "sm:[&>*:not(:first-child)]:border-l sm:[&>*:not(:first-child)]:border-line sm:[&>*:not(:first-child)]:pl-4",
        panel && "panel px-4 py-3",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
