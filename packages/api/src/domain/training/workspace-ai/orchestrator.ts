import type { PersistedUnitRun } from "../education-unit/unit";
import type {
  CurriculumNode,
  PhaseResponseRecord,
} from "../types/training.types";
import type { WorkspaceAiEducationStage, WorkspaceAiState } from "./types";
import { WorkspaceAiEducationStageSchema } from "./types";

type RuntimeNode = Pick<
  CurriculumNode,
  "id" | "kind" | "status" | "title" | "summary" | "whyItMatters" | "orderIndex"
>;

const isLearningUnit = (node: RuntimeNode) =>
  node.kind === "unit";

const getNextReadyUnit = (nodes: RuntimeNode[]) =>
  nodes
    .filter((node) => isLearningUnit(node) && node.status === "ready")
    .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null;

/** The node the recall-decay policy chose, resolved to a plan node by the caller. */
export interface PlannedRecallTarget {
  unitNodeId: string;
  unitTitle: string;
}

/**
 * A recall interlude may only interrupt at a unit boundary: before the first
 * education turn of the next unit, or after the current one is mastered.
 * Mid-FSM learners are never yanked out of a half-finished unit.
 */
export const isUnitMidFlight = ({
  activeUnitResponses,
  activeUnitRun,
}: {
  activeUnitResponses: PhaseResponseRecord[];
  activeUnitRun?: PersistedUnitRun | null;
}): boolean =>
  activeUnitResponses.some((response) => response.phase === "ai_education") &&
  activeUnitRun != null &&
  activeUnitRun.phase !== "mastered";

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
  activeUnitResponses,
  activeUnitRun,
  recallTarget = null,
}: {
  nodes: RuntimeNode[];
  activeUnitResponses: PhaseResponseRecord[];
  activeUnitRun?: PersistedUnitRun | null;
  /** Due recall chosen by the decay policy; only honored at a unit boundary. */
  recallTarget?: PlannedRecallTarget | null;
}): WorkspaceAiState | null => {
  if (
    recallTarget &&
    !isUnitMidFlight({ activeUnitResponses, activeUnitRun })
  ) {
    // A recall interlude is an education turn against the source unit's
    // content — recallUnitId (not activeUnitId) marks the run as recall so
    // resolution projects the recall recipe instead of a fresh full unit.
    return {
      mode: "education_unit",
      promptKind: "education_unit",
      educationStage: "solve",
      workflowId: null,
      activeUnitId: null,
      activeUnitTitle: null,
      recallUnitId: recallTarget.unitNodeId,
      recallUnitTitle: recallTarget.unitTitle,
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
