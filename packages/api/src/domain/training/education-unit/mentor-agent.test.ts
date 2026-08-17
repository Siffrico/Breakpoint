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
  it("gives the opening turn only the Teach module", async () => {
    await Effect.runPromise(
      runMentorTeachingAgent({
        messages: [],
        context: "Authoritative unit context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        createScenario: false,
        selectedResponse: false,
      }),
    );

    const call = runUnitAgentMock.mock.calls.at(-1)?.[0] as
      | { system: string }
      | undefined;
    expect(call?.system).toContain("## Teach");
    expect(call?.system).not.toContain("## Scenario");
  });

  it("adds the Scenario module when handing off from teaching", async () => {
    await Effect.runPromise(
      runMentorTeachingAgent({
        messages: [{ role: "user", content: "The pivot controls the role." }],
        context: "Authoritative unit context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        createScenario: true,
        selectedResponse: false,
      }),
    );

    const call = runUnitAgentMock.mock.calls.at(-1)?.[0] as
      | { system: string; temperature: number }
      | undefined;
    expect(call?.system).toContain("## Teach");
    expect(call?.system).toContain("## Scenario handoff");
    expect(call?.system).toContain("inside preparedScenario");
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

    const call = runUnitAgentMock.mock.calls.at(-1)?.[0] as
      | { system: string; temperature: number }
      | undefined;
    expect(call?.system).not.toContain("## Teach");
    expect(call?.system).toContain("## Scenario");
    expect(call?.system).toContain("object is the scenario itself");
    expect(call?.system).not.toContain("inside preparedScenario");
    expect(call?.system).toContain("final copy edit");
    expect(call?.system).toContain("idiomatic English");
    expect(call?.system).toContain("never use all caps for emphasis");
    expect(call?.temperature).toBe(0.2);
  });
});
