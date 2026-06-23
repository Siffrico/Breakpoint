import type { z } from "zod/v4";

import type { WorkspaceContextMove } from "../context-engine/schemas";
import type { AiModelPurpose } from "../engine/model-router";
import type {
  WorkspaceAiEducationStage,
  WorkspaceAiPromptKind,
  WorkspaceAiState,
} from "./types";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiEvaluationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "./types";
import type { StepKind } from "./workflow";
import { getWorkflowDefinition, getWorkflowStep } from "./workflow";

export type WorkspaceContextMode = "teacher" | "evaluator" | "recall";

export type WorkspaceTurnRuntime =
  | {
      mode: "education_unit";
      stage: WorkspaceAiEducationStage;
      promptKind: Extract<
        WorkspaceAiPromptKind,
        "education_unit" | "evaluate_feedback"
      >;
      modelPurpose: Extract<AiModelPurpose, "education" | "evaluation">;
      contextMode: Extract<WorkspaceContextMode, "teacher" | "evaluator">;
      contextMove: Exclude<WorkspaceContextMove, "recall">;
      outputSchema:
        | typeof WorkspaceAiEducationOutputSchema
        | typeof WorkspaceAiEvaluationOutputSchema;
    }
  | {
      mode: "recall";
      stage: null;
      promptKind: Extract<WorkspaceAiPromptKind, "recall">;
      modelPurpose: Extract<AiModelPurpose, "recall">;
      contextMode: Extract<WorkspaceContextMode, "recall">;
      contextMove: Extract<WorkspaceContextMove, "recall">;
      outputSchema: typeof WorkspaceAiRecallOutputSchema;
    };

export type WorkspaceTurnOutput<TRuntime extends WorkspaceTurnRuntime> =
  z.infer<TRuntime["outputSchema"]>;

const EDUCATION_RUNTIME_BY_STEP_KIND = {
  scenario: {
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMode: "teacher",
    contextMove: "diagnose",
    outputSchema: WorkspaceAiEducationOutputSchema,
  },
  learn: {
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMode: "teacher",
    contextMove: "teach",
    outputSchema: WorkspaceAiEducationOutputSchema,
  },
  attempt: {
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMode: "teacher",
    contextMove: "guide",
    outputSchema: WorkspaceAiEducationOutputSchema,
  },
  feedback: {
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMode: "evaluator",
    contextMove: "evaluate",
    outputSchema: WorkspaceAiEvaluationOutputSchema,
  },
  mastery_check: {
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMode: "evaluator",
    contextMove: "transfer",
    outputSchema: WorkspaceAiEvaluationOutputSchema,
  },
  terminal: {
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMode: "evaluator",
    contextMove: "evaluate",
    outputSchema: WorkspaceAiEvaluationOutputSchema,
  },
} satisfies Record<
  StepKind,
  Omit<
    Extract<WorkspaceTurnRuntime, { mode: "education_unit" }>,
    "mode" | "stage"
  >
>;

export const selectWorkspaceTurnRuntime = (
  state: WorkspaceAiState,
): WorkspaceTurnRuntime => {
  if (state.mode === "recall") {
    return {
      mode: "recall",
      stage: null,
      promptKind: "recall",
      modelPurpose: "recall",
      contextMode: "recall",
      contextMove: "recall",
      outputSchema: WorkspaceAiRecallOutputSchema,
    };
  }

  const stage = state.educationStage ?? "diagnostic_scenario";
  const workflow = getWorkflowDefinition(state.workflowId);
  const step = getWorkflowStep(workflow, stage);
  if (!step) {
    throw new Error(`Workflow ${workflow.id} does not contain step ${stage}.`);
  }
  const stepKind = step.kind;
  const runtime = EDUCATION_RUNTIME_BY_STEP_KIND[stepKind];

  return {
    mode: "education_unit",
    stage,
    ...runtime,
  };
};
