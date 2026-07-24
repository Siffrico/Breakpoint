import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  buildDynamicUnitDifficultyBands,
  createNextUnit,
  KnowledgeTargetsMissingError,
} from "./create-next-unit";
import { createRegimeTargetSelector } from "./target-selection";

/** The production wiring, with the one database read stubbed out. */
const selectTargets = createRegimeTargetSelector({
  skillPracticeHistory: () => Effect.succeed([]),
});

let nextOrderIndex = 0;
const entry = (id: string, status = "unchecked") => ({
  id,
  questionId: "question-1",
  question: "How do you handle this situation?",
  questionOrderIndex: 0,
  label: id,
  content: `Content ${id}`,
  kind: "concept" as const,
  status,
  orderIndex: nextOrderIndex++,
});

describe("buildDynamicUnitDifficultyBands", () => {
  it("centers the unit ladder on the Goldilocks directive", () => {
    expect(
      buildDynamicUnitDifficultyBands({ targetItemRating: 1200 })[1],
    ).toEqual({
      order: 1,
      minRating: 1140,
      maxRating: 1260,
      label: "Target",
    });
  });
});

const openUnit = { id: "unit-1" };

const openSkill = {
  title: "Distributed systems",
  whyItMatters: "Reliability requires sound failure handling.",
  regime: "foundation" as const,
  entries: [],
  openUnit,
};

describe("createNextUnit", () => {
  it("resumes preparation when an open unit has no content", async () => {
    const prepareUnitEffect = vi.fn(() => Effect.void);
    const appendUnit = vi.fn();

    const result = await Effect.runPromise(
      createNextUnit({
        skillNodeId: "cluster-1",
        deps: {
          loadSkill: () => Effect.succeed(openSkill),
          resolveDirective: () => Effect.die("should not resolve"),
          appendUnit,
          hasUnitContent: () => Effect.succeed(false),
          prepareUnitEffect,
          selectTargets,
        },
      }),
    );

    expect(result).toBe(openUnit);
    expect(prepareUnitEffect).toHaveBeenCalledOnce();
    expect(prepareUnitEffect).toHaveBeenCalledWith(openUnit);
    expect(appendUnit).not.toHaveBeenCalled();
  });

  it("returns an already-prepared open unit without regenerating it", async () => {
    const prepareUnitEffect = vi.fn(() => Effect.void);

    const result = await Effect.runPromise(
      createNextUnit({
        skillNodeId: "cluster-1",
        deps: {
          loadSkill: () => Effect.succeed(openSkill),
          resolveDirective: () => Effect.die("should not resolve"),
          appendUnit: () => Effect.die("should not append"),
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect,
          selectTargets,
        },
      }),
    );

    expect(result).toBe(openUnit);
    expect(prepareUnitEffect).not.toHaveBeenCalled();
  });

  it("fails loudly when a skill has no knowledge targets", async () => {
    await expect(
      Effect.runPromise(
        createNextUnit({
          skillNodeId: "cluster-1",
          deps: {
            loadSkill: () => Effect.succeed({ ...openSkill, openUnit: null }),
            resolveDirective: () => Effect.die("should not resolve"),
            appendUnit: () => Effect.die("should not append"),
            hasUnitContent: () => Effect.die("should not read content"),
            prepareUnitEffect: () => Effect.die("should not prepare"),
            selectTargets,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(KnowledgeTargetsMissingError);
  });

  it("writes the selected targets onto the appended unit", async () => {
    const appendUnit = vi.fn(
      (_input: { targetKnowledgeIds: string[]; title: string }) =>
        Effect.succeed({ node: { id: "unit" }, created: false }),
    );

    await Effect.runPromise(
      createNextUnit({
        skillNodeId: "skill",
        complexityBudget: 2,
        deps: {
          loadSkill: () =>
            Effect.succeed({
              ...openSkill,
              openUnit: null,
              entries: [entry("a"), entry("b"), entry("c")],
            }),
          resolveDirective: () =>
            Effect.succeed({
              directive: { targetItemRating: 1200 } as never,
              promptBlock: "",
            }),
          appendUnit,
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect: () => Effect.void,
          selectTargets,
        },
      }),
    );

    expect(appendUnit.mock.calls[0]?.[0]?.targetKnowledgeIds).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(appendUnit.mock.calls[0]?.[0]?.title).toBe(
      "How do you handle this situation?",
    );
  });

  it("delegates target selection instead of deciding it inline", async () => {
    const appendUnit = vi.fn((_input: { targetKnowledgeIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );
    const custom = vi.fn(() => Effect.succeed([entry("chosen")]));

    await Effect.runPromise(
      createNextUnit({
        skillNodeId: "ability",
        complexityBudget: 2,
        deps: {
          loadSkill: () =>
            Effect.succeed({
              ...openSkill,
              regime: "skillset" as const,
              openUnit: null,
              entries: [entry("a"), entry("b")],
            }),
          resolveDirective: () =>
            Effect.succeed({
              directive: { targetItemRating: 1200 } as never,
              promptBlock: "",
            }),
          appendUnit,
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect: () => Effect.void,
          selectTargets: custom,
        },
      }),
    );

    expect(custom).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNodeId: "ability",
        regime: "skillset",
        complexityBudget: 2,
      }),
    );
    expect(appendUnit.mock.calls[0]?.[0]?.targetKnowledgeIds).toEqual([
      "chosen",
    ]);
  });
});
