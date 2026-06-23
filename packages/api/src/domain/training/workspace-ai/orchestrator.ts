import type {
  CurriculumNode,
  PhaseResponseRecord,
} from "../types/training.types";
import type { WorkspaceAiEducationStage, WorkspaceAiState } from "./types";
import type { UnitRun, WorkflowDefinition } from "./workflow";
import { getWorkflowStep } from "./workflow";

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

  if (latestState && EDUCATION_STAGE_ORDER.includes(latestState)) {
    return latestState;
  }

  return "diagnostic_scenario";
};

export class IllegalUnitRunTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalUnitRunTransitionError";
  }
}

/**
 * Takes the current run state, one graded turn outcome, and the unit workflow;
 * produces the next run state; fails only when the outcome names a step that
 * is not current or the workflow cannot advance that step.
 */
export const advanceUnitRun = ({
  run,
  outcome,
  workflow,
}: {
  run: UnitRun;
  outcome: {
    stepId: WorkspaceAiEducationStage;
    requestedStepId: WorkspaceAiEducationStage;
    stepComplete: boolean;
    mastered: boolean;
    scenarioCompleted: boolean;
    repairStepId?: WorkspaceAiEducationStage | null;
  };
  workflow: WorkflowDefinition;
}): UnitRun => {
  if (outcome.stepId !== run.currentStepId) {
    throw new IllegalUnitRunTransitionError(
      `Outcome step ${outcome.stepId} does not match current run step ${run.currentStepId}.`,
    );
  }

  const currentStep = getWorkflowStep(workflow, run.currentStepId);
  if (!currentStep) {
    throw new IllegalUnitRunTransitionError(
      `Workflow ${workflow.id} does not contain current step ${run.currentStepId}.`,
    );
  }

  const nextScenarioCount = outcome.scenarioCompleted
    ? run.stepScenarioCount + 1
    : run.stepScenarioCount;

  if (outcome.mastered) {
    return {
      ...run,
      currentStepId: "completed",
      stepScenarioCount: nextScenarioCount,
    };
  }

  if (outcome.repairStepId) {
    const repairStep = getWorkflowStep(workflow, outcome.repairStepId);
    if (!repairStep || repairStep.kind === "terminal") {
      throw new IllegalUnitRunTransitionError(
        `Workflow ${workflow.id} cannot repair to step ${outcome.repairStepId}.`,
      );
    }

    return {
      ...run,
      currentStepId: outcome.repairStepId,
      stepScenarioCount: 0,
    };
  }

  // A mastery_check step graduates only via ELO mastery (handled above).
  // Step completion alone must never walk it to the terminal step — otherwise
  // the run reaches "completed" while the learner is not actually mastered.
  // Loop in place until the mastery gate trips.
  if (currentStep.kind === "mastery_check") {
    return {
      ...run,
      stepScenarioCount: nextScenarioCount,
    };
  }

  if (!outcome.stepComplete) {
    return {
      ...run,
      stepScenarioCount: nextScenarioCount,
    };
  }

  if (!currentStep.next) {
    throw new IllegalUnitRunTransitionError(
      `Workflow ${workflow.id} step ${currentStep.stepId} has no next step.`,
    );
  }

  const nextStep = getWorkflowStep(workflow, currentStep.next);
  if (!nextStep) {
    throw new IllegalUnitRunTransitionError(
      `Workflow ${workflow.id} does not contain next step ${currentStep.next}.`,
    );
  }

  if (
    outcome.requestedStepId !== run.currentStepId &&
    outcome.requestedStepId !== currentStep.next
  ) {
    throw new IllegalUnitRunTransitionError(
      `Outcome requested step ${outcome.requestedStepId} is not legal from ${run.currentStepId}.`,
    );
  }

  return {
    ...run,
    currentStepId: currentStep.next,
    stepScenarioCount: 0,
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
