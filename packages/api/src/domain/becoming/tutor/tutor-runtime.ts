import { generateObject, streamText, type ModelMessage, type StreamTextResult } from "ai";
import type { z } from "zod/v4";

import { getBecomingModel } from "../services/becoming-model";
import type { TutorContext } from "./schemas";

const getTutorModel = () => {
  const model = getBecomingModel(process.env.OPENAI_MODEL_TUTOR);
  if (!model) {
    throw new Error("OPENAI_API_KEY is required for tutor AI calls.");
  }

  return model;
};

export const streamTutorTurn = ({
  context,
  messages,
}: {
  context: TutorContext;
  messages: ModelMessage[];
}): StreamTextResult<Record<string, never>, never> =>
  streamText({
    model: getTutorModel(),
    system: context.systemPrompt,
    messages: [
      {
        role: "user",
        content: context.userPrompt,
      },
      ...messages,
    ],
  });

export const generateTutorObject = async <TSchema extends z.ZodTypeAny>({
  context,
  schema,
  instruction,
}: {
  context: TutorContext;
  schema: TSchema;
  instruction: string;
}): Promise<z.infer<TSchema>> => {
  const { object } = await generateObject({
    model: getTutorModel(),
    schema,
    system: context.systemPrompt,
    prompt: `${context.userPrompt}

## Task
${instruction}`,
  });

  return object as z.infer<TSchema>;
};
