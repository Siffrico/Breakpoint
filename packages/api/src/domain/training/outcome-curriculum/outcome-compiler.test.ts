import { describe, expect, it } from "vitest";

import { OUTCOME_COMPILER_SYSTEM } from "./outcome-compiler";

describe("OUTCOME_COMPILER_SYSTEM", () => {
  it("requires evidence-backed tacit knowledge instead of generic summaries", () => {
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "ELITE, TASK-RELEVANT TACIT KNOWLEDGE",
    );
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "Do not generate beginner-level, generic, or textbook summaries.",
    );
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "Treat anecdotes and forum discussions as leads, not authority",
    );
  });

  it("requires conditional heuristics and cheat-resistant evaluation", () => {
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "trigger conditions and limits are clear",
    );
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "answer-pattern gaming, generic test-taking tricks, surface matching",
    );
    expect(OUTCOME_COMPILER_SYSTEM).toContain(
      "fluent but causally empty explanation",
    );
  });
});
