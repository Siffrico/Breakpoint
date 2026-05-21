import type { ModelMessage, StreamTextResult } from "ai";
import type { z } from "zod/v4";
import { generateObject, streamText } from "ai";

import type { TutorContext } from "./schemas";
import { requireAiModelForPurpose } from "../engine/model-router";

const getTutorModel = () => requireAiModelForPurpose("tutor", "tutor AI calls");

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
