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
