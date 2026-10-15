import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "signal";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /**
   * `primary` is the phosphor-amber action, `secondary` the hairlined panel
   * button, `ghost` for toolbars, `signal` for the cyan instrumentation
   * affordance, `danger` for destructive actions.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and blocks pointer/keyboard activation. */
  loading?: boolean;
  /** Fill the container width. */
  block?: boolean;
}

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-surface-3";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-amber text-void hover:bg-amber-dim hover:text-paper active:bg-amber-dim",
  secondary:
    "border border-line bg-surface-2 text-ink hover:border-indigo-3 hover:bg-surface-3 active:bg-surface-3",
  ghost: "text-ink-dim hover:bg-surface-3 hover:text-ink active:bg-surface-3",
  danger: "bg-rose text-void hover:bg-rose/85 active:bg-rose/85",
  signal: "border border-cyan/45 bg-cyan/5 text-cyan hover:border-cyan hover:bg-cyan/15 active:bg-cyan/20"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-base",
  lg: "h-11 px-5 text-md",
  icon: "size-9 p-0"
};

/** A real `<button>` with the instrument-panel variants. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...rest}
    >
      {loading ? <Spinner className="size-4" label={null} /> : null}
      {children}
    </button>
  );
}
