import { describe, expect, it } from "vitest";

import {
  classifyUnitAgentFailure,
  nameUnitAgentSchemaError,
  UnitAgentSchemaError,
} from "./agent-errors";

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

  it("keeps message and cause when attaching the schema name", () => {
    const cause = new Error("assistantMessage: answer must stay private");
    const original = new UnitAgentSchemaError({
      message: "Review presentation failed validation.",
      cause,
    });

    const named = nameUnitAgentSchemaError(
      original,
      "unit_review_presentation",
    );

    expect(named.message).toBe("Review presentation failed validation.");
    expect(named.cause).toBe(cause);
    expect(named.schemaName).toBe("unit_review_presentation");
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
