import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { FrontierItem, SkillPractice } from "./target-selection";
import {
  countSkillsBelowRepTarget,
  createRegimeTargetSelector,
  selectInterleavedTargets,
  selectLeastCoveredTargets,
  selectSequentialTargets,
  SKILL_REP_TARGET,
  sliceFrontier,
} from "./target-selection";

let nextOrderIndex = 0;
const entry = (
  id: string,
  overrides: Partial<FrontierItem> = {},
): FrontierItem => ({
  id,
  questionId: "question-1",
  question: "How do you do the work?",
  questionOrderIndex: 0,
  kind: "concept",
  label: id,
  content: `Content ${id}`,
  status: "unchecked",
  orderIndex: nextOrderIndex++,
  ...overrides,
});

const ids = (entries: readonly FrontierItem[]) =>
  entries.map((item) => item.id);

describe("sliceFrontier", () => {
  it("takes the next unchecked entries in order within the complexity budget", () => {
    expect(
      ids(
        sliceFrontier(
          [
            entry("checked", { status: "checked" }),
            entry("a"),
            entry("b"),
            entry("c"),
          ],
          2,
        ),
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("selectSequentialTargets", () => {
  it("walks the dependency order, skipping already-checked entries", () => {
    expect(
      ids(
        selectSequentialTargets(
          [
            entry("done", { status: "checked" }),
            entry("a"),
            entry("b"),
            entry("c", {
              questionId: "question-2",
              question: "How do you handle the next situation?",
              questionOrderIndex: 1,
            }),
          ],
          2,
        ),
      ),
    ).toEqual(["a", "b"]);
  });

  it("keeps all items for the next authored question together", () => {
    expect(
      ids(selectSequentialTargets([entry("a"), entry("b"), entry("c")], 2)),
    ).toEqual(["a", "b", "c"]);
  });

  it("never crosses an authored question boundary", () => {
    expect(
      ids(
        selectSequentialTargets(
          [
            entry("a"),
            entry("b"),
            entry("c", {
              questionId: "question-2",
              question: "How do you handle the next situation?",
              questionOrderIndex: 1,
            }),
          ],
          3,
        ),
      ),
    ).toEqual(["a", "b"]);
  });

  it("splits an oversized question without advancing to the next question", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => entry(id));
    expect(ids(selectSequentialTargets(items, 3))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(
      ids(
        selectSequentialTargets(
          items.map((item, index) =>
            index < 4 ? { ...item, status: "checked" } : item,
          ),
          3,
        ),
      ),
    ).toEqual(["e"]);
  });

  it("re-runs the most recently checked entries when nothing is unchecked", () => {
    expect(
      ids(
        selectSequentialTargets(
          ["a", "b", "c"].map((id) => entry(id, { status: "checked" })),
          2,
        ),
      ),
    ).toEqual(["b", "c"]);
  });
});

describe("selectInterleavedTargets", () => {
  const frontier = [
    entry("weak-1", { ownerSkillId: "skill-a" }),
    entry("weak-2", { ownerSkillId: "skill-a" }),
    entry("mid-1", { ownerSkillId: "skill-b" }),
    entry("strong-1", { ownerSkillId: "skill-c" }),
  ];

  const practice = (
    reps: Record<string, number>,
    lastPracticedAt: Record<string, Date> = {},
  ): SkillPractice[] =>
    Object.entries(reps).map(([skillId, count]) => ({
      skillId,
      reps: count,
      lastPracticedAt: lastPracticedAt[skillId] ?? null,
    }));

  it("takes the weakest skill's entries when no unit has run yet", () => {
    expect(
      ids(
        selectInterleavedTargets(
          frontier,
          2,
          practice({ "skill-a": 0, "skill-b": 0, "skill-c": 0 }),
        ),
      ),
    ).toEqual(["weak-1", "weak-2"]);
  });

  it("goes to the least-practiced skill, not the weakest-covered one", () => {
    expect(
      ids(
        selectInterleavedTargets(
          frontier,
          2,
          practice({ "skill-a": 2, "skill-b": 1, "skill-c": 0 }),
        ),
      ),
    ).toEqual(["strong-1"]);
  });

  it("breaks a rep tie on staleness, oldest first", () => {
    expect(
      ids(
        selectInterleavedTargets(
          frontier,
          2,
          practice(
            { "skill-a": 1, "skill-b": 1, "skill-c": 1 },
            {
              "skill-a": new Date("2026-03-02"),
              "skill-b": new Date("2026-03-01"),
              "skill-c": new Date("2026-03-03"),
            },
          ),
        ),
      ),
    ).toEqual(["mid-1"]);
  });

  it("never mixes skills inside one unit", () => {
    const targets = selectInterleavedTargets(frontier, 3, practice({}));
    expect(new Set(targets.map((item) => item.ownerSkillId)).size).toBe(1);
  });

  it("treats an entry with no owning skill as its own group", () => {
    expect(
      ids(selectInterleavedTargets([entry("a"), entry("b")], 3, [])),
    ).toEqual(["a"]);
  });

  it("cannot starve a skill: every skill reaches rep N before any reaches N+1", () => {
    const skillIds = ["skill-a", "skill-b", "skill-c"];
    const reps = new Map(skillIds.map((skillId) => [skillId, 0]));

    // Ten units is more than three full rounds, so any rotation that drifts or
    // starves shows up as a spread greater than one.
    for (let unit = 0; unit < 10; unit++) {
      const picked = selectInterleavedTargets(
        frontier,
        2,
        skillIds.map((skillId) => ({
          skillId,
          reps: reps.get(skillId) ?? 0,
          lastPracticedAt: null,
        })),
      )[0]?.ownerSkillId;
      expect(picked).toBeDefined();
      reps.set(picked ?? "", (reps.get(picked ?? "") ?? 0) + 1);

      const counts = [...reps.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    expect([...reps.values()].reduce((sum, count) => sum + count, 0)).toBe(10);
  });
});

describe("countSkillsBelowRepTarget", () => {
  it("counts only the skills still short of the target", () => {
    const practice: SkillPractice[] = [
      { skillId: "a", reps: SKILL_REP_TARGET, lastPracticedAt: null },
      { skillId: "b", reps: SKILL_REP_TARGET - 1, lastPracticedAt: null },
      { skillId: "c", reps: 0, lastPracticedAt: null },
    ];
    expect(countSkillsBelowRepTarget(practice)).toBe(2);
  });

  it("is zero for an ability with no skills, so it never blocks alone", () => {
    expect(countSkillsBelowRepTarget([])).toBe(0);
  });
});

describe("createRegimeTargetSelector", () => {
  it("reads no practice history for a foundation frontier", async () => {
    const skillPracticeHistory = vi.fn(() => Effect.succeed([]));
    const select = createRegimeTargetSelector({ skillPracticeHistory });

    const targets = await Effect.runPromise(
      select({
        skillNodeId: "skill-1",
        regime: "foundation",
        entries: [entry("a"), entry("b"), entry("c")],
        complexityBudget: 2,
      }),
    );

    expect(ids(targets)).toEqual(["a", "b", "c"]);
    expect(skillPracticeHistory).not.toHaveBeenCalled();
  });

  it("reads the ability's practice history for a skillset frontier", async () => {
    const skillPracticeHistory = vi.fn(() =>
      Effect.succeed([
        { skillId: "skill-a", reps: 2, lastPracticedAt: null },
        { skillId: "skill-b", reps: 1, lastPracticedAt: null },
      ] as readonly SkillPractice[]),
    );
    const select = createRegimeTargetSelector({ skillPracticeHistory });

    const targets = await Effect.runPromise(
      select({
        skillNodeId: "ability-1",
        regime: "skillset",
        entries: [
          entry("weak", { ownerSkillId: "skill-a" }),
          entry("next", { ownerSkillId: "skill-b" }),
        ],
        complexityBudget: 2,
      }),
    );

    expect(ids(targets)).toEqual(["next"]);
    expect(skillPracticeHistory).toHaveBeenCalledWith({
      abilityNodeId: "ability-1",
    });
  });
});

describe("selectLeastCoveredTargets", () => {
  const axis = (
    id: string,
    coverageCount: number,
    overrides: Partial<FrontierItem> = {},
  ): FrontierItem => entry(id, { coverageCount, questionId: id, ...overrides });

  it("takes the least-covered syllabus entries first", () => {
    const targets = selectLeastCoveredTargets(
      [axis("well-covered", 4), axis("untouched", 0), axis("thin", 1)],
      2,
    );

    expect(ids(targets)).toEqual(["untouched", "thin"]);
  });

  it("never lets a repeatedly-skipped entry starve", () => {
    // The skipped entry keeps the lowest coverage, so it wins the next pick
    // no matter how many units went to its neighbours first.
    const skipped = axis("skipped", 0);
    const targets = selectLeastCoveredTargets(
      [axis("a", 3), axis("b", 3), skipped, axis("c", 3)],
      1,
    );

    expect(ids(targets)).toEqual(["skipped"]);
  });

  it("breaks ties on the designer's dependency order", () => {
    const targets = selectLeastCoveredTargets(
      [
        axis("third", 0, { questionOrderIndex: 2 }),
        axis("first", 0, { questionOrderIndex: 0 }),
        axis("second", 0, { questionOrderIndex: 1 }),
      ],
      2,
    );

    expect(ids(targets)).toEqual(["first", "second"]);
  });

  it("treats a missing coverage count as uncovered", () => {
    const targets = selectLeastCoveredTargets(
      [axis("counted", 2), entry("uncounted", { questionId: "uncounted" })],
      1,
    );

    expect(ids(targets)).toEqual(["uncounted"]);
  });

  it("keeps drawing from the whole syllabus once every axis is checked off", () => {
    // The breadth gate is satisfied here but the rating climb usually is not,
    // so units keep coming — and they must keep rotating rather than replaying
    // whichever axis happened to be checked off last.
    const targets = selectLeastCoveredTargets(
      [
        axis("heavily-drilled", 6, { status: "checked" }),
        axis("barely-seen", 1, { status: "checked" }),
        axis("moderate", 3, { status: "checked" }),
      ],
      2,
    );

    expect(ids(targets)).toEqual(["barely-seen", "moderate"]);
  });
});

describe("createRegimeTargetSelector main_outcome", () => {
  it("selects by coverage and never reads skill practice history", async () => {
    const skillPracticeHistory = vi.fn(() =>
      Effect.succeed([] as SkillPractice[]),
    );
    const select = createRegimeTargetSelector({ skillPracticeHistory });

    const targets = await Effect.runPromise(
      select({
        skillNodeId: "outcome-1",
        regime: "main_outcome",
        entries: [
          entry("covered", { coverageCount: 2, questionId: "covered" }),
          entry("fresh", { coverageCount: 0, questionId: "fresh" }),
        ],
        complexityBudget: 1,
      }),
    );

    expect(ids(targets)).toEqual(["fresh"]);
    expect(skillPracticeHistory).not.toHaveBeenCalled();
  });
});
