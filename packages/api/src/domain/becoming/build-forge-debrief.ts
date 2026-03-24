import { ForgeDebriefSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  ForgeDebrief,
  ForgeUnitContent,
  TeachbackMessage,
} from "./types/becoming.types";

export const buildForgeDebrief = async ({
  seedResponse,
  practiceResponses,
  teachbackTranscript,
  ghostResponses,
  unitContent,
  targetIdentity,
}: {
  seedResponse: string;
  practiceResponses: string[];
  teachbackTranscript: TeachbackMessage[];
  ghostResponses: string[] | null;
  unitContent: ForgeUnitContent;
  targetIdentity: string;
}): Promise<ForgeDebrief> =>
  generateBecomingObject({
    schema: ForgeDebriefSchema,
    errorMessage: "Failed to build the Forge debrief.",
    system:
      "You are building a growth report. Compare what the learner knew before with what they can articulate now. Make the growth visible and specific.",
    retryPromptSuffix:
      "- finalArticulation should synthesize the learner's best explanation.\n- growthDimensions should contain 2 to 4 specific changes in understanding when supported by the transcript.",
    prompt: `Build a Forge debrief.

Rules:
1. finalArticulation should be a cleaned-up synthesis of their best teach-back moments, not a direct quote.
2. growthDimensions should list what they understand now that was missing from the seed.
3. Score should consider practice performance, teach-back performance, and ghost performance if present.
4. Readiness should follow these rules:
   - ready_for_next_unit: score >= 80 and teach-back passed
   - developing: score >= 60 or teach-back passed
   - needs_repair: score < 60 and teach-back failed
5. failureTags should reflect failed practice rounds, teach-back gaps, or ghost gaps.
6. nextStep should be concrete practice guidance.

Target identity: ${targetIdentity}
Unit title: ${unitContent.title}
Unit content:
${unitContent.buildContent ?? "Build content missing."}

Seed response:
${seedResponse}

Practice responses:
${practiceResponses.join("\n") || "None recorded."}

Teach-back transcript:
${teachbackTranscript.map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`).join("\n")}

Ghost responses:
${ghostResponses?.join("\n") || "None"}`,
  });
