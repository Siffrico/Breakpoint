import type { WorkspaceAiEducationStage } from "./types";

export type StepKind =
  | "scenario"
  | "learn"
  | "attempt"
  | "feedback"
  | "mastery_check"
  | "terminal";

export interface WorkflowStep {
  stepId: WorkspaceAiEducationStage;
  kind: StepKind;
  next: WorkspaceAiEducationStage | null;
}

export interface WorkflowDefinition {
  id: string;
  steps: WorkflowStep[];
}

export interface UnitRun {
  sessionId: string;
  unitContentId: string;
  userId?: string | null;
  workflowId: string;
  currentStepId: WorkspaceAiEducationStage;
  stepScenarioCount: number;
}

export const DIAGNOSTIC_FIRST_WORKFLOW = {
  id: "diagnostic-first-v1",
  steps: [
    {
      stepId: "diagnostic_scenario",
      kind: "scenario",
      next: "concept_instruction",
    },
    {
      stepId: "concept_instruction",
      kind: "learn",
      next: "guided_application",
    },
    {
      stepId: "guided_application",
      kind: "attempt",
      next: "performance_evaluation",
    },
    {
      stepId: "performance_evaluation",
      kind: "feedback",
      next: "transfer_scenario",
    },
    {
      stepId: "transfer_scenario",
      kind: "mastery_check",
      next: "completed",
    },
    {
      stepId: "completed",
      kind: "terminal",
      next: null,
    },
  ],
} satisfies WorkflowDefinition;

export const LEARN_FIRST_WORKFLOW = {
  id: "learn-first-v1",
  steps: [
    {
      stepId: "concept_instruction",
      kind: "learn",
      next: "guided_application",
    },
    {
      stepId: "guided_application",
      kind: "attempt",
      next: "performance_evaluation",
    },
    {
      stepId: "performance_evaluation",
      kind: "feedback",
      next: "transfer_scenario",
    },
    {
      stepId: "transfer_scenario",
      kind: "mastery_check",
      next: "completed",
    },
    {
      stepId: "completed",
      kind: "terminal",
      next: null,
    },
  ],
} satisfies WorkflowDefinition;

const WORKFLOWS = new Map(
  [DIAGNOSTIC_FIRST_WORKFLOW, LEARN_FIRST_WORKFLOW].map((workflow) => [
    workflow.id,
    workflow,
  ]),
);

/**
 * Takes a workflow id; produces the matching workflow definition; fails only
 * by returning the diagnostic-first workflow for unknown ids.
 */
export const getWorkflowDefinition = (workflowId?: string | null) =>
  (workflowId ? WORKFLOWS.get(workflowId) : null) ??
  DIAGNOSTIC_FIRST_WORKFLOW;

/**
 * Takes a workflow and step id; produces the step definition; fails only by
 * returning null when the workflow does not contain that step.
 */
export const getWorkflowStep = (
  workflow: WorkflowDefinition,
  stepId: WorkspaceAiEducationStage,
) => workflow.steps.find((step) => step.stepId === stepId) ?? null;
