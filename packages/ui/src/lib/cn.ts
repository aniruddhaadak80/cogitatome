import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The one class-name joiner in the design system.
 *
 * `clsx` flattens conditionals and arrays; `tailwind-merge` then resolves
 * conflicting Tailwind utilities last-one-wins, so a caller can always override
 * padding or colour with `className` without reaching for `!important`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Join ARIA/id lists, dropping empty parts. */
export function joinIds(...parts: readonly (string | false | null | undefined)[]): string | undefined {
  const ids = parts.filter((part): part is string => typeof part === "string" && part.length > 0);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
