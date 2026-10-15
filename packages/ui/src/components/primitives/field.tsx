import { createContext, useContext, useId, type ComponentPropsWithRef, type ReactNode, type Ref } from "react";
import { cn, joinIds } from "../../lib/cn";

/** What a control inside a `<Field>` needs to wire itself up correctly. */
export interface FieldControl {
  /** id of the control itself — the `<label>`'s `htmlFor` target. */
  readonly controlId: string;
  /** id list the control should point `aria-describedby` at. */
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/**
 * Returns the surrounding field's wiring, or `null` when the control is used
 * standalone. Every form primitive calls this so `<Field>` and a bare `<Input>`
 * behave identically.
 */
export function useFieldControl(): FieldControl | null {
  return useContext(FieldContext);
}

export interface FieldProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** Visible label. Also names the group for assistive tech. */
  label: ReactNode;
  /** Helper text under the control. */
  description?: ReactNode;
  /** Error message. Sets `aria-invalid` on the control and announces itself. */
  error?: ReactNode;
  /** Right-aligned metadata in the label row, e.g. a count. */
  hint?: ReactNode;
  required?: boolean;
  /** Either the control, or a render function that receives the wiring. */
  children: ReactNode | ((control: FieldControl) => ReactNode);
}

/**
 * Label + description + error, wired to whatever control sits inside.
 *
 * The control is not cloned — it reads the context, so any component in this
 * package (or a plain `<input>`) works without extra props.
 */
export function Field({
  label,
  description,
  error,
  hint,
  required = false,
  className,
  children,
  id,
  ref,
  ...rest
}: FieldProps) {
  const uid = useId();
  const controlId = id ?? `field-${uid}`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const labelId = `${controlId}-label`;

  const control: FieldControl = {
    controlId,
    describedBy: joinIds(description ? descriptionId : undefined, error ? errorId : undefined),
    invalid: error !== undefined && error !== null && error !== false,
    required
  };

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={control.describedBy}
      data-invalid={control.invalid || undefined}
      className={cn("flex flex-col gap-1.5", className)}
      {...rest}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={controlId} id={labelId} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-1 text-amber" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {hint ? <span className="mono-label shrink-0">{hint}</span> : null}
      </div>

      <FieldContext.Provider value={control}>
        {typeof children === "function" ? children(control) : children}
      </FieldContext.Provider>

      {description ? (
        <p id={descriptionId} className="m-0 text-xs leading-snug text-ink-dim">
          {description}
        </p>
      ) : null}

      {control.invalid ? (
        <p id={errorId} role="alert" className="m-0 text-xs leading-snug text-rose">
          {error}
        </p>
      ) : null}
    </div>
  );
}
