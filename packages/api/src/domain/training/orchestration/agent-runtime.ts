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
  projectOverview: "projectOverview",
} as const;

const REASONING_PROVIDER_OPTIONS = {
  openai: { reasoningEffort: "high", reasoningSummary: "auto" },
  google: { thinkingConfig: { thinkingBudget: 8000, includeThoughts: true } },
} as const;

export const runAgent = async <TSchema extends z.ZodTypeAny>({
  agent,
  system,
  prompt,
  schema,
  errorMessage,
  reasoning = false,
}: {
  agent: keyof typeof PURPOSE_BY_AGENT;
  system: string;
  prompt: string;
  schema: TSchema;
  errorMessage: string;
  reasoning?: boolean;
}): Promise<z.infer<TSchema>> => {
  const purpose = PURPOSE_BY_AGENT[agent] as AiModelPurpose;
  const model = requireAiModelForPurpose(
    purpose,
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
      tools: getSearchToolsForSelectedProvider(purpose),
      stopWhen: stepCountIs(4),
      ...(reasoning ? { providerOptions: REASONING_PROVIDER_OPTIONS } : {}),
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
