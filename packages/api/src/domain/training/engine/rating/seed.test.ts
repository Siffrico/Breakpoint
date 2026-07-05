import { describe, expect, it } from "vitest";

import { DEFAULT_RATING_POLICY } from "./policy";
import { seedFromStartingPoint } from "./seed";

describe("seedFromStartingPoint", () => {
  it("maps each tier to its band midpoint", () => {
    expect(seedFromStartingPoint("fundamentals").rating).toBe(950);
    expect(seedFromStartingPoint("skip_basics").rating).toBe(1150);
    expect(seedFromStartingPoint("advanced").rating).toBe(1350);
  });

  it("always seeds a wide deviation and the policy volatility", () => {
    for (const tier of ["fundamentals", "skip_basics", "advanced"] as const) {
      const seed = seedFromStartingPoint(tier);
      expect(seed.ratingDeviation).toBe(250);
      expect(seed.volatility).toBe(DEFAULT_RATING_POLICY.initialVolatility);
    }
  });
});
