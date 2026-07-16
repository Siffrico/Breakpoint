import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  CACHE_CONTROL_PROVIDER_OPTIONS,
  withCacheBreakpoints,
} from "./prompt-cache";

describe("withCacheBreakpoints", () => {
  it("marks the first and second-to-last messages", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "stable system" },
      { role: "user", content: "older turn" },
      { role: "assistant", content: "last stable transcript message" },
      { role: "user", content: "volatile directive" },
    ];

    const result = withCacheBreakpoints(messages);

    expect(result[0]?.providerOptions).toEqual(CACHE_CONTROL_PROVIDER_OPTIONS);
    expect(result[1]?.providerOptions).toBeUndefined();
    expect(result[2]?.providerOptions).toEqual(CACHE_CONTROL_PROVIDER_OPTIONS);
    expect(result[3]?.providerOptions).toBeUndefined();
  });

  it("does not mutate the input array or its messages", () => {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: "stable system",
        providerOptions: { openrouter: { reasoning: { enabled: true } } },
      },
      { role: "user", content: "volatile directive" },
    ];
    const snapshot = structuredClone(messages);

    const result = withCacheBreakpoints(messages);

    expect(messages).toEqual(snapshot);
    expect(result).not.toBe(messages);
    expect(result[0]).not.toBe(messages[0]);
    expect(result[0]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
      openrouter: {
        reasoning: { enabled: true },
        cacheControl: { type: "ephemeral" },
      },
    });
  });

  it.each([
    { messages: [] satisfies ModelMessage[] },
    {
      messages: [
        { role: "system" as const, content: "only message" },
      ] satisfies ModelMessage[],
    },
  ])("handles arrays with fewer than two messages", ({ messages }) => {
    const result = withCacheBreakpoints(messages);

    expect(result).toHaveLength(messages.length);
    if (result[0]) {
      expect(result[0].providerOptions).toEqual(CACHE_CONTROL_PROVIDER_OPTIONS);
    }
  });
});
