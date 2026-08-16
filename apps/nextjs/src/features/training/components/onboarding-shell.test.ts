import { describe, expect, it } from "vitest";

import { transcriptToMessages } from "./onboarding-transcript";

describe("transcriptToMessages", () => {
  it("rehydrates an unanswered starting-point card without duplicating its prompt", () => {
    const messages = transcriptToMessages({
      sessionId: "session-1",
      phase: "questioning",
      transcript: [
        {
          role: "assistant",
          content: "Where are you starting?",
          sequence: 3,
          slot: null,
        },
      ],
      activeQuestion: null,
      pendingStartingPointQuestion: {
        sequence: 3,
        input: {
          question: "Where are you starting?",
          options: [
            { label: "New to this", tier: "fundamentals" },
            { label: "Know the basics", tier: "skip_basics" },
            { label: "Ready for hard cases", tier: "advanced" },
          ],
        },
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.parts).toEqual([
      {
        type: "tool-askStartingPoint",
        toolCallId: "rehydrated-starting-point-session-1",
        state: "input-available",
        input: {
          question: "Where are you starting?",
          options: [
            { label: "New to this", tier: "fundamentals" },
            { label: "Know the basics", tier: "skip_basics" },
            { label: "Ready for hard cases", tier: "advanced" },
          ],
        },
      },
    ]);
  });
});
