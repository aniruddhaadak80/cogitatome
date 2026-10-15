import type { ComponentPropsWithRef, Ref } from "react";
import { cn, joinIds } from "../../lib/cn";
import { formatNumber } from "../../lib/palette";
import { useFieldControl } from "./field";

export interface SliderProps extends Omit<ComponentPropsWithRef<"input">, "type" | "size"> {
  /** Formats the value shown next to the track. */
  formatValue?: (value: number) => string;
  /** Hide the numeric readout. */
  hideValue?: boolean;
  invalid?: boolean;
}

const TRACK =
  "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50";

/** A native range input with a mono readout, so the value is always legible. */
export function Slider({
  formatValue,
  hideValue = false,
  invalid = false,
  className,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  required,
  ...rest
}: SliderProps) {
  const field = useFieldControl();
  const numeric = typeof rest.value === "number" ? rest.value : Number(rest.defaultValue ?? 0);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        {...rest}
        ref={ref as Ref<HTMLInputElement>}
        type="range"
        id={id ?? field?.controlId}
        required={required ?? (field?.required || undefined)}
        aria-invalid={invalid || field?.invalid || undefined}
        aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
        className={cn(TRACK, invalid && "accent-rose")}
      />
      {hideValue ? null : (
        <output
          htmlFor={id ?? field?.controlId}
          className="mono-label w-12 shrink-0 text-right tabular-nums text-ink"
        >
          {formatValue ? formatValue(numeric) : formatNumber(numeric, 2)}
        </output>
      )}
    </div>
  );
}
