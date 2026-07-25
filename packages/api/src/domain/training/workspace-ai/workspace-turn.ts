import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { PersistedUnitRun } from "../education-unit/unit";
import type { RecallCandidate, RecallTarget } from "../policies/recall-decay";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type { WorkspaceProjectionReaderSource } from "./workspace-reader";
import { initialState, recallInitialState } from "../education-unit/fsm";
import {
  CURRENT_RECIPE_VERSION,
  isRecallRecipe,
  RECALL_RECIPE_VERSION,
} from "../education-unit/unit";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { isUnitMidFlight, planWorkspaceTurn } from "./orchestrator";
import {
  CurriculumNotReadyError,
  NoRunnableWorkspaceTurnError,
} from "./workspace-errors";
import {
  makeWorkspaceProjectionReader,
  WorkspaceProjectionReader,
} from "./workspace-reader";

export type WorkspaceTurnDependencies = WorkspaceProjectionReaderSource;

export interface ResolvedWorkspaceTurn {
  plan: CurriculumPlan;
  state: WorkspaceAiState;
  node: CurriculumNode;
  unit: UnitContent;
  unitRun: PersistedUnitRun;
  unitResponses: PhaseResponseRecord[];
  /** Set when this turn is a recall interlude: the skills to compose. */
  recallFocus: RecallTarget | null;
}

interface PlannedRecall {
  target: RecallTarget;
  node: CurriculumNode;
  /** Present only when resuming the durable recall cursor. */
  run: PersistedUnitRun | null;
}

export const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find((node) => node.kind === "unit" && node.status === "ready") ?? null;

const isLearningUnit = <T extends Pick<CurriculumNode, "kind">>(
  node: T | null,
): node is T => node?.kind === "unit";

export type UnitAdvanceGate =
  | { status: "locked" }
  | { status: "enabled"; unitId: string; nextTitle: string | null };

export const isUnitAwaitingAdvance = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) =>
  isLearningUnit(node) && node.status === "ready" && run?.phase === "mastered";

export const assertUnitCanAdvance = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) => {
  if (!node || !isLearningUnit(node)) {
    throw new Error("Unit not found.");
  }
  if (node.status === "completed") {
    return;
  }
  if (node.status !== "ready") {
    throw new Error("Unit is not active.");
  }
  if (run?.phase !== "mastered") {
    throw new Error("Unit is not complete yet.");
  }
};

export const getUnitAdvanceGate = ({
  node,
  run,
  nextNode,
}: {
  node: CurriculumNode | null;
  run: PersistedUnitRun | null;
  nextNode: CurriculumNode | null;
}): UnitAdvanceGate => {
  if (!node || !isUnitAwaitingAdvance({ node, run })) {
    return { status: "locked" };
  }

  return {
    status: "enabled",
    unitId: node.id,
    nextTitle: nextNode?.title ?? null,
  };
};

export const findWorkspaceTurnNode = ({
  nodes,
  state,
}: {
  nodes: CurriculumNode[];
  state: { activeUnitId: string | null; recallUnitId: string | null };
}) =>
  nodes.find(
    (node) => node.id === (state.activeUnitId ?? state.recallUnitId),
  ) ?? null;

/**
 * Produces a recall run projection without materializing it. An in-flight
 * recall run (prompted but not yet graded) resumes; anything else — the
 * mastered education run, a finished earlier recall — projects a fresh
 * cursor at the scored Solve moment. The first claimed commit materializes
 * it, resetting the row onto the recall recipe.
 */
export const resolveRecallRunProjection = ({
  sessionId,
  userId,
  unit,
  existing,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  existing: PersistedUnitRun | null;
}): PersistedUnitRun => {
  if (
    existing &&
    isRecallRecipe(existing.recipeVersion) &&
    existing.phase !== "mastered"
  ) {
    return existing;
  }

  return {
    ...recallInitialState(unit.id, RECALL_RECIPE_VERSION),
    sessionId,
    userId: userId ?? null,
    difficultySnapshot: null,
    scenarioSpec: null,
  };
};

/** Rehydrates the persisted one-or-two entry recall target. */
const rehydrateRecallTarget = ({
  knowledgeIds,
  candidates,
}: {
  knowledgeIds: readonly string[];
  candidates: readonly RecallCandidate[];
}): RecallTarget | null => {
  const [primaryId, companionId, ...unexpectedIds] = knowledgeIds;
  if (!primaryId || unexpectedIds.length > 0) return null;

  const primary = candidates.find((entry) => entry.id === primaryId);
  const companion = companionId
    ? (candidates.find((entry) => entry.id === companionId) ?? null)
    : null;
  if (!primary?.evidenceNodeId || (companionId && !companion)) return null;
  if (companion && companion.skillNodeId !== primary.skillNodeId) return null;

  return {
    skillNodeId: primary.skillNodeId,
    evidenceNodeId: primary.evidenceNodeId,
    primary,
    companion,
  };
};

const resolvePersistedRecall = ({
  plan,
  run,
  responses,
  candidates,
}: {
  plan: CurriculumPlan;
  run: PersistedUnitRun;
  responses: readonly PhaseResponseRecord[];
  candidates: readonly RecallCandidate[];
}): PlannedRecall | null => {
  const knowledgeIds = [...responses]
    .reverse()
    .find((response) => response.metadata?.recallEntryIds)
    ?.metadata?.recallEntryIds;
  const target = knowledgeIds
    ? rehydrateRecallTarget({ knowledgeIds, candidates })
    : null;
  if (!target) return null;

  const node = plan.nodes.find((item) => item.id === target.evidenceNodeId);
  return node?.status === "completed" ? { target, node, run } : null;
};

export const loadPlannedRecall = ({
  sessionId,
  plan,
  active,
  inFlightRun,
  repairStaleRun,
}: {
  sessionId: string;
  plan: CurriculumPlan;
  active: NextReadyUnitProjection;
  inFlightRun: PersistedUnitRun | null;
  repairStaleRun: boolean;
}): EffectType.Effect<
  PlannedRecall | null,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;

    if (inFlightRun) {
      const responses = yield* reader.getPhaseResponses(
        inFlightRun.unitId,
        sessionId,
      );
      const knowledgeIds = [...responses]
        .reverse()
        .find((response) => response.metadata?.recallEntryIds)
        ?.metadata?.recallEntryIds;
      const candidates = knowledgeIds
        ? yield* reader.getRecallCandidatesByIds(plan.id, knowledgeIds)
        : [];
      const resumed = resolvePersistedRecall({
        plan,
        run: inFlightRun,
        responses,
        candidates,
      });
      if (resumed) return resumed;
      if (repairStaleRun) {
        yield* Effect.logWarning("Retiring a stale in-flight recall run.", {
          sessionId,
          unitContentId: inFlightRun.unitId,
        });
        // Best-effort self-healing: a failed retirement must not block the turn
        // — the stale run simply gets retried on the next resolution.
        yield* reader
          .retireInFlightRecallRun(sessionId, inFlightRun.unitId)
          .pipe(
            Effect.catch((cause) =>
              Effect.logError("Stale recall retirement failed.", {
                cause,
                sessionId,
                unitContentId: inFlightRun.unitId,
              }),
            ),
          );
      }
    }

    if (
      isUnitMidFlight({
        activeUnitResponses: active.responses,
        activeUnitRun: active.run,
      })
    ) {
      return null;
    }

    const now = new Date();
    const primary = yield* reader.getMostOverdueRecallCandidate(plan.id, now);
    if (!primary?.evidenceNodeId) return null;
    const node = plan.nodes.find((item) => item.id === primary.evidenceNodeId);
    if (node?.status !== "completed") return null;
    const companion = yield* reader.getRecallCompanionCandidate(
      primary.skillNodeId,
      primary,
      now,
    );
    return {
      target: {
        skillNodeId: primary.skillNodeId,
        evidenceNodeId: primary.evidenceNodeId,
        primary,
        companion,
      },
      node,
      run: null,
    };
  });

/**
 * Produces a run projection without materializing it. The first claimed-turn
 * commit owns creation of a missing durable run row.
 */
export const resolveUnitRunProjection = ({
  sessionId,
  userId,
  unit,
  existing,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  existing: PersistedUnitRun | null;
}): PersistedUnitRun => {
  if (existing) {
    return existing;
  }

  // A brand-new run always begins at the FSM's opening phase on the current
  // recipe. `initialState` owns the phase/pass/counter defaults.
  return {
    ...initialState(unit.id, CURRENT_RECIPE_VERSION),
    sessionId,
    userId: userId ?? null,
    difficultySnapshot: null,
    scenarioSpec: null,
  };
};

export interface NextReadyUnitProjection {
  node: CurriculumNode | null;
  unit: UnitContent | null;
  responses: PhaseResponseRecord[];
  run: PersistedUnitRun | null;
}

/**
 * Takes the plan's nodes and a session id; produces the next-ready learning
 * node's unit, phase responses, and in-memory run projection. A missing unit
 * is not a failure here because each caller owns that decision.
 */
export const loadNextReadyUnitProjection = ({
  sessionId,
  nodes,
}: {
  sessionId: string;
  nodes: CurriculumNode[];
}): EffectType.Effect<
  NextReadyUnitProjection,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const node = getNextReadyLearningNode(nodes);
    const unit = node ? yield* reader.getUnitByNodeId(node.id) : null;
    if (!unit) {
      return { node, unit: null, responses: [], run: null };
    }
    const [responses, existingRun] = yield* Effect.all(
      [
        reader.getPhaseResponses(unit.id, sessionId),
        reader.getUnitRun(sessionId, unit.id),
      ],
      { concurrency: 2 },
    );
    return {
      node,
      unit,
      responses,
      run: resolveUnitRunProjection({ sessionId, unit, existing: existingRun }),
    };
  });

/**
 * Takes a workspace session id and curriculum accessors, produces the runnable
 * turn with its unit and response history, and fails only when the curriculum
 * is missing, no turn is runnable, or the active unit is not ready.
 */
export const resolveWorkspaceTurnEffect = ({
  sessionId,
  authorizedPlan,
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
}): EffectType.Effect<
  ResolvedWorkspaceTurn,
  | DbError
  | CurriculumNotReadyError
  | NoRunnableWorkspaceTurnError
  | UnitNotReadyError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const plan = authorizedPlan ?? (yield* reader.getActivePlan(sessionId));

    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const [active, inFlightRun] = yield* Effect.all(
      [
        loadNextReadyUnitProjection({ sessionId, nodes: plan.nodes }),
        reader.getInFlightRecallRun(sessionId),
      ],
      { concurrency: 2 },
    );
    if (active.node && !active.unit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: active.node.id,
      });
    }

    const plannedRecall = yield* loadPlannedRecall({
      sessionId,
      plan,
      active,
      inFlightRun,
      repairStaleRun: true,
    });

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      recallTarget: plannedRecall
        ? {
            unitNodeId: plannedRecall.node.id,
            unitTitle: plannedRecall.node.title,
          }
        : null,
    });

    if (!state) {
      return yield* new NoRunnableWorkspaceTurnError({
        message: "There is no runnable workspace turn.",
      });
    }

    const node = findWorkspaceTurnNode({ nodes: plan.nodes, state });
    const unit = node ? yield* reader.getUnitByNodeId(node.id) : null;

    if (!unit || !node) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: node?.id,
      });
    }

    const isRecallTurn = state.recallUnitId !== null;
    const reusesActiveUnit = unit.id === active.unit?.id;
    const needsRunRead =
      !isRecallTurn && !(reusesActiveUnit && active.run !== null);
    const [unitResponses, existingRun] = yield* Effect.all(
      [
        reusesActiveUnit
          ? Effect.succeed(active.responses)
          : reader.getPhaseResponses(unit.id, sessionId),
        needsRunRead
          ? reader.getUnitRun(sessionId, unit.id)
          : Effect.succeed<PersistedUnitRun | null>(null),
      ],
      { concurrency: 2 },
    );
    const unitRun = isRecallTurn
      ? resolveRecallRunProjection({
          sessionId,
          unit,
          existing: plannedRecall?.run ?? null,
        })
      : reusesActiveUnit && active.run
        ? active.run
        : resolveUnitRunProjection({
            sessionId,
            unit,
            existing: existingRun,
          });

    const resolvedState = {
      ...state,
      educationStage: unitRun.phase,
      workflowId: unitRun.recipeVersion,
    };

    return {
      plan,
      state: resolvedState,
      node,
      unit,
      unitRun,
      unitResponses,
      recallFocus: isRecallTurn ? (plannedRecall?.target ?? null) : null,
    };
  });

export const resolveWorkspaceTurn = async ({
  sessionId,
  authorizedPlan,
  deps,
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
  deps: WorkspaceProjectionReaderSource;
}): Promise<ResolvedWorkspaceTurn> => {
  const exit = await Effect.runPromiseExit(
    resolveWorkspaceTurnEffect({ sessionId, authorizedPlan }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        makeWorkspaceProjectionReader(deps),
      ),
    ),
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

/**
 * Takes a session id and current plan, produces the next runnable workspace
 * state, and returns null only when the curriculum has no next runnable turn.
 */
export const planNextWorkspaceTurn = async ({
  sessionId,
  plan,
  deps,
}: {
  sessionId: string;
  plan: CurriculumPlan;
  deps: Omit<WorkspaceTurnDependencies, "getActivePlan">;
}): Promise<WorkspaceAiState | null> => {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const reader = yield* WorkspaceProjectionReader;
      const [active, inFlightRun] = yield* Effect.all(
        [
          loadNextReadyUnitProjection({ sessionId, nodes: plan.nodes }),
          reader.getInFlightRecallRun(sessionId),
        ],
        { concurrency: 2 },
      );
      const plannedRecall = yield* loadPlannedRecall({
        sessionId,
        plan,
        active,
        inFlightRun,
        repairStaleRun: true,
      });
      return planWorkspaceTurn({
        nodes: plan.nodes,
        activeUnitResponses: active.responses,
        activeUnitRun: active.run,
        recallTarget: plannedRecall
          ? {
              unitNodeId: plannedRecall.node.id,
              unitTitle: plannedRecall.node.title,
            }
          : null,
      });
    }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        makeWorkspaceProjectionReader({
          ...deps,
          getActivePlan: () => Promise.resolve(plan),
        }),
      ),
    ),
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
