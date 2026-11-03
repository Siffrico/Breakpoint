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

const { runMentorLessonAgent, runMentorPartsAgent } = await import(
  "./mentor-agent"
);

const lastCall = () =>
  runUnitAgentMock.mock.calls.at(-1)?.[0] as
    | { system: string; context: string; temperature: number }
    | undefined;

describe("mentor prompt modules", () => {
  it("gives the lesson only the Teach module, ending in an explain-back", async () => {
    await Effect.runPromise(
      runMentorLessonAgent({
        context: "Authoritative unit context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
    );
    expect(lastCall()?.system).toContain("## Teach");
    expect(lastCall()?.system).toContain("easy version");
    expect(lastCall()?.system).toContain("explain-back");
    expect(lastCall()?.system).not.toContain("## Rounds");
  });

  it("gives part writing only the Rounds module", async () => {
    await Effect.runPromise(
      runMentorPartsAgent({
        context: "Authoritative round context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        shape: {
          selectedResponse: false,
          roundCriterionIds: ["criterion-1"],
          partCount: 3,
          mustCoverCriterionIds: ["criterion-1"],
          opensRound: true,
          acknowledgesExplanation: false,
        },
        label: "exam",
        letters: ["a", "b", "c"],
        hypothesis: null,
      }),
    );
    const call = lastCall();
    expect(call?.system).not.toContain("## Teach");
    expect(call?.system).toContain("## Rounds");
    expect(call?.system).toContain("idiomatic English");
    expect(call?.context).toContain("Write parts (a), (b), (c).");
    expect(call?.context).toContain("This is an exam");
    expect(call?.temperature).toBe(0.2);
  });

  it("aims a practice part at the last feedback's hypothesis", async () => {
    await Effect.runPromise(
      runMentorPartsAgent({
        context: "Authoritative round context.",
        experience: DEFAULT_EDUCATION_EXPERIENCE,
        shape: {
          selectedResponse: false,
          roundCriterionIds: ["criterion-1"],
          partCount: 1,
          mustCoverCriterionIds: [],
          opensRound: false,
          acknowledgesExplanation: false,
        },
        label: "learn",
        letters: ["b"],
        hypothesis: "Treats the old success as a rule.",
      }),
    );
    expect(lastCall()?.context).toContain("Treats the old success as a rule.");
    expect(lastCall()?.context).toContain("Continue the round in progress");
  });
});
