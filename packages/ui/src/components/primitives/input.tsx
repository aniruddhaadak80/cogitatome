import type { ComponentPropsWithRef, Ref } from "react";
import { cn, joinIds } from "../../lib/cn";
import { useFieldControl } from "./field";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends ComponentPropsWithRef<"input"> {
  /** Named `controlSize` because `<input size>` is an HTML attribute. */
  controlSize?: InputSize;
  /** Sets `aria-invalid` and paints the rose border. */
  invalid?: boolean;
}

const BASE =
  "w-full rounded-control border border-line bg-surface-2 text-ink transition-colors duration-fast placeholder:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-60 data-[invalid=true]:border-rose";

const SIZES: Record<InputSize, string> = {
  sm: "h-8 px-2.5 text-sm",
  md: "h-9 px-3 text-base",
  lg: "h-11 px-3.5 text-md"
};

/** A text input. Inherits id/description wiring from a surrounding `<Field>`. */
export function Input({
  controlSize = "md",
  invalid = false,
  className,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  required,
  ...rest
}: InputProps) {
  const field = useFieldControl();

  return (
    <input
      ref={ref as Ref<HTMLInputElement>}
      id={id ?? field?.controlId}
      required={required ?? (field?.required || undefined)}
      aria-invalid={invalid || field?.invalid || undefined}
      aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
      data-invalid={invalid || field?.invalid || undefined}
      className={cn(BASE, SIZES[controlSize], className)}
      {...rest}
    />
  );
}
