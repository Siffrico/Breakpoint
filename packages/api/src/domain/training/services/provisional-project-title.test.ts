import { describe, expect, it } from "vitest";

import { deriveProvisionalProjectTitle } from "./provisional-project-title";

describe("deriveProvisionalProjectTitle", () => {
  it("uses a short first learner message as the provisional title", () => {
    expect(
      deriveProvisionalProjectTitle(
        "  Become a distributed systems engineer  ",
      ),
    ).toBe("Become a distributed systems engineer");
  });

  it("normalizes whitespace and truncates long messages on a word boundary", () => {
    expect(
      deriveProvisionalProjectTitle(
        "I want to learn how to design reliable distributed systems that handle failures without losing customer data",
      ),
    ).toBe("I want to learn how to design reliable distributed systems that…");
  });

  it("returns null for an empty learner message", () => {
    expect(deriveProvisionalProjectTitle("   ")).toBeNull();
  });
});
