import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { FrontierItem } from "./target-selection";
import {
  createRegimeTargetSelector,
  selectLeastCoveredTargets,
} from "./target-selection";

const entry = (
  id: string,
  coverageCount: number,
  status = "unchecked",
): FrontierItem => ({
  id,
  questionId: `question-${id}`,
  question: `Question ${id}`,
  questionOrderIndex: Number(id.replace(/\D/g, "")) || 0,
  kind: "concept",
  label: id,
  content: id,
  status,
  orderIndex: Number(id.replace(/\D/g, "")) || 0,
  coverageCount,
});

describe("outcome target selection", () => {
  it("takes the least-covered Skill Map entries first", () => {
    expect(
      selectLeastCoveredTargets(
        [entry("1", 2), entry("2", 0), entry("3", 1)],
        2,
      ).map((item) => item.id),
    ).toEqual(["2", "3"]);
  });

  it("keeps drawing from the full Skill Map after initial coverage", () => {
    expect(
      selectLeastCoveredTargets(
        [entry("1", 2, "checked"), entry("2", 1, "checked")],
        1,
      ).map((item) => item.id),
    ).toEqual(["2"]);
  });

  it("uses the same selector through the unit-creation port", async () => {
    const selected = await Effect.runPromise(
      createRegimeTargetSelector()({
        skillNodeId: "outcome-1",
        regime: "main_outcome",
        entries: [entry("1", 1), entry("2", 0)],
        complexityBudget: 1,
      }),
    );
    expect(selected.map((item) => item.id)).toEqual(["2"]);
  });
});
