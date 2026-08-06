import { Effect } from "effect";

import type { DbError } from "../../../effect/errors";
import type { MasteryProgressionState } from "../engine/plan-progression";
import type { CreateNextUnitError } from "./create-next-unit";
import {
  decideMasteryProgression,
  shouldWarmNextOutcome,
} from "../engine/plan-progression";

export const ADVANCE_COMPLETED_UNIT_LOCK_KEY = "advance-completed-unit";

interface LockedPregenerationDependencies<TNode> {
  isAwaitingUnitAdvance: (input: {
    skillNodeId: string;
    sessionId: string;
  }) => Effect.Effect<boolean, DbError>;
  getProgressionState: (input: {
    skillNodeId: string;
    userId: string;
  }) => Effect.Effect<MasteryProgressionState | null, DbError>;
  /** Node row only — content generation happens outside the lock. */
  createUnitNode: (input: {
    skillNodeId: string;
    sessionId: string;
    userId: string;
    status: "planned";
  }) => Effect.Effect<
    { node: TNode; needsContent: boolean },
    CreateNextUnitError
  >;
}

export interface PregenerateNextUnitDependencies<TNode> {
  /** Runs before the advance transaction; may perform a singleflight model call. */
  ensureSkillKnowledge: (
    skillNodeId: string,
  ) => Effect.Effect<unknown, DbError>;
  /**
   * Topic mode: the next planned outcome after this one, or null when there is
   * none or the plan is not topic-shaped.
   */
  findNextPlannedCluster: (
    skillNodeId: string,
  ) => Effect.Effect<string | null, DbError>;
  withLock: <A>(input: {
    sessionId: string;
    key: typeof ADVANCE_COMPLETED_UNIT_LOCK_KEY;
    run: (
      locked: LockedPregenerationDependencies<TNode>,
    ) => Effect.Effect<A, DbError | CreateNextUnitError>;
  }) => Effect.Effect<A, DbError | CreateNextUnitError>;
  /**
   * The LLM generation. MUST run after withLock has committed and released:
   * holding the advance advisory lock (or an open transaction) across a
   * 45s-budget model call would block the user's Next Unit press — and pin a
   * pooled connection — for the whole generation.
   */
  prepareUnit: (node: TNode) => Effect.Effect<unknown, CreateNextUnitError>;
}

/**
 * Takes a mastered unit's parent, produces a prepared planned sibling, and
 * fails only when locked progression reads or unit creation/preparation fails.
 * The planned node commits under the advance lock; content generation runs
 * unlocked afterwards. A crash between the two leaves a contentless planned
 * node, which the advance workflow promotes and its background fallback
 * adopts and prepares — never duplicated, never stranded.
 */
export const pregenerateNextUnit = <TNode>({
  sessionId,
  userId,
  skillNodeId,
  deps,
}: {
  sessionId: string;
  userId: string;
  skillNodeId: string;
  deps: PregenerateNextUnitDependencies<TNode>;
}): Effect.Effect<void, DbError | CreateNextUnitError> =>
  Effect.gen(function* () {
    yield* deps.ensureSkillKnowledge(skillNodeId);
    const outcome = yield* deps.withLock({
      sessionId,
      key: ADVANCE_COMPLETED_UNIT_LOCK_KEY,
      run: (locked) =>
        Effect.gen(function* () {
          const state = yield* locked.getProgressionState({
            skillNodeId,
            userId,
          });
          if (!state) return { state: null, created: null };
          if (decideMasteryProgression(state).intent !== "create_unit") {
            return { state, created: null };
          }
          const isAwaitingAdvance = yield* locked.isAwaitingUnitAdvance({
            skillNodeId,
            sessionId,
          });
          if (!isAwaitingAdvance) return { state, created: null };

          return {
            state,
            created: yield* locked.createUnitNode({
              skillNodeId,
              sessionId,
              userId,
              status: "planned",
            }),
          };
        }),
    });

    // Both remaining steps are model calls, so both run after the advance lock
    // has committed and released. The learner's next unit comes first: it is
    // what they are about to open, while the warm is for an outcome they have
    // not reached. A failed warm must never cost them that unit, so it is
    // fire-and-forget — the lazy path rebuilds it on demand if it never lands.
    if (outcome.created?.needsContent) {
      yield* deps.prepareUnit(outcome.created.node);
    }
    if (outcome.state && shouldWarmNextOutcome(outcome.state)) {
      const nextClusterId = yield* deps.findNextPlannedCluster(skillNodeId);
      if (nextClusterId) {
        yield* deps.ensureSkillKnowledge(nextClusterId).pipe(
          Effect.tapCause((cause) =>
            Effect.logWarning("next outcome warm failed", {
              skillNodeId,
              nextClusterId,
              cause,
            }),
          ),
          Effect.ignore,
        );
      }
    }
  });
