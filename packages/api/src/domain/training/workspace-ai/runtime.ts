import type { z } from "zod/v4";

import type { AiModelPurpose } from "../engine/model-router";
import { invokeStructuredModel } from "../engine/invoke-structured-model";
import type { WorkspaceAiPromptKind } from "./types";
import {
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
} from "../engine/model-router";
import {
  WORKSPACE_AI_EDUCATION_UNIT_PROMPT,
  WORKSPACE_AI_EVALUATE_FEEDBACK_PROMPT,
  WORKSPACE_AI_ONBOARDING_CURRICULUM_PROMPT,
  WORKSPACE_AI_RECALL_PROMPT,
} from "./prompts";

const SYSTEM_PROMPT_BY_KIND: Record<WorkspaceAiPromptKind, string> = {
  onboarding_curriculum: WORKSPACE_AI_ONBOARDING_CURRICULUM_PROMPT,
  education_unit: WORKSPACE_AI_EDUCATION_UNIT_PROMPT,
  recall: WORKSPACE_AI_RECALL_PROMPT,
  evaluate_feedback: WORKSPACE_AI_EVALUATE_FEEDBACK_PROMPT,
};

const PURPOSE_BY_KIND: Record<WorkspaceAiPromptKind, AiModelPurpose> = {
  onboarding_curriculum: "onboarding",
  education_unit: "education",
  recall: "recall",
  evaluate_feedback: "evaluation",
};

export const getWorkspaceAiSystemPrompt = (
  kind: WorkspaceAiPromptKind,
): string => SYSTEM_PROMPT_BY_KIND[kind];

export const getWorkspaceAiModelPurpose = (
  kind: WorkspaceAiPromptKind,
): AiModelPurpose => PURPOSE_BY_KIND[kind];

/**
 * Takes one AI prompt kind, structured context, and an output schema; produces
 * a schema-valid model object; fails only when the model is unavailable or the
 * model cannot satisfy the schema after the SDK's validation.
 */
export const runWorkspaceAiPrompt = async <TSchema extends z.ZodTypeAny>({
  kind,
  context,
  schema,
  errorMessage,
}: {
  kind: WorkspaceAiPromptKind;
  context: string;
  schema: TSchema;
  errorMessage: string;
}): Promise<z.infer<TSchema>> => {
  const model = requireAiModelForPurpose(
    PURPOSE_BY_KIND[kind],
    "AI workspace turns",
  );

  try {
    const result = invokeStructuredModel({
      model,
      schema,
      schemaName: `${kind}_output`,
      system: SYSTEM_PROMPT_BY_KIND[kind],
      prompt: context,
      tools: getSearchToolsForSelectedProvider(PURPOSE_BY_KIND[kind]),
      maxSteps: 4,
    });
    const object = await result.output;

    return object as z.infer<TSchema>;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `${errorMessage} ${error.message}`
        : errorMessage,
    );
  }
};
