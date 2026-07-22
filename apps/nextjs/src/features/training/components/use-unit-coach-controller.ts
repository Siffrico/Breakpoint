"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  UnitCoachCommandIntent,
  UnitCoachTrigger,
} from "~/features/training/lib/unit-coach-commands";

const MAX_COACH_EXCERPT_CHARS = 3_200;

export interface UnitCoachController {
  open: boolean;
  focused: boolean;
  trigger: UnitCoachTrigger | null;
  toggle: () => void;
  close: () => void;
  toggleFocus: () => void;
  returnToUnit: () => void;
  runCommand: (intent: UnitCoachCommandIntent) => void;
  askAboutAnswer: (answer: string) => void;
  askAboutSelection: (selection: string) => void;
}

/**
 * Owns every piece of Unit Coach panel state. Intents are ignored while no
 * unit is active; the trigger nonce forces the panel to react to a repeated
 * identical intent.
 */
export function useUnitCoachController(
  activeUnitId: string | null,
): UnitCoachController {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [trigger, setTrigger] = useState<UnitCoachTrigger | null>(null);

  const openWith = useCallback(
    (build: (nonce: number, unitId: string) => UnitCoachTrigger) => {
      if (!activeUnitId) return;
      setOpen(true);
      setTrigger((previous) => build((previous?.nonce ?? 0) + 1, activeUnitId));
    },
    [activeUnitId],
  );

  const runCommand = useCallback(
    (intent: UnitCoachCommandIntent) => {
      openWith((nonce, unitId) => ({ intent, nonce, unitId }));
    },
    [openWith],
  );

  const askFreeform = useCallback(
    (message: string) => {
      openWith((nonce, unitId) => ({
        intent: "freeform",
        message,
        nonce,
        unitId,
      }));
    },
    [openWith],
  );

  const askAboutAnswer = useCallback(
    (answer: string) => {
      const excerpt = answer.trim().slice(0, MAX_COACH_EXCERPT_CHARS);
      askFreeform(
        `Help me improve this submitted answer without rewriting it for me. Identify the weakest reasoning, then ask one focused question.\n\nSubmitted answer:\n${excerpt}`,
      );
    },
    [askFreeform],
  );

  const askAboutSelection = useCallback(
    (selection: string) => {
      const excerpt = selection.trim().slice(0, MAX_COACH_EXCERPT_CHARS);
      if (!excerpt) return;
      askFreeform(`Explain this part of the lesson:\n\n"${excerpt}"`);
    },
    [askFreeform],
  );

  const toggle = useCallback(() => {
    setTrigger(null);
    setOpen((wasOpen) => (focused ? true : !wasOpen));
  }, [focused]);

  const close = useCallback(() => {
    setFocused(false);
    setOpen(false);
    setTrigger(null);
  }, []);

  const toggleFocus = useCallback(() => {
    setOpen(true);
    setFocused((wasFocused) => !wasFocused);
  }, []);

  const returnToUnit = useCallback(() => {
    setFocused(false);
  }, []);

  // Stable identity so memoized consumers re-render only on real changes.
  return useMemo(
    () => ({
      open,
      focused,
      trigger,
      toggle,
      close,
      toggleFocus,
      returnToUnit,
      runCommand,
      askAboutAnswer,
      askAboutSelection,
    }),
    [
      open,
      focused,
      trigger,
      toggle,
      close,
      toggleFocus,
      returnToUnit,
      runCommand,
      askAboutAnswer,
      askAboutSelection,
    ],
  );
}
