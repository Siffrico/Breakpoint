import type { z } from "zod/v4";

import type { WorkspaceContextMove } from "../context-engine/schemas";
import type { AiModelPurpose } from "../engine/model-router";
import type {
  WorkspaceAiEducationStage,
  WorkspaceAiPromptKind,
  WorkspaceAiState,
} from "./types";
import type { StepCard } from "./workflow";
import {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiEvaluationOutputSchema,
  WorkspaceAiRecallOutputSchema,
} from "./types";
import { getStepCard as getRulebookStepCard } from "./workflow";

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
      instruction: string;
      verdictField: StepCard["verdictField"];
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

const getOutputSchemaForPromptKind = (
  promptKind: Extract<
    WorkspaceAiPromptKind,
    "education_unit" | "evaluate_feedback"
  >,
) =>
  promptKind === "evaluate_feedback"
    ? WorkspaceAiEvaluationOutputSchema
    : WorkspaceAiEducationOutputSchema;

export const getStepCard = (state: WorkspaceAiState): WorkspaceTurnRuntime => {
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

  const stage = state.educationStage ?? "Diagnose";
  const card = getRulebookStepCard(stage);

  return {
    mode: "education_unit",
    stage,
    promptKind: card.promptKind,
    modelPurpose: card.modelPurpose,
    contextMode: card.ai === "evaluation" ? "evaluator" : "teacher",
    contextMove: card.contextMove,
    outputSchema: getOutputSchemaForPromptKind(card.promptKind),
    instruction: card.instruction,
    verdictField: card.verdictField,
  };
};
