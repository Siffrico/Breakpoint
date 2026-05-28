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

  if (stage === "performance_evaluation" || stage === "transfer_scenario") {
    return {
      mode: "education_unit",
      stage,
      promptKind: "evaluate_feedback",
      modelPurpose: "evaluation",
      contextMode: "evaluator",
      contextMove: stage === "transfer_scenario" ? "transfer" : "evaluate",
      outputSchema: WorkspaceAiEvaluationOutputSchema,
    };
  }

  return {
    mode: "education_unit",
    stage,
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMode: "teacher",
    contextMove:
      stage === "concept_instruction"
        ? "teach"
        : stage === "guided_application"
          ? "guide"
          : "diagnose",
    outputSchema: WorkspaceAiEducationOutputSchema,
  };
};
