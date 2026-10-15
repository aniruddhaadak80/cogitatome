import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCopyOptions {
  /** How long `copied` stays true. Defaults to 1600ms. */
  timeout?: number;
}

export interface UseCopyResult {
  /** True right after a successful copy. */
  copied: boolean;
  /** The failure, when the clipboard refused or is unavailable. */
  error: Error | null;
  /** Copy text. Resolves true on success, false on failure. */
  copy: (text: string) => Promise<boolean>;
  /** Clear `copied` and `error` immediately. */
  reset: () => void;
}

/**
 * `navigator.clipboard` with state.
 *
 * The API is missing on insecure origins and in jsdom, so failures are reported
 * through `error` rather than thrown — a copy button must never break the page
 * it sits on.
 */
export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const { timeout = 1600 } = options;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      clear();
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
          throw new Error("Clipboard API unavailable in this context");
        }
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);
        if (timeout > 0) timer.current = setTimeout(() => setCopied(false), timeout);
        return true;
      } catch (cause) {
        setCopied(false);
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        return false;
      }
    },
    [clear, timeout]
  );

  const reset = useCallback(() => {
    clear();
    setCopied(false);
    setError(null);
  }, [clear]);

  return { copied, error, copy, reset };
}
