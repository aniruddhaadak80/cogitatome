import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "details"
].join(",");

function isVisible(node: HTMLElement): boolean {
  if (node.hasAttribute("hidden")) return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  return true;
}

/** Everything focusable inside a container, in DOM order. */
export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

export interface FocusTrapOptions {
  /** The element that contains the focus loop. */
  container: RefObject<HTMLElement | null>;
  /** Trap only while true. */
  active: boolean;
  /** Called on Escape. */
  onEscape?: () => void;
  /** Where focus returns when the trap releases. Defaults to the element that
   *  had focus when the trap engaged. */
  returnFocusTo?: RefObject<HTMLElement | null> | HTMLElement | null;
}

/**
 * Modal focus management: contain Tab, close on Escape, restore focus on exit.
 *
 * Visibility is judged from `hidden`/`aria-hidden` rather than layout, because
 * a freshly mounted panel has no layout yet.
 */
export function useFocusTrap({ container, active, onEscape, returnFocusTo }: FocusTrapOptions): void {
  useEffect(() => {
    if (!active) return undefined;
    const node = container.current;
    if (!node) return undefined;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableElements(node)[0] ?? node;
    if (!node.hasAttribute("tabindex")) node.tabIndex = -1;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableElements(node);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === first || !node.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      const target =
        returnFocusTo instanceof HTMLElement
          ? returnFocusTo
          : (returnFocusTo?.current ?? previous ?? null);
      if (target instanceof HTMLElement && document.contains(target)) target.focus();
    };
  }, [active, container, onEscape, returnFocusTo]);
}
