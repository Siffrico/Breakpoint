import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PregenerateNextUnitDependencies } from "./pregenerate-next-unit";
import {
  ADVANCE_COMPLETED_UNIT_LOCK_KEY,
  pregenerateNextUnit,
} from "./pregenerate-next-unit";

const foundationNeedsUnit = {
  regime: "foundation" as const,
  entries: [{ coverageCount: 1 }],
  coverageTarget: 3,
};

interface TestNode {
  id: string;
}

const makeDeps = ({
  events,
  needsContent,
  progressionState = foundationNeedsUnit,
  isAwaitingAdvance = true,
}: {
  events: string[];
  needsContent: () => boolean;
  progressionState?: typeof foundationNeedsUnit | null;
  isAwaitingAdvance?: boolean;
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
    ensureSkillKnowledge: () =>
      Effect.sync(() => {
        events.push("ensureSkillKnowledge");
      }),
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
      "ensureSkillKnowledge",
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
        regime: "foundation" as const,
        entries: [{ coverageCount: 3 }],
        coverageTarget: 3,
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
