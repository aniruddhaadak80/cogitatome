import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type CalloutTone = "note" | "warning" | "signal" | "danger";

export interface CalloutProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  tone?: CalloutTone;
  title?: ReactNode;
  /** Overrides the mono eyebrow (`note`, `warning`, …). */
  eyebrow?: string;
}

const TONES: Record<CalloutTone, { accent: string; eyebrow: string }> = {
  note: { accent: "border-l-slate", eyebrow: "Note" },
  warning: { accent: "border-l-amber", eyebrow: "Warning" },
  signal: { accent: "border-l-cyan", eyebrow: "Signal" },
  danger: { accent: "border-l-rose", eyebrow: "Danger" }
};

/**
 * A quieter cousin of `<Alert>`: no live region, just an accented note inside
 * a pane. Use it for prose that belongs to the panel it sits in.
 */
export function Callout({ tone = "note", title, eyebrow, className, children, ref, ...rest }: CalloutProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn("pane border-l-2 px-3 py-2.5", TONES[tone].accent, className)}
      {...rest}
    >
      <p className="mono-label m-0">{eyebrow ?? TONES[tone].eyebrow}</p>
      {title ? <p className="mt-1 mb-0 font-display text-base font-semibold text-ink">{title}</p> : null}
      {children ? <div className="mt-1 text-base leading-snug text-ink-dim">{children}</div> : null}
    </div>
  );
}
