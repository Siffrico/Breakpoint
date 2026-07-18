import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  buildDynamicUnitDifficultyBands,
  createNextUnit,
  sliceSyllabusFrontier,
  SyllabusTargetsMissingError,
} from "./create-next-unit";

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

describe("topic-first target selection", () => {
  it("uses every unchecked concept from the earliest topic before later topics", async () => {
    const appendUnit = vi.fn((_input: { targetEntryIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );
    await Effect.runPromise(createNextUnit({
      clusterNodeId: "skill",
      complexityBudget: 2,
      deps: {
        loadSkill: () => Effect.succeed({ ...openSkill, openUnit: null, entries: [
          { ...entry("later"), topicId: "topic-2", topicOrderIndex: 2 },
          { ...entry("first-a"), topicId: "topic-1", topicOrderIndex: 1 },
          { ...entry("first-b"), topicId: "topic-1", topicOrderIndex: 1 },
        ] }),
        resolveDirective: () => Effect.succeed({ directive: { targetItemRating: 1200 } as never, promptBlock: "" }),
        appendUnit,
        hasUnitContent: () => Effect.succeed(true),
        prepareUnitEffect: () => Effect.void,
      },
    }));
    expect(appendUnit.mock.calls[0]?.[0]?.targetEntryIds).toEqual(["first-a", "first-b"]);
  });

  it("keeps topic-less entries in syllabus position instead of starving them", async () => {
    const appendUnit = vi.fn((_input: { targetEntryIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );
    await Effect.runPromise(createNextUnit({
      clusterNodeId: "skill",
      complexityBudget: 2,
      deps: {
        loadSkill: () => Effect.succeed({ ...openSkill, openUnit: null, entries: [
          { ...entry("orphan"), topicId: null, topicOrderIndex: null },
          { ...entry("topic-a"), topicId: "topic-1", topicOrderIndex: 1 },
          { ...entry("topic-b"), topicId: "topic-1", topicOrderIndex: 1 },
        ] }),
        resolveDirective: () => Effect.succeed({ directive: { targetItemRating: 1200 } as never, promptBlock: "" }),
        appendUnit,
        hasUnitContent: () => Effect.succeed(true),
        prepareUnitEffect: () => Effect.void,
      },
    }));
    expect(appendUnit.mock.calls[0]?.[0]?.targetEntryIds).toEqual(["orphan", "topic-a", "topic-b"]);
  });

  it("paginates a question larger than one sitting at the entry cap", async () => {
    const appendUnit = vi.fn((_input: { targetEntryIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );
    await Effect.runPromise(createNextUnit({
      clusterNodeId: "skill",
      complexityBudget: 2,
      deps: {
        loadSkill: () => Effect.succeed({ ...openSkill, openUnit: null, entries: ["a", "b", "c", "d", "e"].map((id) => (
          { ...entry(id), topicId: "topic-1", topicOrderIndex: 1 }
        )) }),
        resolveDirective: () => Effect.succeed({ directive: { targetItemRating: 1200 } as never, promptBlock: "" }),
        appendUnit,
        hasUnitContent: () => Effect.succeed(true),
        prepareUnitEffect: () => Effect.void,
      },
    }));
    expect(appendUnit.mock.calls[0]?.[0]?.targetEntryIds).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the fixed budget for skillset frontiers", async () => {
    const appendUnit = vi.fn((_input: { targetEntryIds: string[] }) =>
      Effect.succeed({ node: { id: "unit" }, created: false }),
    );
    await Effect.runPromise(createNextUnit({
      clusterNodeId: "ability",
      complexityBudget: 2,
      deps: {
        loadSkill: () => Effect.succeed({ ...openSkill, regime: "skillset" as const, openUnit: null, entries: ["a", "b", "c"].map((id) => (
          { ...entry(id), topicId: "topic-1", topicOrderIndex: 1 }
        )) }),
        resolveDirective: () => Effect.succeed({ directive: { targetItemRating: 1200 } as never, promptBlock: "" }),
        appendUnit,
        hasUnitContent: () => Effect.succeed(true),
        prepareUnitEffect: () => Effect.void,
      },
    }));
    expect(appendUnit.mock.calls[0]?.[0]?.targetEntryIds).toEqual(["a", "b"]);
  });
});

describe("buildDynamicUnitDifficultyBands", () => {
  it("centers the unit ladder on the Goldilocks directive", () => {
    expect(buildDynamicUnitDifficultyBands({ targetItemRating: 1200 })[1]).toEqual({
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
        clusterNodeId: "cluster-1",
        deps: {
          loadSkill: () => Effect.succeed(openSkill),
          resolveDirective: () => Effect.die("should not resolve"),
          appendUnit,
          hasUnitContent: () => Effect.succeed(false),
          prepareUnitEffect,
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
        clusterNodeId: "cluster-1",
        deps: {
          loadSkill: () => Effect.succeed(openSkill),
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

  it("fails loudly when a skill has no syllabus targets", async () => {
    await expect(
      Effect.runPromise(
        createNextUnit({
          clusterNodeId: "cluster-1",
          deps: {
            loadSkill: () =>
              Effect.succeed({ ...openSkill, openUnit: null }),
            resolveDirective: () => Effect.die("should not resolve"),
            appendUnit: () => Effect.die("should not append"),
            hasUnitContent: () => Effect.die("should not read content"),
            prepareUnitEffect: () => Effect.die("should not prepare"),
          },
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusTargetsMissingError);
  });
});
