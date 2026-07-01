import type { z } from "zod/v4";

import type { WorkspaceContextMove } from "../context-engine/schemas";
import type { AiModelPurpose } from "../engine/model-router";
import type {
  WorkspaceAiEducationStage,
  WorkspaceAiPromptKind,
  WorkspaceAiState,
} from "./types";
import type {
  WorkspaceAiEducationOutputSchema,
  WorkspaceAiEvaluationOutputSchema,
} from "./types";
import { WorkspaceAiRecallOutputSchema } from "./types";

export type WorkspaceContextMode = "teacher" | "evaluator" | "recall";

// The education_unit teaching loop no longer runs through this runtime — it is
// driven by the education-unit FSM (see education-unit/orchestrate-unit-turn.ts).
// The education variant is retained only so the shared context-engine types
// (build-context-envelope / render-context-prompt) still compile; getStepCard
// only ever constructs the recall variant now.
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
      verdictField: string;
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

/**
 * Produces the runtime for a workspace turn. Only recall flows through here;
 * education units are handled by the FSM engine, so an education state is a
 * programming error at this seam.
 */
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

  throw new Error(
    "getStepCard was called for an education_unit turn; those run through the education-unit FSM, not the stage runtime.",
  );
};
