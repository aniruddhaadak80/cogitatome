import { useEffect, useRef, useState, type RefObject } from "react";

export interface UseIntersectionOptions {
  /** Viewport element. Defaults to the browser viewport. */
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | readonly number[];
  /** Stop observing after the first intersection. */
  once?: boolean;
}

/**
 * Observe an element's visibility in the viewport.
 *
 * Returns the latest entry (null before the first callback fires) and tolerates
 * environments without `IntersectionObserver` — it simply never reports an
 * intersection rather than throwing during render.
 */
export function useIntersection<T extends Element>(
  ref: RefObject<T | null>,
  options: UseIntersectionOptions = {}
): IntersectionObserverEntry | null {
  const { root = null, rootMargin = "0px", threshold = 0, once = false } = options;
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const onceRef = useRef(once);
  onceRef.current = once;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    let stopped = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (!latest) return;
        setEntry(latest);
        if (onceRef.current && latest.isIntersecting) {
          stopped = true;
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold: threshold as number | number[] }
    );

    observer.observe(node);
    return () => {
      if (!stopped) observer.disconnect();
    };
  }, [ref, root, rootMargin, threshold]);

  return entry;
}
