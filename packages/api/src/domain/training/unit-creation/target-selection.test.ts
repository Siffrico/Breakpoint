import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { FrontierItem } from "./target-selection";
import {
  createRegimeTargetSelector,
  selectInterleavedTargets,
  selectSequentialTargets,
  SKILLSET_INTERLEAVE_WINDOW,
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

  it("takes the weakest skill's entries when no unit has run yet", () => {
    expect(ids(selectInterleavedTargets(frontier, 2, []))).toEqual([
      "weak-1",
      "weak-2",
    ]);
  });

  it("skips skills the recent units already drew from", () => {
    expect(ids(selectInterleavedTargets(frontier, 2, ["skill-a"]))).toEqual([
      "mid-1",
    ]);
  });

  it("never mixes skills inside one unit", () => {
    const targets = selectInterleavedTargets(frontier, 3, []);
    expect(new Set(targets.map((item) => item.ownerSkillId)).size).toBe(1);
  });

  it("drops the rotation filter rather than returning nothing", () => {
    expect(
      ids(
        selectInterleavedTargets(frontier, 1, [
          "skill-a",
          "skill-b",
          "skill-c",
        ]),
      ),
    ).toEqual(["weak-1"]);
  });

  it("treats an entry with no owning skill as its own group", () => {
    expect(
      ids(selectInterleavedTargets([entry("a"), entry("b")], 3, [])),
    ).toEqual(["a"]);
  });

  it("rotates skills across successive units", () => {
    const seen: string[] = [];
    let recent: string[] = [];
    for (let unit = 0; unit < 4; unit++) {
      const owner = selectInterleavedTargets(frontier, 2, recent)[0]
        ?.ownerSkillId;
      seen.push(owner ?? "none");
      recent = [owner ?? "", ...recent].slice(0, SKILLSET_INTERLEAVE_WINDOW);
    }
    expect(seen).toEqual(["skill-a", "skill-b", "skill-c", "skill-a"]);
  });
});

describe("createRegimeTargetSelector", () => {
  it("reads no unit history for a foundation frontier", async () => {
    const recentTargetSkillIds = vi.fn(() => Effect.succeed([]));
    const select = createRegimeTargetSelector({ recentTargetSkillIds });

    const targets = await Effect.runPromise(
      select({
        skillNodeId: "skill-1",
        regime: "foundation",
        entries: [entry("a"), entry("b"), entry("c")],
        complexityBudget: 2,
      }),
    );

    expect(ids(targets)).toEqual(["a", "b", "c"]);
    expect(recentTargetSkillIds).not.toHaveBeenCalled();
  });

  it("passes the interleave window through for a skillset frontier", async () => {
    const recentTargetSkillIds = vi.fn(() =>
      Effect.succeed(["skill-a"] as readonly string[]),
    );
    const select = createRegimeTargetSelector({ recentTargetSkillIds });

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
    expect(recentTargetSkillIds).toHaveBeenCalledWith({
      skillNodeId: "ability-1",
      limit: SKILLSET_INTERLEAVE_WINDOW,
    });
  });
});
