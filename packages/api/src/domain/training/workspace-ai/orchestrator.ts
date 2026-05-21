import type {
  CurriculumNode,
  PhaseResponseRecord,
} from "../types/training.types";
import type { WorkspaceAiEducationStage, WorkspaceAiState } from "./types";

const EDUCATION_STAGE_ORDER: WorkspaceAiEducationStage[] = [
  "diagnostic_scenario",
  "concept_instruction",
  "guided_application",
  "performance_evaluation",
  "transfer_scenario",
  "completed",
];

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
 * Takes phase response history; produces the active education stage; fails
 * only by returning the first stage when no durable stage exists yet.
 */
export const getCurrentEducationStage = (
  responses: PhaseResponseRecord[],
): WorkspaceAiEducationStage => {
  const latestState = responses
    .slice()
    .reverse()
    .find((response) => response.metadata?.aiEducationStage)
    ?.metadata?.aiEducationStage;

  return EDUCATION_STAGE_ORDER.includes(
    latestState as WorkspaceAiEducationStage,
  )
    ? (latestState as WorkspaceAiEducationStage)
    : "diagnostic_scenario";
};

/**
 * Takes the current stage and the AI-requested next stage; produces the next
 * legal stage; fails closed by staying put when the requested transition skips
 * too far or goes backward unexpectedly.
 */
export const normalizeEducationStageTransition = ({
  currentStage,
  requestedStage,
  stageComplete,
  unitComplete,
}: {
  currentStage: WorkspaceAiEducationStage;
  requestedStage: WorkspaceAiEducationStage;
  stageComplete: boolean;
  unitComplete: boolean;
}): WorkspaceAiEducationStage => {
  if (unitComplete) {
    return "completed";
  }

  if (!stageComplete) {
    return currentStage;
  }

  const currentIndex = EDUCATION_STAGE_ORDER.indexOf(currentStage);
  const requestedIndex = EDUCATION_STAGE_ORDER.indexOf(requestedStage);
  const nextIndex = Math.min(
    currentIndex + 1,
    EDUCATION_STAGE_ORDER.length - 1,
  );

  if (requestedIndex === nextIndex) {
    return requestedStage;
  }

  return EDUCATION_STAGE_ORDER[nextIndex] ?? "completed";
};

/**
 * Takes the curriculum and response history; produces the next workspace turn
 * state; fails only by returning null when the curriculum has no runnable unit.
 */
export const planWorkspaceTurn = ({
  nodes,
  allResponses,
  activeUnitResponses,
}: {
  nodes: RuntimeNode[];
  allResponses: PhaseResponseRecord[];
  activeUnitResponses: PhaseResponseRecord[];
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
    educationStage: getCurrentEducationStage(activeUnitResponses),
    activeUnitId: activeUnit.id,
    activeUnitTitle: activeUnit.title,
    recallUnitId: null,
    recallUnitTitle: null,
  };
};
