import { expect, test } from "vitest";

import { BAND_DIAL_GUIDES } from "./difficulty-priors";

test("every band guide contains ordered non-negative ranges", () => {
  expect(Object.keys(BAND_DIAL_GUIDES)).toEqual(["0", "1", "2"]);
  for (const guide of Object.values(BAND_DIAL_GUIDES)) {
    for (const range of [
      guide.steps,
      guide.withheldGivens,
      guide.alternatives,
    ]) {
      expect(range[0]).toBeGreaterThanOrEqual(0);
      expect(range[1]).toBeGreaterThanOrEqual(range[0]);
    }
  }
});
