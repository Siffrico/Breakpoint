import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { gradeRecallProbePrompt } from "./prompts/legacy-registry";
import type { RecallProbeType } from "./types/training.types";

const RecallProbeGradeSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  feedback: z.string().min(1),
  decayTarget: z.string().min(1).nullable(),
});

export const gradeRecallProbe = async ({
  probeType,
  prompt,
  response,
  sourceContext,
  repairPrompt,
}: {
  probeType: RecallProbeType;
  prompt: string;
  response: string;
  sourceContext: string;
  repairPrompt?: string | null;
}) =>
  executePrompt({
    template: gradeRecallProbePrompt,
    schema: RecallProbeGradeSchema,
    context: {
      "Probe type": probeType,
      "Probe prompt": prompt,
      ...(repairPrompt ? { "Repair prompt": repairPrompt } : {}),
      "Source context": sourceContext,
      "Learner response": response,
    },
    errorMessage: "Failed to grade the recall probe.",
  });
