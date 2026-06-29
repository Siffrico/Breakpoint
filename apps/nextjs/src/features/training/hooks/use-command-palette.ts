"use client";

import { useEffect, useState } from "react";

/**
 * Owns the open state for the workspace command palette and the global
 * keyboard shortcuts that drive it:
 *   - ⌘K / Ctrl+K  → toggle the palette
 *   - ⌘N / Ctrl+N  → start a new topic (and close the palette if open)
 *
 * ⌘K intentionally fires even while a field is focused — that is the expected
 * command-palette affordance. The handler lives on `window` so the shortcuts
 * work anywhere the host (the sidebar) is mounted.
 */
export function useCommandPalette({
  onNewTopic,
}: {
  onNewTopic?: () => void;
} = {}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        setOpen((previous) => !previous);
        return;
      }

      if (key === "n") {
        event.preventDefault();
        setOpen(false);
        onNewTopic?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewTopic]);

  return { open, setOpen };
}
