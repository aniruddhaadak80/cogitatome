import type { ComponentPropsWithRef, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";

export type TableAlign = "start" | "center" | "end";

const ALIGN: Record<TableAlign, string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right"
};

export interface TableProps extends ComponentPropsWithRef<"table"> {
  /** Tight vertical rhythm. */
  dense?: boolean;
  /** Striped rows. */
  zebra?: boolean;
  /** Rendered inside a `<caption>`. */
  caption?: ReactNode;
  /** Classes for the horizontal-scroll wrapper. */
  containerClassName?: string;
}

/** The table primitive. Everything else in `data/` composes these. */
export function Table({
  dense = false,
  zebra = false,
  caption,
  containerClassName,
  className,
  children,
  ref,
  ...rest
}: TableProps) {
  return (
    <div className={cn("w-full overflow-x-auto", containerClassName)}>
      <table
        ref={ref as Ref<HTMLTableElement>}
        className={cn(
          "w-full border-collapse text-base",
          dense ? "text-sm" : "text-base",
          zebra && "[&_tbody>tr:nth-child(even)]:bg-surface-3/40",
          className
        )}
        {...rest}
      >
        {caption ? <caption className="px-3 py-2 text-left text-sm text-ink-dim">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export interface TableSectionProps extends ComponentPropsWithRef<"thead" | "tbody" | "tfoot"> {
  variant?: "head" | "body" | "foot";
}

export function THead({ className, ...rest }: TableSectionProps) {
  return <thead className={cn("border-b border-line", className)} {...rest} />;
}

export function TBody({ zebra = false, className, ...rest }: ComponentPropsWithRef<"tbody"> & { zebra?: boolean }) {
  return (
    <tbody
      className={cn(zebra && "[&>tr:nth-child(even)]:bg-surface-3/40", className)}
      {...rest}
    />
  );
}

export function TFoot({ className, ...rest }: TableSectionProps) {
  return <tfoot className={cn("border-t border-line font-medium", className)} {...rest} />;
}

export interface TableRowProps extends ComponentPropsWithRef<"tr"> {
  selected?: boolean;
}

export function TableRow({ selected = false, className, ...rest }: TableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-line/70 transition-colors duration-fast last:border-b-0",
        selected && "bg-cyan/10",
        className
      )}
      {...rest}
    />
  );
}

export interface TableCellProps extends Omit<ComponentPropsWithRef<"td">, "align"> {
  align?: TableAlign;
  numeric?: boolean;
}

export function Td({ align = "start", numeric = false, className, ...rest }: TableCellProps) {
  return (
    <td className={cn("px-3 py-2 align-middle text-ink", ALIGN[align], numeric && "tabular-nums", className)} {...rest} />
  );
}

export interface TableHeaderCellProps extends Omit<ComponentPropsWithRef<"th">, "align"> {
  align?: TableAlign;
  numeric?: boolean;
  /** Sort state, when the header controls the order. */
  sort?: "asc" | "desc" | "none";
  /** Provided together with `sort`; makes the header a real button. */
  onSort?: () => void;
  scope?: "col" | "row";
}

export function Th({
  align = "start",
  numeric = false,
  sort,
  onSort,
  scope = "col",
  className,
  children,
  ...rest
}: TableHeaderCellProps) {
  const content = (
    <>
      <span className="truncate">{children}</span>
      {sort === "asc" ? (
        <span aria-hidden="true" className="text-cyan">
          ▲
        </span>
      ) : sort === "desc" ? (
        <span aria-hidden="true" className="text-cyan">
          ▼
        </span>
      ) : null}
    </>
  );

  return (
    <th
      scope={scope}
      aria-sort={sort === undefined ? undefined : sort === "none" ? "none" : sort === "asc" ? "ascending" : "descending"}
      className={cn(
        "px-3 py-2 text-xs font-medium tracking-wide text-ink-dim uppercase",
        ALIGN[align],
        numeric && "tabular-nums",
        className
      )}
      {...rest}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex w-full items-center gap-1 rounded-cell transition-colors duration-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
            align === "end" && "justify-end",
            align === "center" && "justify-center"
          )}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}
