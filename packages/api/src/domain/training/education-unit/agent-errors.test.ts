import { describe, expect, it } from "vitest";

import { classifyUnitAgentFailure } from "./agent-errors";

describe("classifyUnitAgentFailure", () => {
  it("preserves nested validation detail for a schema repair", () => {
    const cause = new Error("completedCapabilityId: expected string");
    cause.name = "AI_TypeValidationError";
    const error = new Error("No object generated", { cause });

    const classified = classifyUnitAgentFailure(error);

    expect(classified._tag).toBe("UnitAgentSchemaError");
    expect(classified.message).toContain(
      "completedCapabilityId: expected string",
    );
  });

  it("keeps the validation issue when a generated value makes the error long", () => {
    const cause = new Error(
      `${"generated output ".repeat(300)}targetedExercise: expected object`,
    );
    cause.name = "AI_TypeValidationError";

    const classified = classifyUnitAgentFailure(
      new Error("No object generated", { cause }),
    );

    expect(classified.message.length).toBeLessThanOrEqual(2_003);
    expect(classified.message).toContain("targetedExercise: expected object");
  });
});
