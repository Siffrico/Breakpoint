import { describe, expect, it } from "vitest";

import type { RatingScope } from "../orchestration/rating-scope";
import { getUnitRecipe } from "./unit";

const scope: RatingScope = {
  nodeId: "cluster-1",
  bands: null,
};

describe("getUnitRecipe", () => {
  it("returns the frozen v2 recipe: 3 rounds, no force-advance, write on 3", () => {
    const recipe = getUnitRecipe("education-unit-v2", scope);
    expect(recipe).toMatchObject({
      version: "education-unit-v2",
      passes: 3,
      goldilocks: { scope, writeOnPass: 3, writesRating: true },
    });
  });

  it("wires writesRating false for foundation units", () => {
    const recipe = getUnitRecipe("education-unit-v2", scope, {
      writesRating: false,
    });
    expect(recipe.goldilocks.writesRating).toBe(false);
  });

  it("throws on an unknown recipe version", () => {
    expect(() => getUnitRecipe("education-unit-v99", scope)).toThrow(
      /Unknown education-unit recipe version/,
    );
  });
});
