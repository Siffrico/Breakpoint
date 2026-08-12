import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";

const runUnitAgentMock = vi.fn((input: unknown) => {
  void input;
  return Effect.succeed({
    object: {
      assistantMessage: "A concise worked example and transferable pattern.",
      teachbackPassed: true,
    },
  });
});

vi.mock("./run-unit-agent", () => ({
  runUnitAgent: (input: unknown) => runUnitAgentMock(input),
}));

const { runMentorAgent } = await import("./mentor-agent");

describe("runMentorAgent", () => {
  it("assesses the learner's own-words explanation without reteaching the card", async () => {
    await Effect.runPromise(
      runMentorAgent({
        messages: [
          { role: "user", content: "I chose A because it is measured." },
        ],
        context: "Authoritative unit teaching context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).toContain("explain the rule in their own words");
    expect(call?.system).toContain("repair only what is missing");
    expect(call?.system).not.toContain("**Worked example**");
  });
});
