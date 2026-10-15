import { useCallback, useEffect, useRef, useState } from "react";

export interface UseLocalStorageOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => unknown;
}

export interface UseLocalStorageResult<T> {
  /** Current value. Falls back to `initialValue` when storage is unavailable. */
  value: T;
  /** Set a value, or an updater function. */
  set: (next: T | ((previous: T) => T)) => void;
  /** Remove the key and fall back to `initialValue`. */
  remove: () => void;
}

const fallbackDeserialize = (raw: string): unknown => JSON.parse(raw) as unknown;

function read<T>(key: string, initialValue: T, deserialize: (raw: string) => unknown): T {
  if (typeof window === "undefined") return initialValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initialValue;
    return deserialize(raw) as T;
  } catch {
    // Private mode, disabled storage, quota — the app still works in memory.
    return initialValue;
  }
}

/**
 * `useState` that survives a reload.
 *
 * JSON by default. Writes are wrapped because storage access can throw, and the
 * hook listens for the `storage` event so two tabs never disagree.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): UseLocalStorageResult<T> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const deserialize = optionsRef.current.deserialize ?? fallbackDeserialize;
  const [value, setValue] = useState<T>(() => read(key, initialValue, deserialize));

  const serialized = (optionsRef.current.serialize ?? JSON.stringify)(value);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, serialized);
    } catch {
      // Storage full or blocked — keep the in-memory value and move on.
    }
  }, [key, serialized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== key) return;
      const current = optionsRef.current;
      setValue(read(key, initialValue, current.deserialize ?? fallbackDeserialize));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initialValue]);

  const set = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => (typeof next === "function" ? (next as (previous: T) => T)(previous) : next));
  }, []);

  const remove = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    setValue(initialValue);
  }, [key, initialValue]);

  return { value, set, remove };
}
