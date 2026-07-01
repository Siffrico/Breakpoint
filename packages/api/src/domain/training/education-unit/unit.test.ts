import { describe, expect, it } from "vitest";

import type { RatingScope } from "../orchestration/rating-scope";
import { getUnitRecipe } from "./unit";

const scope: RatingScope = {
  nodeId: "cluster-1",
  bands: null,
};

describe("getUnitRecipe", () => {
  it("returns the frozen v1 recipe with the caller's scope wired in", () => {
    const recipe = getUnitRecipe("education-unit-v1", scope);
    expect(recipe).toMatchObject({
      version: "education-unit-v1",
      passes: 2,
      teachBeats: { orient: true, concept: true },
      goldilocks: { scope, writeOnPass: 2 },
    });
  });

  it("throws on an unknown recipe version", () => {
    expect(() => getUnitRecipe("education-unit-v2", scope)).toThrow(
      /Unknown education-unit recipe version/,
    );
  });
});
