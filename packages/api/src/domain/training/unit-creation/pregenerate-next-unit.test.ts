import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { MasteryProgressionState } from "../engine/plan-progression";
import type { PregenerateNextUnitDependencies } from "./pregenerate-next-unit";
import {
  ADVANCE_COMPLETED_UNIT_LOCK_KEY,
  pregenerateNextUnit,
} from "./pregenerate-next-unit";

const outcomeNeedsUnit: MasteryProgressionState = {
  regime: "main_outcome",
  skillItemsBelowCoverage: 1,
  skillItemsTotal: 1,
  learnerRating: 1_000,
  ratingDeviation: 100,
  masteryRating: 1_800,
};

/** One Skill Map item short of the warm threshold's far side. */
const outcomeNearlyCovered: MasteryProgressionState = {
  regime: "main_outcome",
  skillItemsBelowCoverage: 1,
  skillItemsTotal: 10,
  learnerRating: 1200,
  ratingDeviation: 150,
  masteryRating: 1350,
};

interface TestNode {
  id: string;
}

const makeDeps = ({
  events,
  needsContent,
  progressionState = outcomeNeedsUnit,
  isAwaitingAdvance = true,
  nextClusterId = null,
}: {
  events: string[];
  needsContent: () => boolean;
  progressionState?: MasteryProgressionState | null;
  isAwaitingAdvance?: boolean;
  nextClusterId?: string | null;
}): {
  deps: PregenerateNextUnitDependencies<TestNode>;
  createUnitNode: ReturnType<typeof vi.fn>;
  prepareUnit: ReturnType<typeof vi.fn>;
  lockInputs: { sessionId: string; key: string }[];
} => {
  const lockInputs: { sessionId: string; key: string }[] = [];
  const createUnitNode = vi.fn(() =>
    Effect.sync(() => {
      events.push("createUnitNode");
      return { node: { id: "node-planned" }, needsContent: needsContent() };
    }),
  );
  const prepareUnit = vi.fn(() =>
    Effect.sync(() => {
      events.push("prepareUnit");
    }),
  );
  const deps: PregenerateNextUnitDependencies<TestNode> = {
    ensureSkillKnowledge: (skillNodeId) =>
      Effect.sync(() => {
        events.push(`ensureSkillKnowledge:${skillNodeId}`);
      }),
    findNextPlannedCluster: () => Effect.succeed(nextClusterId),
    withLock: ({ sessionId, key, run }) => {
      lockInputs.push({ sessionId, key });
      return Effect.gen(function* () {
        events.push("lock:acquired");
        const result = yield* run({
          isAwaitingUnitAdvance: () => Effect.succeed(isAwaitingAdvance),
          getProgressionState: () => Effect.succeed(progressionState),
          createUnitNode,
        });
        events.push("lock:released");
        return result;
      });
    },
    prepareUnit,
  };
  return { deps, createUnitNode, prepareUnit, lockInputs };
};

describe("pregenerateNextUnit", () => {
  it("creates the planned node under the lock and generates content after release", async () => {
    const events: string[] = [];
    let exists = false;
    const { deps, createUnitNode, prepareUnit, lockInputs } = makeDeps({
      events,
      // First run creates the node; the rerun finds it already prepared.
      needsContent: () => {
        const created = !exists;
        exists = true;
        return created;
      },
    });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "cluster-1",
        deps,
      }),
    );

    // The LLM call must never run while the advance lock is held.
    expect(events).toEqual([
      "ensureSkillKnowledge:cluster-1",
      "lock:acquired",
      "createUnitNode",
      "lock:released",
      "prepareUnit",
    ]);
    expect(lockInputs).toEqual([
      { sessionId: "session-1", key: ADVANCE_COMPLETED_UNIT_LOCK_KEY },
    ]);
    expect(createUnitNode).toHaveBeenCalledWith({
      skillNodeId: "cluster-1",
      sessionId: "session-1",
      userId: "user-1",
      status: "planned",
    });
    expect(prepareUnit).toHaveBeenCalledWith({ id: "node-planned" });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "cluster-1",
        deps,
      }),
    );
    // Idempotent rerun: node already has content, no second generation.
    expect(prepareUnit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when mastery completes the parent node", async () => {
    const events: string[] = [];
    const { deps, createUnitNode, prepareUnit } = makeDeps({
      events,
      needsContent: () => true,
      progressionState: {
        regime: "main_outcome" as const,
        skillItemsBelowCoverage: 0,
        skillItemsTotal: 1,
        learnerRating: 1_800,
        ratingDeviation: 50,
        masteryRating: 1_800,
      },
    });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "cluster-1",
        deps,
      }),
    );

    expect(createUnitNode).not.toHaveBeenCalled();
    expect(prepareUnit).not.toHaveBeenCalled();
  });

  it("warms the next outcome's curriculum once this one is nearly covered, after the lock", async () => {
    const events: string[] = [];
    const { deps } = makeDeps({
      events,
      needsContent: () => true,
      progressionState: outcomeNearlyCovered,
      nextClusterId: "outcome-2",
    });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "outcome-1",
        deps,
      }),
    );

    // The learner's own unit is generated before the speculative warm, and
    // neither model call happens while the advance lock is held.
    expect(events).toEqual([
      "ensureSkillKnowledge:outcome-1",
      "lock:acquired",
      "createUnitNode",
      "lock:released",
      "prepareUnit",
      "ensureSkillKnowledge:outcome-2",
    ]);
  });

  it("does not warm while the outcome is still mid-coverage", async () => {
    const events: string[] = [];
    const { deps } = makeDeps({
      events,
      needsContent: () => true,
      progressionState: {
        ...outcomeNearlyCovered,
        skillItemsBelowCoverage: 6,
      },
      nextClusterId: "outcome-2",
    });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "outcome-1",
        deps,
      }),
    );

    expect(events).not.toContain("ensureSkillKnowledge:outcome-2");
  });

  it("does nothing when the real advance wins the lock", async () => {
    const events: string[] = [];
    const { deps, createUnitNode, prepareUnit } = makeDeps({
      events,
      needsContent: () => true,
      isAwaitingAdvance: false,
    });

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        skillNodeId: "cluster-1",
        deps,
      }),
    );

    expect(createUnitNode).not.toHaveBeenCalled();
    expect(prepareUnit).not.toHaveBeenCalled();
  });
});
