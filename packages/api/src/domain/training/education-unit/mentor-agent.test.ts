import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";

const runUnitAgentMock = vi.fn((input: unknown) => {
  void input;
  return Effect.succeed({ object: { assistantMessage: "Mentor output." } });
});

vi.mock("./run-unit-agent", () => ({
  runUnitAgent: (input: unknown) => runUnitAgentMock(input),
}));

const { runMentorScenarioAgent, runMentorTeachingAgent } = await import(
  "./mentor-agent"
);

describe("mentor prompt modules", () => {
  it("gives Pass 1 the Teach and Scenario modules", async () => {
    await Effect.runPromise(
      runMentorTeachingAgent({
        messages: [],
        context: "Authoritative unit context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        createScenario: false,
        selectedResponse: false,
      }),
    );

    const call = runUnitAgentMock.mock.calls[0]?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).toContain("## Teach");
    expect(call?.system).toContain("## Scenario");
  });

  it("gives later scenario turns only the Scenario module", async () => {
    await Effect.runPromise(
      runMentorScenarioAgent({
        context: "Authoritative scenario context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        pass: 2,
        selectedResponse: false,
      }),
    );

    const call = runUnitAgentMock.mock.calls[1]?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).not.toContain("## Teach");
    expect(call?.system).toContain("## Scenario");
  });
});
