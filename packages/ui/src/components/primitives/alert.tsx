import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps extends Omit<ComponentPropsWithRef<"div">, "title" | "role"> {
  tone?: AlertTone;
  title?: ReactNode;
  /** Custom icon, or `false` to drop the default one. */
  icon?: ReactNode | false;
  /** Renders a dismiss button and calls back when it is activated. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /**
   * `alert` is assertive (use for errors), `status` is polite (use for
   * progress information), `none` removes the live region entirely.
   */
  role?: "alert" | "status" | "none";
}

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: "border-cyan/35 bg-cyan/8 text-ink", icon: "text-cyan" },
  success: { box: "border-lime/35 bg-lime/8 text-ink", icon: "text-lime" },
  warning: { box: "border-amber/40 bg-amber/8 text-ink", icon: "text-amber" },
  danger: { box: "border-rose/40 bg-rose/8 text-ink", icon: "text-rose" }
};

function DefaultIcon({ tone, className }: { tone: AlertTone; className?: string }) {
  const path =
    tone === "danger"
      ? "M8 2.5l5.5 10h-11z"
      : tone === "warning"
        ? "M8 2.5l5.5 10h-11z"
        : tone === "success"
          ? "M2.8 8.4l3.2 3.2 7.2-7.2"
          : "M8 3.2v9M3.2 8h9.6";
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden="true" focusable="false">
      <title>{tone === "danger" ? "Error" : tone === "warning" ? "Warning" : tone === "success" ? "Success" : "Info"}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {tone === "danger" || tone === "warning" ? (
        <path d="M8 6.5v2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** An inline message block. Errors are announced; info blocks are not. */
export function Alert({
  tone = "info",
  title,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  role,
  className,
  children,
  ref,
  ...rest
}: AlertProps) {
  const resolvedRole = role === "none" ? undefined : (role ?? (tone === "danger" ? "alert" : "status"));

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role={resolvedRole}
      className={cn("flex gap-3 rounded-panel border p-3 text-base", TONES[tone].box, className)}
      {...rest}
    >
      {icon === false ? null : icon ?? <DefaultIcon tone={tone} className={TONES[tone].icon} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="m-0 font-display text-base font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-base leading-snug text-ink-dim">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-m-1 grid size-6 shrink-0 place-items-center self-start rounded-cell text-ink-dim transition-colors duration-fast hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan"
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true" focusable="false">
            <title>Dismiss</title>
            <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
