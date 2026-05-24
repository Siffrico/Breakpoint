"use client";

import { useEffect, useState } from "react";

/**
 * Persist a piece of client state in localStorage.
 *
 * SSR-safe: returns the initial value on the server and on first client render,
 * then hydrates from localStorage via useEffect. Corrupted values silently fall
 * back to the initial value.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setHasHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // Corrupted or unparseable — keep the initial value.
    } finally {
      setHasHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or disabled — ignore.
    }
  }, [hasHydrated, key, value]);

  return [value, setValue] as const;
}
