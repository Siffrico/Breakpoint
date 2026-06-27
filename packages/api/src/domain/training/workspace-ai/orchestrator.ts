import type {
  CurriculumNode,
  PhaseResponseRecord,
} from "../types/training.types";
import type { WorkspaceAiEducationStage, WorkspaceAiState } from "./types";
import type { UnitRun, WorkspaceStepVerdict } from "./workflow";
import { WorkspaceAiEducationStageSchema } from "./types";
import { decideNextStep } from "./workflow";

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

  const parsedState = WorkspaceAiEducationStageSchema.safeParse(latestState);
  return parsedState.success ? parsedState.data : "Diagnose";
};

export class IllegalUnitRunTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalUnitRunTransitionError";
  }
}

/**
 * Takes the current run state, one step verdict, and a retry count;
 * produces the next run state; fails only when the outcome names a step that
 * is not current or the verdict rulebook cannot advance that step.
 */
export const advanceUnitRun = ({
  run,
  outcome,
}: {
  run: UnitRun;
  outcome: {
    stepId: WorkspaceAiEducationStage;
    verdict: WorkspaceStepVerdict;
    mastered: boolean;
    scenarioCompleted: boolean;
    retryCount: number;
  };
}): UnitRun => {
  if (outcome.stepId !== run.currentStepId) {
    throw new IllegalUnitRunTransitionError(
      `Outcome step ${outcome.stepId} does not match current run step ${run.currentStepId}.`,
    );
  }

  const nextScenarioCount = outcome.scenarioCompleted
    ? run.stepScenarioCount + 1
    : run.stepScenarioCount;

  if (outcome.mastered) {
    if (run.currentStepId !== "Check" || outcome.verdict !== "pass") {
      throw new IllegalUnitRunTransitionError(
        "Only a passing final check can complete a unit run.",
      );
    }

    return {
      ...run,
      currentStepId: "completed",
      stepScenarioCount: nextScenarioCount,
    };
  }

  const rulebookNextStep = decideNextStep({
    currentStepId: run.currentStepId,
    verdict: outcome.verdict,
    retryCount: outcome.retryCount,
  });
  // A model pass only nominates completion; without rating mastery, test
  // transfer again instead of persisting a false terminal state.
  const nextStepId =
    rulebookNextStep === "completed" ? "Test" : rulebookNextStep;

  return {
    ...run,
    currentStepId: nextStepId,
    stepScenarioCount: nextStepId === run.currentStepId ? nextScenarioCount : 0,
  };
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
  activeUnitRun?: UnitRun | null;
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
      activeUnitRun?.currentStepId ??
      getCurrentEducationStage(activeUnitResponses),
    workflowId: activeUnitRun?.workflowId ?? null,
    activeUnitId: activeUnit.id,
    activeUnitTitle: activeUnit.title,
    recallUnitId: null,
    recallUnitTitle: null,
  };
};
