import { FailureGapSchema } from "@acme/validators";

import { executePrompt } from "./engine";
import {
  formatUnitContext,
  formatPracticeResponses,
  formatTeachbackTranscript,
} from "./prompts/fragments";
import { isolateFailurePrompt } from "./prompts/legacy-registry";
import type {
  FailureGap,
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/training.types";

export const isolateFailure = async ({
  unitContent,
  practiceResponses,
  teachbackTranscript,
  teachbackScore,
}: {
  unitContent: ForgeUnitContent;
  practiceResponses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>;
  teachbackTranscript: TeachbackMessage[];
  teachbackScore: number;
}): Promise<FailureGap> =>
  executePrompt({
    template: isolateFailurePrompt,
    schema: FailureGapSchema,
    context: {
      "Unit context": formatUnitContext(unitContent),
      "Practice responses": formatPracticeResponses(practiceResponses),
      "Teach-back score": String(teachbackScore),
      "Teach-back transcript": formatTeachbackTranscript(teachbackTranscript),
    },
    errorMessage: "Failed to isolate the learner's reasoning gap.",
  });
