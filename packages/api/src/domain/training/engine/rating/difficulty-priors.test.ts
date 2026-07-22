import { expect, test } from "vitest";

import { BAND_DIAL_PRESETS } from "./difficulty-priors";

test("every band preset contains ordered non-negative ranges", () => {
  expect(Object.keys(BAND_DIAL_PRESETS)).toEqual(["0", "1", "2"]);
  for (const preset of Object.values(BAND_DIAL_PRESETS)) {
    for (const range of [
      preset.steps,
      preset.withheldGivens,
      preset.alternatives,
    ]) {
      expect(range[0]).toBeGreaterThanOrEqual(0);
      expect(range[1]).toBeGreaterThanOrEqual(range[0]);
    }
  }
});
