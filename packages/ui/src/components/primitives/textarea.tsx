import type { ComponentPropsWithRef, Ref } from "react";
import { cn, joinIds } from "../../lib/cn";
import { useFieldControl } from "./field";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  invalid?: boolean;
  /** Visible rows. Also sets `field-sizing` so the box still grows. */
  rows?: number;
}

const BASE =
  "w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-base leading-snug text-ink transition-colors duration-fast placeholder:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:border-rose";

/** A multi-line text control, resizable on the vertical axis only. */
export function Textarea({
  invalid = false,
  rows = 3,
  className,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  required,
  ...rest
}: TextareaProps) {
  const field = useFieldControl();

  return (
    <textarea
      ref={ref as Ref<HTMLTextAreaElement>}
      id={id ?? field?.controlId}
      rows={rows}
      required={required ?? (field?.required || undefined)}
      aria-invalid={invalid || field?.invalid || undefined}
      aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
      data-invalid={invalid || field?.invalid || undefined}
      className={cn(BASE, "resize-y", className)}
      {...rest}
    />
  );
}
