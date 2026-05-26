import type { z } from "zod/v4";
import { Output, stepCountIs, streamText } from "ai";

import type { AiModelPurpose } from "../engine/model-router";
import {
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
} from "../engine/model-router";

const PURPOSE_BY_AGENT = {
  onboarding: "onboarding",
  curriculumDesigner: "curriculum",
  buildContent: "buildContent",
  failureIsolation: "failure",
  ghostReplay: "ghost",
} as const;

export const runAgent = async <TSchema extends z.ZodTypeAny>({
  agent,
  system,
  prompt,
  schema,
  errorMessage,
}: {
  agent: keyof typeof PURPOSE_BY_AGENT;
  system: string;
  prompt: string;
  schema: TSchema;
  errorMessage: string;
}): Promise<z.infer<TSchema>> => {
  const model = requireAiModelForPurpose(
    PURPOSE_BY_AGENT[agent] as AiModelPurpose,
    "AI-generated training workflows",
  );

  try {
    const result = streamText({
      model,
      output: Output.object({
        schema,
        name: `${agent}_output`,
      }),
      system,
      prompt,
      tools: getSearchToolsForSelectedProvider(),
      stopWhen: stepCountIs(4),
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
