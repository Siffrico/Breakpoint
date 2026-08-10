import { describe, expect, it, vi } from "vitest";

import {
  clampKnowledgeIds,
  skillKnowledgeRepository,
} from "./skill-knowledge-repository";

describe("clampKnowledgeIds", () => {
  it("accepts only assigned targets and reports duplicates once", () => {
    expect(
      clampKnowledgeIds({
        requestedKnowledgeIds: ["target-a", "outside", "target-a", "target-b"],
        targetedKnowledgeIds: ["target-a", "target-b", "untouched"],
      }),
    ).toEqual({
      accepted: ["target-a", "target-b"],
      deferred: ["outside"],
    });
  });
});

describe("incrementSkillPractice", () => {
  const makeDb = (targetedSkills: { id: string }[]) => {
    const limit = vi.fn(() => Promise.resolve(targetedSkills));
    const selectWhere = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: selectWhere }));
    const selectDistinct = vi.fn(() => ({ from }));
    const updateWhere = vi.fn(() => Promise.resolve());
    const set = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set }));
    return {
      db: { selectDistinct, update } as unknown as Parameters<
        typeof skillKnowledgeRepository.incrementSkillPractice
      >[0]["db"],
      update,
    };
  };

  it("increments the one skill shared by all unit targets", async () => {
    const { db, update } = makeDb([{ id: "skill-1" }]);

    await skillKnowledgeRepository.incrementSkillPractice({
      db,
      knowledgeIds: ["item-1", "item-2"],
    });

    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects mixed-skill targets before changing either skill", async () => {
    const { db, update } = makeDb([{ id: "skill-1" }, { id: "skill-2" }]);

    await expect(
      skillKnowledgeRepository.incrementSkillPractice({
        db,
        knowledgeIds: ["item-1", "item-2"],
      }),
    ).rejects.toThrow("exactly one skill");
    expect(update).not.toHaveBeenCalled();
  });
});
