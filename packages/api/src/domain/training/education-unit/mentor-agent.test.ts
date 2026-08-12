import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";

const runUnitAgentMock = vi.fn((input: unknown) => {
  void input;
  return Effect.succeed({
    object: {
      assistantMessage: "A concise worked example and transferable pattern.",
      completedCapabilityId: "teach",
      scratchpad: "The learner named the mechanism and its controlling cause.",
    },
  });
});

vi.mock("./run-unit-agent", () => ({
  runUnitAgent: (input: unknown) => runUnitAgentMock(input),
}));

const { runMentorCheckAgent } = await import("./mentor-agent");

describe("runMentorCheckAgent", () => {
  it("assesses the learner's own-words explanation without reteaching the card", async () => {
    await Effect.runPromise(
      runMentorCheckAgent({
        messages: [
          { role: "user", content: "I chose A because it is measured." },
        ],
        context: "Authoritative unit teaching context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        currentCapabilityId: "teach",
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).toContain("The readability law");
    expect(call?.system).toContain("small comprehension question");
  });
});
