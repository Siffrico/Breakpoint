import { describe, expect, it } from "vitest";

import type { FrontierItem } from "./target-selection";
import { selectNextPracticeSkill } from "./target-selection";

const entry = ({
  id,
  skillId,
  skillOrder,
  practiceCount,
  itemOrder = 0,
  status = "unchecked",
}: {
  id: string;
  skillId: string;
  skillOrder: number;
  practiceCount: number;
  itemOrder?: number;
  status?: string;
}): FrontierItem => ({
  id,
  questionId: skillId,
  question: `Skill ${skillId}`,
  questionOrderIndex: skillOrder,
  kind: "concept",
  label: id,
  content: id,
  status,
  orderIndex: itemOrder,
  practiceCount,
});

describe("selectNextPracticeSkill", () => {
  it("selects knowledge only from the least-practised skill", () => {
    const selection = selectNextPracticeSkill(
      [
        entry({ id: "ui-1", skillId: "ui", skillOrder: 0, practiceCount: 2 }),
        entry({ id: "db-1", skillId: "db", skillOrder: 1, practiceCount: 0 }),
        entry({
          id: "db-2",
          skillId: "db",
          skillOrder: 1,
          practiceCount: 0,
          itemOrder: 1,
        }),
      ],
      2,
    );

    expect(selection?.skillId).toBe("db");
    expect(selection?.targets.map((item) => item.id)).toEqual(["db-1", "db-2"]);
    expect(new Set(selection?.targets.map((item) => item.questionId))).toEqual(
      new Set(["db"]),
    );
  });

  it("breaks equal practice counts by skill-map order", () => {
    const selection = selectNextPracticeSkill(
      [
        entry({
          id: "later",
          skillId: "later",
          skillOrder: 1,
          practiceCount: 0,
        }),
        entry({
          id: "first",
          skillId: "first",
          skillOrder: 0,
          practiceCount: 0,
        }),
      ],
      1,
    );

    expect(selection?.skillId).toBe("first");
  });

  it("moves to the next skill after the first skill is practised", () => {
    const firstRound = [
      entry({ id: "a", skillId: "a", skillOrder: 0, practiceCount: 0 }),
      entry({ id: "b", skillId: "b", skillOrder: 1, practiceCount: 0 }),
    ];
    expect(selectNextPracticeSkill(firstRound, 1)?.skillId).toBe("a");

    const afterCompletingA = [
      entry({ id: "a", skillId: "a", skillOrder: 0, practiceCount: 1 }),
      entry({ id: "b", skillId: "b", skillOrder: 1, practiceCount: 0 }),
    ];
    expect(selectNextPracticeSkill(afterCompletingA, 1)?.skillId).toBe("b");
  });

  it("uses unchecked knowledge before repeating checked knowledge", () => {
    const selection = selectNextPracticeSkill(
      [
        entry({
          id: "checked",
          skillId: "skill",
          skillOrder: 0,
          practiceCount: 1,
          status: "checked",
        }),
        entry({
          id: "unchecked",
          skillId: "skill",
          skillOrder: 0,
          practiceCount: 1,
          itemOrder: 1,
        }),
      ],
      2,
    );

    expect(selection?.targets.map((item) => item.id)).toEqual(["unchecked"]);
  });

  it("returns null when the skill map has no knowledge", () => {
    expect(selectNextPracticeSkill([], 2)).toBeNull();
  });
});
