import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn, joinIds } from "../../lib/cn";
import { useFieldControl } from "./field";

export interface SwitchProps
  extends Omit<ComponentPropsWithRef<"button">, "onChange" | "value" | "defaultValue" | "children"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label. Also the accessible name, unless `hideLabel` is set. */
  label?: ReactNode;
  hideLabel?: boolean;
  /** Secondary text under the label. */
  description?: ReactNode;
  size?: "sm" | "md";
}

/** A controlled on/off switch. `role="switch"`, so Space and Enter toggle it. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  hideLabel = false,
  description,
  size = "md",
  className,
  disabled = false,
  id,
  ref,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: SwitchProps) {
  const field = useFieldControl();
  const controlId = id ?? field?.controlId;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        role="switch"
        id={controlId}
        aria-checked={checked}
        aria-describedby={joinIds(field?.describedBy, ariaDescribedBy)}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "group inline-flex items-center gap-2.5 rounded-control text-left transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50"
        )}
        {...rest}
      >
        {label && !hideLabel ? (
          <span className="flex flex-col gap-0.5">
            <span className="text-sm leading-tight text-ink">{label}</span>
            {description ? <span className="text-xs leading-snug text-ink-dim">{description}</span> : null}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className={cn(
            "relative shrink-0 rounded-full border transition-colors duration-fast",
            size === "sm" ? "h-4 w-7" : "h-5 w-9",
            checked ? "border-cyan bg-cyan/25" : "border-line bg-surface-3 group-hover:border-indigo-3"
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-fast",
              size === "sm" ? "size-2.5" : "size-3.5",
              checked ? (size === "sm" ? "left-3.5" : "left-4.5") : "left-0.5",
              checked ? "bg-cyan" : "bg-slate"
            )}
          />
        </span>
      </button>
    </div>
  );
}
