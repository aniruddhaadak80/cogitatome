import { useCallback, useSyncExternalStore } from "react";

const noopSubscribe = (): (() => void) => () => {};

function subscribeToQuery(query: string): (onChange: () => void) => () => void {
  return (onChange) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return noopSubscribe();
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

/**
 * Reactive `matchMedia`.
 *
 * Uses `useSyncExternalStore` so the value is consistent across a server render
 * (always `false` there) and a client hydration pass, and so it follows live
 * changes to the media query instead of freezing on mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(subscribeToQuery(query), [query]);
  const getSnapshot = useCallback(
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false),
    [query]
  );
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
