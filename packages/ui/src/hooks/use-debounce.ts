import { useEffect, useState } from "react";

/**
 * Debounce any value — search boxes, sliders, streaming counters.
 *
 * The timer restarts on every change, and an empty delay passes the value
 * straight through so `useDebounce(value, 0)` is a no-op rather than a trap.
 */
export function useDebounce<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return undefined;
    }
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
