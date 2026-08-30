import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  buildDynamicUnitDifficultyBands,
  createNextUnit,
  KnowledgeTargetsMissingError,
} from "./create-next-unit";

let nextOrderIndex = 0;
const entry = (
  id: string,
  status = "unchecked",
  skill: { id: string; name: string; order: number; practiceCount: number } = {
    id: "question-1",
    name: "Handle the situation",
    order: 0,
    practiceCount: 0,
  },
) => ({
  id,
  questionId: skill.id,
  question: skill.name,
  questionOrderIndex: skill.order,
  practiceCount: skill.practiceCount,
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
  entries: [],
  openUnit,
};

describe("createNextUnit", () => {
  it("excludes the completed ready unit when creating its successor", async () => {
    const successor = { id: "unit-2" };
    const loadOpenUnit = vi.fn(() => Effect.succeed(null));
    const loadSkill = vi.fn(() =>
      Effect.succeed({
        ...openSkill,
        openUnit: null,
        entries: [entry("a")],
      }),
    );

    const result = await Effect.runPromise(
      createNextUnit({
        skillNodeId: "cluster-1",
        excludeUnitNodeId: openUnit.id,
        deps: {
          ensureSkillKnowledge: () => Effect.void,
          loadOpenUnit,
          loadSkill,
          resolveDirective: () =>
            Effect.succeed({
              directive: { targetItemRating: 1200 } as never,
              promptBlock: "",
            }),
          appendUnit: () =>
            Effect.succeed({ node: successor, created: true }),
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect: () => Effect.void,
        },
      }),
    );

    expect(result).toBe(successor);
    expect(loadOpenUnit).toHaveBeenCalledWith(
      "cluster-1",
      "ready",
      openUnit.id,
    );
    expect(loadSkill).toHaveBeenCalledWith(
      "cluster-1",
      "ready",
      openUnit.id,
    );
  });

  it("resumes missing content without generating knowledge for an open unit", async () => {
    const ensureSkillKnowledge = vi.fn(() => Effect.void);
    const prepareUnitEffect = vi.fn(() => Effect.void);
    const appendUnit = vi.fn();

    const result = await Effect.runPromise(
      createNextUnit({
        skillNodeId: "cluster-1",
        deps: {
          ensureSkillKnowledge,
          loadOpenUnit: () => Effect.succeed(openUnit),
          loadSkill: () => Effect.die("should not load the frontier"),
          resolveDirective: () => Effect.die("should not resolve"),
          appendUnit,
          hasUnitContent: () => Effect.succeed(false),
          prepareUnitEffect,
        },
      }),
    );

    expect(result).toBe(openUnit);
    expect(ensureSkillKnowledge).not.toHaveBeenCalled();
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
          ensureSkillKnowledge: () => Effect.void,
          loadOpenUnit: () => Effect.succeed(openUnit),
          loadSkill: () => Effect.die("should not load the frontier"),
          resolveDirective: () => Effect.die("should not resolve"),
          appendUnit: () => Effect.die("should not append"),
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect,
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
            ensureSkillKnowledge: () => Effect.void,
            loadOpenUnit: () => Effect.succeed(null),
            loadSkill: () => Effect.succeed({ ...openSkill, openUnit: null }),
            resolveDirective: () => Effect.die("should not resolve"),
            appendUnit: () => Effect.die("should not append"),
            hasUnitContent: () => Effect.die("should not read content"),
            prepareUnitEffect: () => Effect.die("should not prepare"),
          },
        }),
      ),
    ).rejects.toBeInstanceOf(KnowledgeTargetsMissingError);
  });

  it("prepares a contentless unit adopted from a concurrent append", async () => {
    const adopted = { id: "unit-adopted" };
    const prepareUnitEffect = vi.fn(() => Effect.void);

    const result = await Effect.runPromise(
      createNextUnit({
        skillNodeId: "skill",
        deps: {
          ensureSkillKnowledge: () => Effect.void,
          loadOpenUnit: () => Effect.succeed(null),
          loadSkill: () =>
            Effect.succeed({
              ...openSkill,
              openUnit: null,
              entries: [entry("a")],
            }),
          resolveDirective: () =>
            Effect.succeed({
              directive: { targetItemRating: 1200 } as never,
              promptBlock: "",
            }),
          appendUnit: () => Effect.succeed({ node: adopted, created: false }),
          hasUnitContent: () => Effect.succeed(false),
          prepareUnitEffect,
        },
      }),
    );

    expect(result).toBe(adopted);
    expect(prepareUnitEffect).toHaveBeenCalledWith(adopted);
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
          ensureSkillKnowledge: () => Effect.void,
          loadOpenUnit: () => Effect.succeed(null),
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
        },
      }),
    );

    expect(appendUnit.mock.calls[0]?.[0]?.targetKnowledgeIds).toEqual([
      "a",
      "b",
    ]);
    expect(appendUnit.mock.calls[0]?.[0]?.title).toBe(
      "Practice Handle the situation",
    );
  });

  it("never combines knowledge from different skills", async () => {
    const appendUnit = vi.fn((_input: { targetKnowledgeIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );

    await Effect.runPromise(
      createNextUnit({
        skillNodeId: "outcome",
        complexityBudget: 2,
        deps: {
          ensureSkillKnowledge: () => Effect.void,
          loadOpenUnit: () => Effect.succeed(null),
          loadSkill: () =>
            Effect.succeed({
              ...openSkill,
              openUnit: null,
              entries: [
                entry("db-1", "unchecked", {
                  id: "db",
                  name: "Diagnose database queries",
                  order: 0,
                  practiceCount: 0,
                }),
                entry("db-2", "unchecked", {
                  id: "db",
                  name: "Diagnose database queries",
                  order: 0,
                  practiceCount: 0,
                }),
                entry("ui-1", "unchecked", {
                  id: "ui",
                  name: "Design interfaces",
                  order: 1,
                  practiceCount: 0,
                }),
              ],
            }),
          resolveDirective: () =>
            Effect.succeed({
              directive: { targetItemRating: 1200 } as never,
              promptBlock: "",
            }),
          appendUnit,
          hasUnitContent: () => Effect.succeed(true),
          prepareUnitEffect: () => Effect.void,
        },
      }),
    );

    expect(appendUnit.mock.calls[0]?.[0]?.targetKnowledgeIds).toEqual([
      "db-1",
      "db-2",
    ]);
  });
});
