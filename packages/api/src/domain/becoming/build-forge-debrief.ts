import { ForgeDebriefSchema } from "@acme/validators";

import { executePrompt } from "./engine";
import { formatUnitContext, formatTeachbackTranscript } from "./prompts/fragments";
import { forgeDebriefPrompt } from "./prompts/legacy-registry";
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
  executePrompt({
    template: forgeDebriefPrompt,
    schema: ForgeDebriefSchema,
    context: {
      "Target identity": targetIdentity,
      "Unit context": formatUnitContext(unitContent),
      "Seed response": seedResponse,
      "Practice responses": practiceResponses.join("\n") || "None recorded.",
      "Teach-back transcript": formatTeachbackTranscript(teachbackTranscript),
      "Ghost responses": ghostResponses?.join("\n") || "None",
    },
    errorMessage: "Failed to build the Forge debrief.",
  });
