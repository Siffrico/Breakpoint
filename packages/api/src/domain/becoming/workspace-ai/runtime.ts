import type { z } from "zod/v4";
import { generateObject } from "ai";

import type { WorkspaceAiPromptKind } from "./types";
import { getBecomingModel } from "../services/becoming-model";
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

const MODEL_BY_KIND: Record<WorkspaceAiPromptKind, string> = {
  onboarding_curriculum: process.env.OPENAI_MODEL_ONBOARDING ?? "gpt-4.1",
  education_unit: process.env.OPENAI_MODEL_EDUCATION ?? "gpt-4.1",
  recall: process.env.OPENAI_MODEL_RECALL ?? "gpt-4.1-mini",
  evaluate_feedback: process.env.OPENAI_MODEL_EVALUATION ?? "gpt-4.1",
};

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
  const model = getBecomingModel(MODEL_BY_KIND[kind]);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI workspace turns.");
  }

  try {
    const { object } = await generateObject({
      model,
      schema,
      system: SYSTEM_PROMPT_BY_KIND[kind],
      prompt: context,
    });

    return object as z.infer<TSchema>;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? `${errorMessage} ${error.message}`
        : errorMessage,
    );
  }
};
