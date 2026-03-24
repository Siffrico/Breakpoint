import { FailureGapSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  FailureGap,
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/becoming.types";

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
  generateBecomingObject({
    schema: FailureGapSchema,
    errorMessage: "Failed to isolate the learner's reasoning gap.",
    system:
      "You are a diagnostic engine. Your job is to identify the specific reasoning gap that caused this learner to fail. Not general feedback, but a precise named cognitive gap.",
    retryPromptSuffix:
      "- gapType should be a short kebab-case label.\n- whereItBroke must point to the exact practice round or teach-back moment.",
    prompt: `Isolate the failure behind this performance.

Rules:
1. Name the gap in one sentence.
2. gapType should be a precise category such as actor-adaptation-blindspot, surface-level-abstraction, example-dependency, false-concession, or definitional-confusion.
3. whereItBroke must identify the exact practice round or teach-back round where the failure became visible.

Unit title: ${unitContent.title}
Unit content:
${unitContent.buildContent ?? "Build content missing."}

Practice responses:
${practiceResponses.length > 0 ? practiceResponses.map((item) => `Practice ${item.sequence + 1} | passed=${item.passed} | response=${item.response} | feedback=${item.feedback}`).join("\n") : "None recorded."}

Teach-back score: ${teachbackScore}
Teach-back transcript:
${teachbackTranscript.map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`).join("\n")}`,
  });
