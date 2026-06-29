"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DraftStatus = "idle" | "saving" | "saved";

interface DraftState {
  key: string | null;
  status: DraftStatus;
  value: string;
}

const STORAGE_PREFIX = "bp:response-draft:v1";
const SAVE_DELAY_MS = 400;

const encodeKeyPart = (value: string) => encodeURIComponent(value);

export const onboardingResponseDraftKey = (
  projectId: string,
  promptId: string,
) =>
  `${STORAGE_PREFIX}:onboarding:${encodeKeyPart(projectId)}:${encodeKeyPart(promptId)}`;

export const educationUnitResponseDraftKey = ({
  projectId,
  unitId,
  promptId,
}: {
  projectId: string;
  unitId: string;
  promptId: string;
}) =>
  `${STORAGE_PREFIX}:unit:${encodeKeyPart(projectId)}:${encodeKeyPart(unitId)}:${encodeKeyPart(promptId)}`;

const readDraft = (key: string) => {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const persistDraft = (key: string, value: string) => {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
    return true;
  } catch {
    // Storage can be unavailable or full. Drafting must remain usable.
    return false;
  }
};

/**
 * Persists one response per stable prompt key. Key changes flush the previous
 * prompt before hydrating the next, preventing drafts from leaking between
 * projects, units, or turns.
 */
export function useAutosavedResponseDraft({
  enabled,
  storageKey,
}: {
  enabled: boolean;
  storageKey: string | null;
}) {
  const [state, setState] = useState<DraftState>({
    key: null,
    status: "idle",
    value: "",
  });
  const valuesByKeyRef = useRef(new Map<string, string>());
  const persistedByKeyRef = useRef(new Map<string, string>());
  const saveTimerRef = useRef<number | null>(null);

  const activeValue = state.key === storageKey ? state.value : "";
  const activeStatus = state.key === storageKey ? state.status : "idle";

  const flushKey = useCallback((key: string) => {
    const value = valuesByKeyRef.current.get(key) ?? "";
    if (persistedByKeyRef.current.get(key) === value) return true;
    if (!persistDraft(key, value)) return false;
    persistedByKeyRef.current.set(key, value);
    return true;
  }, []);

  useEffect(() => {
    let hydrationTimer: number;
    if (!enabled || !storageKey) {
      hydrationTimer = window.setTimeout(() => {
        setState({ key: storageKey, status: "idle", value: "" });
      }, 0);
      return () => window.clearTimeout(hydrationTimer);
    }

    const value = readDraft(storageKey);
    valuesByKeyRef.current.set(storageKey, value);
    persistedByKeyRef.current.set(storageKey, value);
    hydrationTimer = window.setTimeout(() => {
      setState({
        key: storageKey,
        status: value ? "saved" : "idle",
        value,
      });
    }, 0);

    return () => {
      window.clearTimeout(hydrationTimer);
      flushKey(storageKey);
    };
  }, [enabled, flushKey, storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey || state.key !== storageKey) return;
    if (persistedByKeyRef.current.get(storageKey) === state.value) return;

    saveTimerRef.current = window.setTimeout(() => {
      const didSave = flushKey(storageKey);
      setState((current) =>
        current.key === storageKey
          ? {
              ...current,
              status: current.value && didSave ? "saved" : "idle",
            }
          : current,
      );
      saveTimerRef.current = null;
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [enabled, flushKey, state.key, state.value, storageKey]);

  useEffect(() => {
    if (!enabled) return;

    const flushVisibleDrafts = () => {
      for (const key of valuesByKeyRef.current.keys()) flushKey(key);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushVisibleDrafts();
    };

    window.addEventListener("pagehide", flushVisibleDrafts);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushVisibleDrafts);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, flushKey]);

  const setValue = useCallback(
    (value: string) => {
      if (enabled && storageKey) {
        valuesByKeyRef.current.set(storageKey, value);
      }
      const isPersisted =
        enabled && storageKey
          ? persistedByKeyRef.current.get(storageKey) === value
          : false;
      setState({
        key: storageKey,
        status: value ? (isPersisted ? "saved" : "saving") : "idle",
        value,
      });
    },
    [enabled, storageKey],
  );

  // Clear the composer while retaining the durable copy until submission wins.
  const markSubmitted = useCallback(() => {
    if (enabled && storageKey) flushKey(storageKey);
    setState({ key: storageKey, status: "idle", value: "" });
    return enabled ? storageKey : null;
  }, [enabled, flushKey, storageKey]);

  const restoreSubmitted = useCallback(
    (submittedKey: string | null, value: string) => {
      if (!submittedKey) {
        setState({ key: storageKey, status: "idle", value });
        return;
      }
      valuesByKeyRef.current.set(submittedKey, value);
      const didSave = persistDraft(submittedKey, value);
      if (didSave) persistedByKeyRef.current.set(submittedKey, value);
      setState({
        key: submittedKey,
        status: didSave ? "saved" : "idle",
        value,
      });
    },
    [storageKey],
  );

  const clearSubmitted = useCallback((submittedKey: string | null) => {
    if (!submittedKey) return;
    if (!persistDraft(submittedKey, "")) return;
    valuesByKeyRef.current.set(submittedKey, "");
    persistedByKeyRef.current.set(submittedKey, "");
  }, []);

  return {
    clearSubmitted,
    markSubmitted,
    restoreSubmitted,
    setValue,
    status: activeStatus,
    value: activeValue,
  };
}
