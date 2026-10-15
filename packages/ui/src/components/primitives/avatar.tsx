import type { ComponentPropsWithRef, Ref } from "react";
import { cn } from "../../lib/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Person, model or artefact the avatar stands for. Names the avatar. */
  name: string;
  src?: string;
  size?: AvatarSize;
  /** Square corners — used for artefacts rather than people. */
  square?: boolean;
}

const SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-2xs",
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-10 text-base"
};

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => [...part][0] ?? "").join("").toUpperCase();
}

/** Deterministic accent per name, so the same actor keeps the same colour. */
function tint(name: string): string {
  const palette = ["bg-cyan/20 text-cyan", "bg-amber/20 text-amber", "bg-violet/20 text-violet", "bg-lime/20 text-lime", "bg-rose/20 text-rose"];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 100000;
  return palette[hash % palette.length] ?? "bg-surface-3 text-ink-dim";
}

/**
 * Image avatar with an initials fallback. The whole element is `role="img"`,
 * so the name is announced whether or not the image loaded.
 */
export function Avatar({ name, src, size = "md", square = false, className, ref, ...rest }: AvatarProps) {
  return (
    <span
      ref={ref as Ref<HTMLSpanElement>}
      role="img"
      aria-label={name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line font-display font-semibold",
        square && "rounded-cell",
        SIZES[size],
        !src && tint(name),
        className
      )}
      {...rest}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
