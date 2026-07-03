import { describe, expect, it } from "vitest";

import {
  buildMintedDifficultyBands,
  sliceSyllabusFrontier,
} from "./mint-next-unit";

const entry = (id: string, status = "unchecked") => ({
  id,
  label: id,
  gloss: `Gloss ${id}`,
  kind: "discrimination" as const,
  status,
});

describe("sliceSyllabusFrontier", () => {
  it("takes the next unchecked entries in order within the complexity budget", () => {
    expect(
      sliceSyllabusFrontier(
        [entry("checked", "checked"), entry("a"), entry("b"), entry("c")],
        2,
      ).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });
});

describe("buildMintedDifficultyBands", () => {
  it("centers the unit ladder on the Goldilocks directive", () => {
    expect(buildMintedDifficultyBands({ targetItemRating: 1200 })[1]).toEqual({
      order: 1,
      minRating: 1140,
      maxRating: 1260,
      label: "Target",
    });
  });
});
