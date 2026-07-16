import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type { MasteryProgressionState } from "../engine/plan-progression";
import type { CreateNextUnitError } from "./create-next-unit";
import { decideMasteryProgression } from "../engine/plan-progression";

export const ADVANCE_COMPLETED_UNIT_LOCK_KEY = "advance-completed-unit";

interface LockedPregenerationDependencies {
  isAwaitingUnitAdvance: (input: {
    clusterNodeId: string;
    sessionId: string;
  }) => Effect.Effect<boolean, DbError>;
  getProgressionState: (input: {
    clusterNodeId: string;
    userId: string;
  }) => Effect.Effect<MasteryProgressionState | null, DbError>;
  createUnit: (input: {
    clusterNodeId: string;
    sessionId: string;
    userId: string;
    status: "planned";
  }) => Effect.Effect<unknown, CreateNextUnitError>;
}

export interface PregenerateNextUnitDependencies {
  withLock: <A>(input: {
    sessionId: string;
    key: typeof ADVANCE_COMPLETED_UNIT_LOCK_KEY;
    run: (
      locked: LockedPregenerationDependencies,
    ) => Effect.Effect<A, DbError | CreateNextUnitError>;
  }) => Effect.Effect<A, DbError | CreateNextUnitError>;
}

/**
 * Takes a mastered unit's parent, produces a prepared planned sibling, and
 * fails only when locked progression reads or existing unit creation fails.
 */
export const pregenerateNextUnit = ({
  sessionId,
  userId,
  clusterNodeId,
  deps,
}: {
  sessionId: string;
  userId: string;
  clusterNodeId: string;
  deps: PregenerateNextUnitDependencies;
}): Effect.Effect<void, DbError | CreateNextUnitError> =>
  deps.withLock({
    sessionId,
    key: ADVANCE_COMPLETED_UNIT_LOCK_KEY,
    run: (locked) =>
      Effect.gen(function* () {
        const state = yield* locked.getProgressionState({
          clusterNodeId,
          userId,
        });
        if (
          !state ||
          decideMasteryProgression(state).intent !== "create_unit"
        ) {
          return;
        }
        const isAwaitingAdvance = yield* locked.isAwaitingUnitAdvance({
          clusterNodeId,
          sessionId,
        });
        if (!isAwaitingAdvance) return;

        yield* locked.createUnit({
          clusterNodeId,
          sessionId,
          userId,
          status: "planned",
        });
      }),
  });
