import type {
  CurriculumNode,
  PhaseResponseRecord,
} from "../types/training.types";
import type { WorkspaceAiEducationStage, WorkspaceAiState } from "./types";
import type { PersistedUnitRun } from "../education-unit/unit";
import { WorkspaceAiEducationStageSchema } from "./types";

const RECALL_INTERVAL_COMPLETIONS = 3;

type RuntimeNode = Pick<
  CurriculumNode,
  "id" | "kind" | "status" | "title" | "summary" | "whyItMatters" | "orderIndex"
>;

const isLearningUnit = (node: RuntimeNode) =>
  node.kind === "unit" || node.kind === "integration";

const getCompletedUnits = (nodes: RuntimeNode[]) =>
  nodes
    .filter((node) => isLearningUnit(node) && node.status === "completed")
    .sort((left, right) => left.orderIndex - right.orderIndex);

const getNextReadyUnit = (nodes: RuntimeNode[]) =>
  nodes
    .filter((node) => isLearningUnit(node) && node.status === "ready")
    .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null;

const getRecalledUnitIds = (responses: PhaseResponseRecord[]) =>
  new Set(
    responses
      .filter((response) => response.phase === "ai_recall")
      .map((response) => response.metadata?.recallUnitId)
      .filter((unitId): unitId is string => typeof unitId === "string"),
  );

/**
 * Takes curriculum nodes and recall response history; produces the next due
 * recall unit; fails only by returning null when no recall is due.
 */
export const selectDueRecallUnit = ({
  nodes,
  responses,
}: {
  nodes: RuntimeNode[];
  responses: PhaseResponseRecord[];
}) => {
  const completedUnits = getCompletedUnits(nodes);
  const recalledUnitIds = getRecalledUnitIds(responses);
  const recallSlotsUnlocked = Math.floor(
    completedUnits.length / RECALL_INTERVAL_COMPLETIONS,
  );

  return (
    completedUnits
      .slice(0, recallSlotsUnlocked)
      .find((unit) => !recalledUnitIds.has(unit.id)) ?? null
  );
};

/**
 * Takes phase response history; produces the phase the unit last left off in;
 * defaults to the FSM's opening phase ("orient") when no durable phase exists
 * yet. Only a fallback — the durable cursor is the unit-run row's `phase`.
 */
export const getCurrentEducationStage = (
  responses: PhaseResponseRecord[],
): WorkspaceAiEducationStage => {
  const latestState = responses
    .slice()
    .reverse()
    .find((response) => response.metadata?.aiEducationStage)
    ?.metadata?.aiEducationStage;

  const parsedState = WorkspaceAiEducationStageSchema.safeParse(latestState);
  return parsedState.success ? parsedState.data : "orient";
};

/**
 * Takes the curriculum and response history; produces the next workspace turn
 * state; fails only by returning null when the curriculum has no runnable unit.
 */
export const planWorkspaceTurn = ({
  nodes,
  allResponses,
  activeUnitResponses,
  activeUnitRun,
}: {
  nodes: RuntimeNode[];
  allResponses: PhaseResponseRecord[];
  activeUnitResponses: PhaseResponseRecord[];
  activeUnitRun?: PersistedUnitRun | null;
}): WorkspaceAiState | null => {
  const recallUnit = selectDueRecallUnit({
    nodes,
    responses: allResponses,
  });

  if (recallUnit) {
    return {
      mode: "recall",
      promptKind: "recall",
      educationStage: null,
      workflowId: null,
      activeUnitId: null,
      activeUnitTitle: null,
      recallUnitId: recallUnit.id,
      recallUnitTitle: recallUnit.title,
    };
  }

  const activeUnit = getNextReadyUnit(nodes);
  if (!activeUnit) {
    return null;
  }

  return {
    mode: "education_unit",
    promptKind: "education_unit",
    educationStage:
      activeUnitRun?.phase ?? getCurrentEducationStage(activeUnitResponses),
    workflowId: activeUnitRun?.recipeVersion ?? null,
    activeUnitId: activeUnit.id,
    activeUnitTitle: activeUnit.title,
    recallUnitId: null,
    recallUnitTitle: null,
  };
};
