import { z } from "zod/v4";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/becoming.types";

const TeachbackGradeSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
});

export const gradeTeachback = async ({
  unitContent,
  transcript,
  studentPersona,
}: {
  unitContent: ForgeUnitContent;
  transcript: TeachbackMessage[];
  studentPersona: string;
}): Promise<{ passed: boolean; score: number; feedback: string }> =>
  generateBecomingObject({
    schema: TeachbackGradeSchema,
    errorMessage: "Failed to grade the teach-back.",
    system:
      "You are evaluating how well a learner explained and defended a concept under adversarial questioning.",
    retryPromptSuffix:
      "- Score from 0 to 100.\n- Pass only when the learner genuinely handled the objections.\n- Feedback must reference specific transcript moments.",
    prompt: `Grade this teach-back.

Evaluation criteria:
1. Conceptual accuracy.
2. Defense quality under objection.
3. Use of concrete examples.
4. Depth of understanding across rounds.

Pass at 70 or above.

Student persona:
${studentPersona}

Unit title: ${unitContent.title}
Concept content:
${unitContent.buildContent ?? "Build content missing."}

Transcript:
${transcript.map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`).join("\n")}`,
  });
