import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { formatTeachbackTranscript, formatUnitContext } from "./prompts/fragments";
import { gradeTeachbackPrompt } from "./prompts/legacy-registry";
import type {
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/training.types";

/**
 * Internal schema with CoT reasoning fields.
 * The model reasons through each dimension before scoring,
 * producing dramatically more accurate and consistent grades.
 */
const TeachbackGradeWithReasoningSchema = z.object({
  reasoning: z.object({
    conceptualAccuracy: z.string().min(1),
    defenseQuality: z.string().min(1),
    exampleUsage: z.string().min(1),
    depthProgression: z.string().min(1),
    overallAssessment: z.string().min(1),
  }),
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
}): Promise<{ passed: boolean; score: number; feedback: string }> => {
  const result = await executePrompt({
    template: gradeTeachbackPrompt,
    schema: TeachbackGradeWithReasoningSchema,
    context: {
      "Student persona": studentPersona,
      "Unit context": formatUnitContext(unitContent),
      Transcript: formatTeachbackTranscript(transcript),
    },
    errorMessage: "Failed to grade the teach-back.",
  });

  return {
    passed: result.passed,
    score: result.score,
    feedback: result.feedback,
  };
};
