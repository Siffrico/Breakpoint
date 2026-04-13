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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // Corrupted or unparseable — keep the initial value.
    }
    // We only want to hydrate once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or disabled — ignore.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
