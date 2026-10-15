import type { ComponentPropsWithRef, Ref, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Custom glyph. `false` removes the default one. */
  icon?: ReactNode | false;
  /** Primary action, usually a `<Button>`. */
  action?: ReactNode;
  /** Wrap the block in a hairline-bordered pane. Defaults to true. */
  bordered?: boolean;
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-slate" aria-hidden="true" focusable="false">
      <title>No data</title>
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeDasharray="3 2.5"
      />
      <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The "nothing here" state — charts, tables and lists share it so an empty
 * result never looks like a broken one.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  bordered = true,
  className,
  ref,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        bordered && "pane border-dashed",
        className
      )}
      {...rest}
    >
      {icon === false ? null : <div className="mb-1">{icon ?? <DefaultIcon />}</div>}
      <p className="m-0 font-display text-base font-semibold text-ink">{title}</p>
      {description ? <p className="m-0 max-w-prose text-base leading-snug text-ink-dim">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
