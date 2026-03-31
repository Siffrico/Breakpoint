import { generateObject } from "ai";
import type { z } from "zod/v4";

import { getBecomingModel } from "../services/becoming-model";

const MODEL_BY_AGENT = {
  onboarding: process.env.OPENAI_MODEL_ONBOARDING ?? "gpt-4.1",
  curriculumDesigner: process.env.OPENAI_MODEL_CURRICULUM ?? "gpt-4.1",
  buildContent: process.env.OPENAI_MODEL_BUILD_CONTENT ?? "gpt-4.1",
  failureIsolation: process.env.OPENAI_MODEL_FAILURE ?? "gpt-4.1",
  ghostReplay: process.env.OPENAI_MODEL_GHOST ?? "gpt-4.1",
} as const;

export const runAgent = async <TSchema extends z.ZodTypeAny>({
  agent,
  system,
  prompt,
  schema,
  errorMessage,
}: {
  agent: keyof typeof MODEL_BY_AGENT;
  system: string;
  prompt: string;
  schema: TSchema;
  errorMessage: string;
}): Promise<z.infer<TSchema>> => {
  const model = getBecomingModel(MODEL_BY_AGENT[agent]);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for AI-generated becoming workflows.");
  }

  try {
    const { object } = await generateObject({
      model,
      schema,
      system,
      prompt,
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
