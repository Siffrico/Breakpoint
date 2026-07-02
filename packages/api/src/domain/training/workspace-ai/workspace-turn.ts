import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState, WorkspaceAiTurnMode } from "./types";
import type { WorkspaceProjectionReaderSource } from "./workspace-reader";
import { initialState } from "../education-unit/fsm";
import { CURRENT_RECIPE_VERSION } from "../education-unit/unit";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { planWorkspaceTurn } from "./orchestrator";
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
  allResponses: PhaseResponseRecord[];
  state: WorkspaceAiState;
  node: CurriculumNode;
  unit: UnitContent;
  unitRun: PersistedUnitRun;
  unitResponses: PhaseResponseRecord[];
}

export const getWorkspaceMessageSlot = (
  mode: WorkspaceAiTurnMode,
): WorkspaceAiTurnMode => (mode === "recall" ? "recall" : "education_unit");

export const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find(
    (node) =>
      (node.kind === "unit" || node.kind === "integration") &&
      node.status === "ready",
  ) ?? null;

const isLearningUnit = <T extends Pick<CurriculumNode, "kind">>(
  node: T | null,
): node is T => node?.kind === "unit" || node?.kind === "integration";

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
  };
};

/**
 * Takes a workspace session id and curriculum accessors, produces the runnable
 * turn with its unit and response history, and fails only when the curriculum
 * is missing, no turn is runnable, or the active unit is not ready.
 */
export const resolveWorkspaceTurnEffect = ({
  sessionId,
}: {
  sessionId: string;
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
    const [plan, allResponses] = yield* Effect.all(
      [
        reader.getActivePlan(sessionId),
        reader.listPhaseResponsesBySession(sessionId),
      ],
      { concurrency: 2 },
    );

    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const readyUnitNode = getNextReadyLearningNode(plan.nodes);
    const readyUnit = readyUnitNode
      ? yield* reader.getUnitByNodeId(readyUnitNode.id)
      : null;
    if (readyUnitNode && !readyUnit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: readyUnitNode.id,
      });
    }
    const [readyUnitResponses, existingReadyUnitRun] = readyUnit
      ? yield* Effect.all(
          [
            reader.getPhaseResponses(readyUnit.id, sessionId),
            reader.getUnitRun(sessionId, readyUnit.id),
          ],
          { concurrency: 2 },
        )
      : [[], null];
    const readyUnitRun = readyUnit
      ? resolveUnitRunProjection({
          sessionId,
          unit: readyUnit,
          existing: existingReadyUnitRun,
        })
      : null;

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      allResponses,
      activeUnitResponses: readyUnitResponses,
      activeUnitRun: readyUnitRun,
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

    const unitResponses =
      unit.id === readyUnit?.id
        ? readyUnitResponses
        : yield* reader.getPhaseResponses(unit.id, sessionId);
    const unitRun =
      unit.id === readyUnit?.id && readyUnitRun
        ? readyUnitRun
        : resolveUnitRunProjection({
            sessionId,
            unit,
            existing: yield* reader.getUnitRun(sessionId, unit.id),
          });

    const resolvedState =
      state.mode === "education_unit"
        ? {
            ...state,
            educationStage: unitRun.phase,
            workflowId: unitRun.recipeVersion,
          }
        : state;

    return {
      plan,
      allResponses,
      state: resolvedState,
      node,
      unit,
      unitRun,
      unitResponses,
    };
  });

export const resolveWorkspaceTurn = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: WorkspaceProjectionReaderSource;
}): Promise<ResolvedWorkspaceTurn> => {
  const exit = await Effect.runPromiseExit(
    resolveWorkspaceTurnEffect({ sessionId }).pipe(
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
  const allResponses = await deps.listPhaseResponsesBySession(sessionId);
  const readyUnitNode = getNextReadyLearningNode(plan.nodes);
  const readyUnit = readyUnitNode
    ? await deps.getUnitByNodeId(readyUnitNode.id)
    : null;
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];
  const existingReadyUnitRun = readyUnit
    ? await deps.getUnitRun(sessionId, readyUnit.id)
    : null;
  const readyUnitRun = readyUnit
    ? resolveUnitRunProjection({
        sessionId,
        unit: readyUnit,
        existing: existingReadyUnitRun,
      })
    : null;

  return planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
    activeUnitRun: readyUnitRun,
  });
};
