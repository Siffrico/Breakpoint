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

describe("pregenerateNextUnit", () => {
  it("uses the advance lock and delegates idempotent planned creation", async () => {
    const lockInputs: { sessionId: string; key: string }[] = [];
    let exists = false;
    let creationCount = 0;
    const persistCreation = vi.fn(() =>
      Effect.sync(() => {
        if (!exists) {
          exists = true;
          creationCount += 1;
        }
      }),
    );
    const deps: PregenerateNextUnitDependencies = {
      withLock: ({ sessionId, key, run }) => {
        lockInputs.push({ sessionId, key });
        return run({
          isAwaitingUnitAdvance: () => Effect.succeed(true),
          getProgressionState: () => Effect.succeed(foundationNeedsUnit),
          createUnit: persistCreation,
        });
      },
    };

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        clusterNodeId: "cluster-1",
        deps,
      }),
    );
    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        clusterNodeId: "cluster-1",
        deps,
      }),
    );

    expect(lockInputs).toEqual([
      { sessionId: "session-1", key: ADVANCE_COMPLETED_UNIT_LOCK_KEY },
      { sessionId: "session-1", key: ADVANCE_COMPLETED_UNIT_LOCK_KEY },
    ]);
    expect(persistCreation).toHaveBeenCalledTimes(2);
    expect(persistCreation).toHaveBeenLastCalledWith({
      clusterNodeId: "cluster-1",
      sessionId: "session-1",
      userId: "user-1",
      status: "planned",
    });
    expect(exists).toBe(true);
    expect(creationCount).toBe(1);
  });

  it("does nothing when mastery completes the parent node", async () => {
    const createUnit = vi.fn(() => Effect.void);

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        clusterNodeId: "cluster-1",
        deps: {
          withLock: ({ run }) =>
            run({
              isAwaitingUnitAdvance: () => Effect.succeed(true),
              getProgressionState: () =>
                Effect.succeed({
                  regime: "foundation" as const,
                  entries: [{ coverageCount: 3 }],
                  coverageTarget: 3,
                }),
              createUnit,
            }),
        },
      }),
    );

    expect(createUnit).not.toHaveBeenCalled();
  });

  it("does nothing when the real advance wins the lock", async () => {
    const createUnit = vi.fn(() => Effect.void);

    await Effect.runPromise(
      pregenerateNextUnit({
        sessionId: "session-1",
        userId: "user-1",
        clusterNodeId: "cluster-1",
        deps: {
          withLock: ({ run }) =>
            run({
              isAwaitingUnitAdvance: () => Effect.succeed(false),
              getProgressionState: () => Effect.succeed(foundationNeedsUnit),
              createUnit,
            }),
        },
      }),
    );

    expect(createUnit).not.toHaveBeenCalled();
  });
});
