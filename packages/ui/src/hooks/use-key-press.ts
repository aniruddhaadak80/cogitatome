import { useEffect, useRef } from "react";

export type KeyPressTarget = "window" | "document";

export interface UseKeyPressOptions {
  target?: KeyPressTarget;
  /** Set false to detach without unmounting. */
  enabled?: boolean;
}

function partsOf(combo: string): string[] {
  return combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Does this event satisfy `combo`? Supports `ctrl`, `alt`, `shift`, `meta`. */
function matches(event: KeyboardEvent, combo: string): boolean {
  const parts = partsOf(combo);
  const key = parts[parts.length - 1] ?? "";
  if (key.length === 0) return false;

  const need = (name: string): boolean =>
    parts.includes(name) || (name === "meta" && (parts.includes("cmd") || parts.includes("mod")));

  if (event.ctrlKey !== need("ctrl")) return false;
  if (event.altKey !== need("alt")) return false;
  if (event.metaKey !== need("meta")) return false;
  if (event.shiftKey !== need("shift")) return false;

  const pressed = event.key.toLowerCase();
  if (pressed === key) return true;
  if (key === "space" && pressed === " ") return true;
  if (key === "esc" && pressed === "escape") return true;
  return false;
}

/**
 * Global keyboard shortcut.
 *
 * The handler is read from a ref, so a closure that changes identity every
 * render never re-subscribes. Pass a combo such as `"k"`, `"ctrl+k"` or
 * `"shift+/"`, or an array of them.
 */
export function useKeyPress(
  key: string | readonly string[],
  handler: (event: KeyboardEvent) => void,
  options: UseKeyPressOptions = {}
): void {
  const { target = "window", enabled = true } = options;
  const combos: readonly string[] = typeof key === "string" ? [key] : key;
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const node: Window | Document | null =
      target === "document"
        ? (typeof document === "undefined" ? null : document)
        : (typeof window === "undefined" ? null : window);
    if (!node) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (combos.some((combo) => matches(event, combo))) latest.current(event);
    };
    const listener: EventListener = (event) => onKeyDown(event as KeyboardEvent);

    node.addEventListener("keydown", listener);
    return () => node.removeEventListener("keydown", listener);
  }, [combos.join("|"), enabled, target]);
}
