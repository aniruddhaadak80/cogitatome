import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface LabelProps extends ComponentPropsWithRef<"label"> {
  /** Renders a phosphor asterisk. The control still needs `required` for the
   *  semantics — this is only the visual cue. */
  required?: boolean;
  /** Renders an "(optional)" mono caption. */
  optional?: boolean;
}

/** A form label. Pairs with `<Field>` or `htmlFor` on its own. */
export function Label({ required = false, optional = false, className, children, ref, ...rest }: LabelProps) {
  return (
    <label
      ref={ref as Ref<HTMLLabelElement>}
      className={cn("flex items-center gap-1.5 text-sm font-medium text-ink", className)}
      {...rest}
    >
      <span className="truncate">{children}</span>
      {required ? (
        <span className="text-amber" aria-hidden="true">
          *
        </span>
      ) : null}
      {optional ? <span className="mono-label">optional</span> : null}
    </label>
  );
}
