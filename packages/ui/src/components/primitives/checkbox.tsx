import type { ComponentPropsWithRef, Ref } from "react";
import { joinIds } from "../../lib/cn";
import { useFieldControl } from "./field";

export interface CheckboxProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
  /** Visible label next to the box. Also becomes the accessible name. */
  label?: React.ReactNode;
  /** Secondary text under the label. */
  description?: React.ReactNode;
  /** Mixed state. Set via the DOM because React has no `indeterminate` prop. */
  indeterminate?: boolean;
}

function assignRef(ref: Ref<HTMLInputElement> | undefined, value: HTMLInputElement | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: HTMLInputElement | null }).current = value;
}

// prettier-ignore
const BOX =
  "peer size-4 shrink-0 appearance-none rounded-cell border border-line bg-surface-3 transition-colors duration-fast " +
  "checked:border-cyan checked:bg-cyan/20 indeterminate:border-cyan indeterminate:bg-cyan/20 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50";

/** A real checkbox: native semantics, custom look, optional label and hint. */
export function Checkbox({
  label,
  description,
  indeterminate = false,
  className,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  required,
  ...rest
}: CheckboxProps) {
  const field = useFieldControl();
  const controlId = id ?? field?.controlId;

  return (
    <div className={className ? `flex flex-col gap-1 ${className}` : "flex flex-col gap-1"}>
      <label htmlFor={controlId} className="flex cursor-pointer items-start gap-2">
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <input
            {...rest}
            ref={(node) => {
              if (node) node.indeterminate = indeterminate;
              assignRef(ref, node);
            }}
            type="checkbox"
            id={controlId}
            required={required ?? (field?.required || undefined)}
            aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
            className={BOX}
          />
          <svg
            viewBox="0 0 12 12"
            className="pointer-events-none absolute size-3 text-cyan opacity-0 transition-opacity duration-fast peer-checked:opacity-100"
            aria-hidden="true"
            focusable="false"
          >
            <title>Checked</title>
            <path
              d="M2.5 6.4l2.3 2.3 4.7-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            viewBox="0 0 12 12"
            className="pointer-events-none absolute size-3 text-cyan opacity-0 transition-opacity duration-fast peer-indeterminate:opacity-100"
            aria-hidden="true"
            focusable="false"
          >
            <title>Mixed</title>
            <path d="M2.8 6h6.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        {label || description ? (
          <span className="flex flex-col gap-0.5">
            {label ? <span className="text-sm leading-tight text-ink">{label}</span> : null}
            {description ? <span className="text-xs leading-snug text-ink-dim">{description}</span> : null}
          </span>
        ) : null}
      </label>
    </div>
  );
}
