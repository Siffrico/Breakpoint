import { generateObject } from "ai";
import type { z } from "zod/v4";

import { composePrompt } from "../prompts/compose";
import type { PromptContext, PromptTemplate } from "../prompts/types";
import { getModelForTier } from "./model-router";
import { logPromptExecution } from "./observe";

interface ExecuteOptions<TSchema extends z.ZodTypeAny> {
  template: PromptTemplate;
  schema: TSchema;
  context: PromptContext;
  errorMessage: string;
}

/**
 * Executes a prompt template with structured output.
 *
 * Replaces generateBecomingObject with:
 * - Automatic model routing by tier
 * - Composed prompts from template + context
 * - CoT-aware retry with retry instructions from the template
 * - Observability logging
 */
export const executePrompt = async <TSchema extends z.ZodTypeAny>({
  template,
  schema,
  context,
  errorMessage,
}: ExecuteOptions<TSchema>): Promise<z.infer<TSchema>> => {
  const model = getModelForTier(template.tier);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated becoming workflows.");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isRetry = attempt > 0;
    const composed = composePrompt(template, context, { isRetry });
    const start = Date.now();

    try {
      const { object } = await generateObject({
        model,
        schema,
        system: composed.system,
        prompt: composed.prompt,
      });

      logPromptExecution({
        promptId: template.id,
        version: template.version,
        tier: template.tier,
        model: template.tier,
        latencyMs: Date.now() - start,
        attempt,
        success: true,
        scoreEmitted: extractScore(object),
      });

      return object as z.infer<TSchema>;
    } catch (error) {
      lastError = error;

      logPromptExecution({
        promptId: template.id,
        version: template.version,
        tier: template.tier,
        model: template.tier,
        latencyMs: Date.now() - start,
        attempt,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (lastError instanceof Error) {
    console.error(lastError);
  }

  throw new Error(errorMessage);
};

/**
 * Attempts to extract a 'score' field from the generated object
 * for observability logging. Returns undefined if not present.
 */
const extractScore = (obj: unknown): number | undefined => {
  if (typeof obj === "object" && obj !== null && "score" in obj) {
    const score = (obj as Record<string, unknown>).score;
    if (typeof score === "number") return score;
  }
  return undefined;
};
