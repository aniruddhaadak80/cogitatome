import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends ComponentPropsWithRef<"div"> {
  /** `panel` floats on the app background, `pane` insets inside a panel. */
  tone?: "panel" | "pane" | "flat";
  /** Adds the scanline texture. Purely decorative. */
  scanline?: boolean;
  /** Renders the card as a `<section>` with an accessible name. */
  label?: string;
}

const TONES: Record<NonNullable<CardProps["tone"]>, string> = {
  panel: "panel",
  pane: "pane",
  flat: "border border-line bg-transparent"
};

/** The container every instrument panel is built from. */
export function Card({ tone = "panel", scanline = false, label, className, children, ref, ...rest }: CardProps) {
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      aria-label={label}
      className={cn(TONES[tone], scanline && "scanline", "relative", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends ComponentPropsWithRef<"div"> {
  /** Number of columns the eyebrow row occupies. */
  split?: boolean;
}

export function CardHeader({ split = false, className, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3",
        split && "flex-col items-stretch",
        className
      )}
      {...rest}
    />
  );
}

/** Small mono caption above a card title. */
export function CardEyebrow({ className, ...rest }: ComponentPropsWithRef<"p">) {
  return <p className={cn("mono-label m-0", className)} {...rest} />;
}

export interface CardTitleProps extends ComponentPropsWithRef<"h3"> {
  /** Heading level. Defaults to `h3` because cards live inside pages. */
  as?: "h2" | "h3" | "h4";
}

export function CardTitle({ as = "h3", className, ...rest }: CardTitleProps) {
  const Tag = as;
  return (
    <Tag
      className={cn("font-display text-md leading-tight font-semibold tracking-tight text-ink", className)}
      {...rest}
    />
  );
}

export function CardDescription({ className, ...rest }: ComponentPropsWithRef<"p">) {
  return <p className={cn("m-0 text-base leading-snug text-ink-dim", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div className={cn("px-4 py-3", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3", className)}
      {...rest}
    />
  );
}
