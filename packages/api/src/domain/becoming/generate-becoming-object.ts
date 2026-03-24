import { generateObject } from "ai";
import type { z } from "zod/v4";

import { getBecomingModel } from "./services/becoming-model";

export const generateBecomingObject = async <TSchema extends z.ZodTypeAny>({
  schema,
  system,
  prompt,
  errorMessage,
  retryPromptSuffix,
  modelName,
}: {
  schema: TSchema;
  system: string;
  prompt: string;
  errorMessage: string;
  retryPromptSuffix?: string;
  modelName?: string;
}): Promise<z.infer<TSchema>> => {
  const model = getBecomingModel(modelName);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated becoming workflows.");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryInstructions =
        attempt === 0
          ? ""
          : `\n\nRetry instructions:\n- Obey the schema exactly.\n- Do not add commentary outside the object.\n- Be concrete and specific.\n${retryPromptSuffix ?? ""}`;

      const { object } = await generateObject({
        model,
        schema,
        system,
        prompt: `${prompt}${retryInstructions}`,
      });

      return object as z.infer<TSchema>;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    console.error(lastError);
  }

  throw new Error(errorMessage);
};
