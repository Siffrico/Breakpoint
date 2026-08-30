import { describe, expect, it } from "vitest";

import { CreateTopicProjectInputSchema } from "./topic-onboarding-chat-agent";

const input = {
  projectName: "sat math",
  targetIdentity: "SAT Math test-taker",
  summary: "Reach the learner's target SAT Math performance.",
  outcomes: [
    {
      title: "Algebra",
      result: "Solve SAT Algebra questions accurately across official forms.",
    },
  ],
  startingPoint: {
    tier: "skip_basics" as const,
    reason: "Already solves routine linear equations.",
  },
  understanding: {
    build: "Reach the target SAT Math score.",
    goodMeans: ["accurate", "efficient"],
    currentGap: "Unfamiliar forms cause avoidable errors.",
    evidence: {
      currentBaseline: ["Solves routine linear equations."],
      hardMoments: ["Misses familiar algebra in unfamiliar forms."],
      constraints: [],
    },
  },
};

describe("CreateTopicProjectInputSchema", () => {
  it("requires a title and observable result for every confirmed outcome", () => {
    expect(CreateTopicProjectInputSchema.safeParse(input).success).toBe(true);
    expect(
      CreateTopicProjectInputSchema.safeParse({
        ...input,
        outcomes: [{ title: "Algebra" }],
      }).success,
    ).toBe(false);
  });
});
