import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState, WorkspaceAiTurnMode } from "./types";
import type { UnitRun } from "./workflow";
import { ensureWorkspaceUnit } from "../workflows/get-ai-workspace-workflow";
import { getCurrentEducationStage, planWorkspaceTurn } from "./orchestrator";
import { DIAGNOSTIC_FIRST_WORKFLOW } from "./workflow";

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
  ) => Promise<UnitRun | null>;
  upsertUnitRun: (run: UnitRun) => Promise<UnitRun>;
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  createUnitContent: (input: {
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract?: UnitContent["unitMasteryContract"];
  }) => Promise<UnitContent | null>;
}

export interface ResolvedWorkspaceTurn {
  plan: CurriculumPlan;
  allResponses: PhaseResponseRecord[];
  state: WorkspaceAiState;
  node: CurriculumNode;
  unit: UnitContent;
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
  unitResponses,
  fallbackStepId,
  deps,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  unitResponses: PhaseResponseRecord[];
  fallbackStepId?: WorkspaceAiState["educationStage"];
  deps: Pick<WorkspaceTurnDependencies, "getUnitRun" | "upsertUnitRun">;
}): Promise<UnitRun> => {
  const existing = await deps.getUnitRun(sessionId, unit.id);
  if (existing) {
    return existing;
  }

  return deps.upsertUnitRun({
    sessionId,
    unitContentId: unit.id,
    userId,
    workflowId: DIAGNOSTIC_FIRST_WORKFLOW.id,
    currentStepId: fallbackStepId ?? getCurrentEducationStage(unitResponses),
    stepScenarioCount: 0,
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
    ? await ensureWorkspaceUnit({
        node: readyUnitNode,
        deps,
      })
    : null;
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];
  const readyUnitRun = readyUnit
    ? await resolveUnitRunProjection({
        sessionId,
        unit: readyUnit,
        unitResponses: readyUnitResponses,
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
  const unit = await ensureWorkspaceUnit({ node, deps });

  if (!unit || !node) {
    throw new Error("Workspace unit could not be prepared.");
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
          unitResponses,
          deps,
        });

  const resolvedState =
    state.mode === "education_unit"
      ? {
          ...state,
          educationStage: unitRun.currentStepId,
          workflowId: unitRun.workflowId,
        }
      : state;

  return {
    plan,
    allResponses,
    state: resolvedState,
    node,
    unit,
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
    ? await ensureWorkspaceUnit({
        node: readyUnitNode,
        deps,
      })
    : null;
  const readyUnitResponses = readyUnit
    ? await deps.getPhaseResponses(readyUnit.id, sessionId)
    : [];
  const readyUnitRun = readyUnit
    ? await resolveUnitRunProjection({
        sessionId,
        unit: readyUnit,
        unitResponses: readyUnitResponses,
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
