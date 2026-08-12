import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";

const runUnitAgentMock = vi.fn((input: unknown) => {
  void input;
  return Effect.succeed({
    object: {
      assistantMessage: "A concise worked example and transferable pattern.",
      completedCapabilityId: "capability-1",
    },
  });
});

vi.mock("./run-unit-agent", () => ({
  runUnitAgent: (input: unknown) => runUnitAgentMock(input),
}));

const { runMentorAgent } = await import("./mentor-agent");

describe("runMentorAgent", () => {
  it("asks for semantic structure without generic report headings", async () => {
    await Effect.runPromise(
      runMentorAgent({
        messages: [
          { role: "user", content: "I chose A because it is measured." },
        ],
        context: "Authoritative unit teaching context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        currentCapabilityId: "capability-1",
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).toContain("**Heuristic**");
    expect(call?.system).toContain("**Worked example**");
    expect(call?.system).toContain("**Read**");
    expect(call?.system).toContain("**Predict**");
    expect(call?.system).toContain("**Compare**");
    expect(call?.system).toContain("**Decide**");
    expect(call?.system).toContain(
      "Keep each prose paragraph to one or two sentences.",
    );
    expect(call?.system).toContain(
      'do not add a generic "Feedback" or "Response" heading',
    );
    expect(call?.system).not.toContain("Never write a section heading");
  });
});
