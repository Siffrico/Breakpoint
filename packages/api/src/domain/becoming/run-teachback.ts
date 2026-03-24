import { z } from "zod/v4";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/becoming.types";

const TeachbackReplySchema = z.object({
  studentReply: z.string().min(1),
});

export const runTeachback = async ({
  unitContent,
  studentPersona,
  transcript,
  userPracticeResponses,
  round,
}: {
  unitContent: ForgeUnitContent;
  studentPersona: string;
  transcript: TeachbackMessage[];
  userPracticeResponses: string[];
  round: number;
}): Promise<{ studentReply: string }> =>
  generateBecomingObject({
    schema: TeachbackReplySchema,
    errorMessage: "Failed to generate the next teach-back objection.",
    system:
      "You are playing the role of a skeptical but intelligent student. Your job is to pressure-test the learner's understanding by asking genuine objections, not gotcha questions.",
    retryPromptSuffix:
      "- Stay in character.\n- Make the new objection materially different from previous ones.\n- Escalate sophistication for the current round.",
    prompt: `Continue this teach-back.

Rules:
1. Each objection must be different from the previous ones.
2. Escalation: round 1 = surface misconception, round 2 = structural challenge, round 3 = edge case or meta question.
3. If the learner was strong, acknowledge briefly and pivot harder.
4. Stay in character. Sound like a real skeptical peer.

Student persona:
${studentPersona}

Unit title: ${unitContent.title}
Concept content:
${unitContent.buildContent ?? "Build content missing."}

Practice responses:
${userPracticeResponses.length > 0 ? userPracticeResponses.map((response, index) => `Round ${index + 1}: ${response}`).join("\n") : "None recorded."}

Current round: ${round}

Transcript so far:
${transcript.map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`).join("\n")}`,
  });
