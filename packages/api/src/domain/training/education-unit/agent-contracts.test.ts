import { describe, expect, it } from "vitest";

import { mentorOutputSchema } from "./agent-contracts";

describe("mentorOutputSchema", () => {
  it("rejects an incomplete turn that leaves the learner with no ask", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "That part is correct. I will note it and move us forward now.",
      completedCapabilityId: null,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a focused question while the capability remains incomplete", () => {
    const result = mentorOutputSchema("capability-1").safeParse({
      assistantMessage:
        "The state transition is still ambiguous. What durable fact makes the UI claim true?",
      completedCapabilityId: null,
    });

    expect(result.success).toBe(true);
  });
});
