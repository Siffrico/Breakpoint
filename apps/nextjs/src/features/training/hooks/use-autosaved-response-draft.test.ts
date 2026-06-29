import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createResponseDraftStore,
  shouldClearSubmittedDraft,
} from "./use-autosaved-response-draft";

const storage = new Map<string, string>();

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shouldClearSubmittedDraft", () => {
  it("only clears after a successful request", () => {
    expect(
      shouldClearSubmittedDraft({
        isAbort: false,
        isDisconnect: false,
        isError: false,
      }),
    ).toBe(true);

    for (const finishState of [
      { isAbort: true, isDisconnect: false, isError: false },
      { isAbort: false, isDisconnect: true, isError: false },
      { isAbort: false, isDisconnect: false, isError: true },
    ]) {
      expect(shouldClearSubmittedDraft(finishState)).toBe(false);
    }
  });
});

describe("createResponseDraftStore", () => {
  it("hydrates per key synchronously and cannot overwrite fresh typing later", () => {
    storage.set("draft-key", "stored draft");

    const store = createResponseDraftStore("draft-key");
    expect(store.getSnapshot().value).toBe("stored draft");

    store.setValue("fresh typing");
    vi.runAllTimers();

    expect(store.getSnapshot()).toEqual({
      status: "saved",
      value: "fresh typing",
    });
    expect(storage.get("draft-key")).toBe("fresh typing");
  });

  it("retains the submitted recovery copy until success is confirmed", () => {
    const store = createResponseDraftStore("draft-key");
    store.setValue("answer in flight");
    const submittedKey = store.markSubmitted();

    store.dispose();
    expect(storage.get("draft-key")).toBe("answer in flight");

    store.clearSubmitted(submittedKey);
    expect(storage.has("draft-key")).toBe(false);
  });
});
