import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState, WorkspaceAiTurnMode } from "./types";
import { initialState } from "../education-unit/fsm";
import { CURRENT_RECIPE_VERSION } from "../education-unit/unit";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { planWorkspaceTurn } from "./orchestrator";

export interface WorkspaceTurnDependencies {
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  listPhaseResponsesBySession: (
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  upsertUnitRun: (run: PersistedUnitRun) => Promise<PersistedUnitRun>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  /**
   * Kicks off real scaffold generation for a unit whose row is missing. The
   * read paths never create content themselves; they call this fire-and-forget
   * so a miss starts healing before the client retries.
   */
  prewarmWorkspaceUnit?: (input: {
    node: CurriculumNode;
    sessionId: string;
  }) => Promise<unknown>;
}

/**
 * Fire-and-forget scaffold generation for a missing unit row. Errors are
 * logged, never thrown — the caller is about to surface UNIT_PREPARING and the
 * client retry loop re-triggers preparation on every subsequent miss.
 */
const firePrewarmWorkspaceUnit = ({
  node,
  sessionId,
  deps,
}: {
  node: CurriculumNode;
  sessionId: string;
  deps: Pick<WorkspaceTurnDependencies, "prewarmWorkspaceUnit">;
}) => {
  void deps.prewarmWorkspaceUnit?.({ node, sessionId }).catch(
    (error: unknown) => {
      console.error("Workspace unit prewarm failed", {
        nodeId: node.id,
        error,
      });
    },
  );
};

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
 * Takes a session, unit, and audit history; produces the durable run
 * projection; fails only when the projection write fails.
 */
export const resolveUnitRunProjection = async ({
  sessionId,
  userId,
  unit,
  deps,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  deps: Pick<WorkspaceTurnDependencies, "getUnitRun" | "upsertUnitRun">;
}): Promise<PersistedUnitRun> => {
  const existing = await deps.getUnitRun(sessionId, unit.id);
  if (existing) {
    return existing;
  }

  // A brand-new run always begins at the FSM's opening phase on the current
  // recipe. `initialState` owns the phase/pass/counter defaults.
  return deps.upsertUnitRun({
    ...initialState(unit.id, CURRENT_RECIPE_VERSION),
    sessionId,
    userId: userId ?? null,
  });
};

/**
 * Takes a workspace session id and curriculum accessors, produces the runnable
 * turn with its unit and response history, and fails only when the curriculum
 * is missing, no turn is runnable, or the active unit cannot be prepared.
 */
export const resolveWorkspaceTurn = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: WorkspaceTurnDependencies;
}): Promise<ResolvedWorkspaceTurn> => {
  const [plan, allResponses] = await Promise.all([
    deps.getActivePlan(sessionId),
    deps.listPhaseResponsesBySession(sessionId),
  ]);

  if (!plan) {
    throw new Error("Curriculum is not ready yet.");
  }

  const readyUnitNode = getNextReadyLearningNode(plan.nodes);
  const readyUnit = readyUnitNode
    ? await deps.getUnitByNodeId(readyUnitNode.id)
    : null;
  if (readyUnitNode && !readyUnit) {
    firePrewarmWorkspaceUnit({ node: readyUnitNode, sessionId, deps });
    throw new UnitNotReadyError({
      message: "UNIT_PREPARING",
      nodeId: readyUnitNode.id,
    });
  }
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];
  const readyUnitRun = readyUnit
    ? await resolveUnitRunProjection({
        sessionId,
        unit: readyUnit,
        deps,
      })
    : null;

  const state = planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
    activeUnitRun: readyUnitRun,
  });

  if (!state) {
    throw new Error("There is no runnable workspace turn.");
  }

  const node = findWorkspaceTurnNode({ nodes: plan.nodes, state });
  const unit = node ? await deps.getUnitByNodeId(node.id) : null;

  if (!unit || !node) {
    if (node) {
      firePrewarmWorkspaceUnit({ node, sessionId, deps });
    }
    throw new UnitNotReadyError({
      message: "UNIT_PREPARING",
      nodeId: node?.id,
    });
  }

  const unitResponses =
    unit.id === readyUnit?.id
      ? readyUnitResponses
      : await deps.getPhaseResponses(unit.id, sessionId);
  const unitRun =
    unit.id === readyUnit?.id && readyUnitRun
      ? readyUnitRun
      : await resolveUnitRunProjection({
          sessionId,
          unit,
          deps,
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
  // A missing row must not fail this planner: it runs after a turn has already
  // committed, so throwing here would error a submit whose work is durable.
  // Kick off generation and plan with an empty projection instead.
  if (readyUnitNode && !readyUnit) {
    firePrewarmWorkspaceUnit({ node: readyUnitNode, sessionId, deps });
  }
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];
  const readyUnitRun = readyUnit
    ? await resolveUnitRunProjection({
        sessionId,
        unit: readyUnit,
        deps,
      })
    : null;

  return planWorkspaceTurn({
    nodes: plan.nodes,
    allResponses,
    activeUnitResponses: readyUnitResponses,
    activeUnitRun: readyUnitRun,
  });
};
