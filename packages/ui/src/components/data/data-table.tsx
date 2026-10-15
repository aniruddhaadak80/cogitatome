import { useMemo, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { EmptyState } from "../primitives/empty-state";
import { Pagination } from "../primitives/pagination";
import { VisuallyHidden } from "../primitives/visually-hidden";
import { Table, TBody, Td, Th, THead, type TableAlign } from "./table";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: TableAlign;
  width?: string;
  numeric?: boolean;
  sortable?: boolean;
  /** Sort key. Without it the column renders unsorted. */
  sortValue?: (row: T) => number | string;
  /** Drop the column below this breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableSort {
  columnId: string;
  direction: "asc" | "desc";
}

export interface DataTableProps<T> extends Omit<ComponentPropsWithRef<"div">, "children" | "onClick"> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T, index: number) => string;
  /** Accessible name for the table, rendered as a visually hidden caption. */
  label?: string;
  caption?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Controlled sort. Omit to let the table own it. */
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /** Turns on client-side paging. */
  pageSize?: number;
  dense?: boolean;
  zebra?: boolean;
  footer?: ReactNode;
}

const HIDE: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell"
};

function compare(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * A sortable, pageable table.
 *
 * Sorting is exposed with `aria-sort` on the header, the sort trigger is a real
 * button inside the `<th>`, and every row is a genuine `<tr>` — no divs, no
 * ARIA required to make it read like a table.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  label,
  caption,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  emptyAction,
  onRowClick,
  sort,
  defaultSort = null,
  onSortChange,
  pageSize,
  dense = false,
  zebra = true,
  footer,
  className,
  ...rest
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(defaultSort);
  const [page, setPage] = useState(1);

  const activeSort = sort !== undefined ? sort : internalSort;
  const pageCount = pageSize && pageSize > 0 ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);

  const sorted = useMemo(() => {
    if (!activeSort) return rows;
    const column = columns.find((entry) => entry.id === activeSort.columnId);
    if (!column?.sortValue) return rows;
    const factor = activeSort.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => compare(column.sortValue!(left), column.sortValue!(right)) * factor);
  }, [rows, columns, activeSort]);

  const visible = useMemo(() => {
    if (!pageSize || pageSize <= 0) return sorted;
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSize, safePage]);

  const toggleSort = (columnId: string): void => {
    const column = columns.find((entry) => entry.id === columnId);
    if (!column?.sortable || !column.sortValue) return;

    let next: DataTableSort | null;
    if (activeSort?.columnId === columnId) {
      next = activeSort.direction === "asc" ? { columnId, direction: "desc" } : null;
    } else {
      next = { columnId, direction: "asc" };
    }
    if (sort === undefined) setInternalSort(next);
    onSortChange?.(next);
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} {...rest}>
      <Table
        caption={caption}
        dense={dense}
        zebra={zebra}
        containerClassName="rounded-panel border border-line"
      >
        {label ? (
          <caption className="sr-only">
            <VisuallyHidden>{label}</VisuallyHidden>
          </caption>
        ) : null}

        <THead>
          <tr>
            {columns.map((column) => (
              <Th
                key={column.id}
                align={column.align ?? (column.numeric ? "end" : "start")}
                numeric={column.numeric}
                sort={
                  column.sortable
                    ? activeSort?.columnId === column.id
                      ? activeSort.direction
                      : "none"
                    : undefined
                }
                onSort={column.sortable ? () => toggleSort(column.id) : undefined}
                style={column.width ? { width: column.width } : undefined}
                className={column.hideBelow ? HIDE[column.hideBelow] : undefined}
              >
                {column.header}
              </Th>
            ))}
          </tr>
        </THead>

        <TBody>
          {visible.map((row, index) => (
            <tr
              key={getRowId(row, index)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "border-b border-line/70 transition-colors duration-fast last:border-b-0",
                onRowClick && "cursor-pointer hover:bg-surface-3"
              )}
            >
              {columns.map((column) => (
                <Td
                  key={column.id}
                  align={column.align ?? (column.numeric ? "end" : "start")}
                  numeric={column.numeric}
                  className={column.hideBelow ? HIDE[column.hideBelow] : undefined}
                >
                  {column.cell(row, index)}
                </Td>
              ))}
            </tr>
          ))}
        </TBody>
      </Table>

      {pageCount > 1 ? (
        <Pagination
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          label={typeof label === "string" ? `${label} pagination` : "Pagination"}
        />
      ) : null}

      {footer}
    </div>
  );
}
