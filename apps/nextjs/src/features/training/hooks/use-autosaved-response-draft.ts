"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

type DraftStatus = "idle" | "saving" | "saved";

interface DraftSnapshot {
  status: DraftStatus;
  value: string;
}

interface ChatFinishState {
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

const STORAGE_PREFIX = "bp:response-draft:v1";
const SAVE_DELAY_MS = 400;
const EMPTY_DRAFT_SNAPSHOT: DraftSnapshot = { status: "idle", value: "" };

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

export const shouldClearSubmittedDraft = ({
  isAbort,
  isDisconnect,
  isError,
}: ChatFinishState) => !isAbort && !isDisconnect && !isError;

export const resolveActiveResponseDraftKey = ({
  currentKey,
  submittedKey,
}: {
  currentKey: string | null;
  submittedKey: string | null;
}) => submittedKey ?? currentKey;

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

export const createResponseDraftStore = (storageKey: string | null) => {
  const listeners = new Set<() => void>();
  const hydratedValue =
    storageKey && typeof window !== "undefined" ? readDraft(storageKey) : "";
  let persistedValue = hydratedValue;
  let snapshot: DraftSnapshot = {
    status: hydratedValue ? "saved" : "idle",
    value: hydratedValue,
  };
  let hasPendingSubmission = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const updateSnapshot = (next: DraftSnapshot) => {
    snapshot = next;
    emit();
  };

  const cancelPendingSave = () => {
    if (saveTimer == null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
  };

  const flush = () => {
    if (hasPendingSubmission) return true;
    if (!storageKey || persistedValue === snapshot.value) return true;
    if (!persistDraft(storageKey, snapshot.value)) return false;
    persistedValue = snapshot.value;
    return true;
  };

  const scheduleSave = () => {
    cancelPendingSave();
    if (!storageKey || persistedValue === snapshot.value) return;

    saveTimer = setTimeout(() => {
      saveTimer = null;
      const valueBeingSaved = snapshot.value;
      const didSave = flush();
      if (snapshot.value !== valueBeingSaved) return;
      updateSnapshot({
        status: snapshot.value && didSave ? "saved" : "idle",
        value: snapshot.value,
      });
    }, SAVE_DELAY_MS);
  };

  return {
    clearSubmitted: (submittedKey: string | null) => {
      if (!submittedKey) return;
      if (!persistDraft(submittedKey, "")) return;
      if (submittedKey === storageKey) {
        hasPendingSubmission = false;
        persistedValue = "";
      }
    },
    dispose: () => {
      cancelPendingSave();
      flush();
      listeners.clear();
    },
    flush,
    getServerSnapshot: () => EMPTY_DRAFT_SNAPSHOT,
    getSnapshot: () => snapshot,
    markSubmitted: () => {
      cancelPendingSave();
      flush();
      hasPendingSubmission = true;
      updateSnapshot(EMPTY_DRAFT_SNAPSHOT);
      return storageKey;
    },
    restoreSubmitted: (submittedKey: string | null, value: string) => {
      if (!submittedKey) {
        updateSnapshot({ status: "idle", value });
        return;
      }

      const didSave = persistDraft(submittedKey, value);
      if (submittedKey !== storageKey) return;
      cancelPendingSave();
      hasPendingSubmission = false;
      if (didSave) persistedValue = value;
      updateSnapshot({ status: didSave ? "saved" : "idle", value });
    },
    setValue: (value: string) => {
      hasPendingSubmission = false;
      const isPersisted = Boolean(storageKey) && persistedValue === value;
      updateSnapshot({
        status: value ? (isPersisted ? "saved" : "saving") : "idle",
        value,
      });
      scheduleSave();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * Persists one response per stable prompt key. Each key owns one external
 * store, so its localStorage value is read before input can update the store.
 */
export function useAutosavedResponseDraft({
  enabled,
  storageKey,
}: {
  enabled: boolean;
  storageKey: string | null;
}) {
  const activeKey = enabled ? storageKey : null;
  const store = useMemo(() => createResponseDraftStore(activeKey), [activeKey]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useEffect(() => () => store.dispose(), [store]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") store.flush();
    };

    window.addEventListener("pagehide", store.flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", store.flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, store]);

  return {
    clearSubmitted: store.clearSubmitted,
    markSubmitted: store.markSubmitted,
    restoreSubmitted: store.restoreSubmitted,
    setValue: store.setValue,
    status: snapshot.status,
    value: snapshot.value,
  };
}
