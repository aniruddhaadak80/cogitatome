import type { ComponentPropsWithRef, Ref } from "react";
import { cn, joinIds } from "../../lib/cn";
import { useFieldControl } from "./field";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectProps extends ComponentPropsWithRef<"select"> {
  controlSize?: SelectSize;
  invalid?: boolean;
  /** Placeholder rendered as a disabled first option. */
  placeholder?: string;
}

const BASE =
  "w-full appearance-none rounded-control border border-line bg-surface-2 pr-8 text-ink transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:border-rose";

const SIZES: Record<SelectSize, string> = {
  sm: "h-8 pl-2.5 text-sm",
  md: "h-9 pl-3 text-base",
  lg: "h-11 pl-3.5 text-md"
};

/**
 * A native `<select>` — it keeps platform keyboard behaviour and mobile pickers
 * for free. The chevron is decorative; the control itself is exposed normally.
 */
export function Select({
  controlSize = "md",
  invalid = false,
  placeholder,
  className,
  children,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  required,
  ...rest
}: SelectProps) {
  const field = useFieldControl();

  return (
    <span className="relative inline-flex w-full">
      <select
        ref={ref as Ref<HTMLSelectElement>}
        id={id ?? field?.controlId}
        required={required ?? (field?.required || undefined)}
        aria-invalid={invalid || field?.invalid || undefined}
        aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
        data-invalid={invalid || field?.invalid || undefined}
        className={cn(BASE, SIZES[controlSize], className)}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <svg
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-dim"
        aria-hidden="true"
        focusable="false"
      >
        <title>Expand</title>
        <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
