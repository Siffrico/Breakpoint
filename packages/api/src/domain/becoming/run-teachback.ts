import { z } from "zod/v4";

import { executePrompt } from "./engine";
import { formatTeachbackTranscript, formatUnitContext } from "./prompts/fragments";
import { teachbackPrompt } from "./prompts/legacy-registry";
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
  executePrompt({
    template: teachbackPrompt,
    schema: TeachbackReplySchema,
    context: {
      "Student persona": studentPersona,
      "Unit context": formatUnitContext(unitContent),
      "Practice responses":
        userPracticeResponses.length > 0
          ? userPracticeResponses.map((r, i) => `Round ${i + 1}: ${r}`).join("\n")
          : "None recorded.",
      "Current round": String(round),
      "Transcript so far": formatTeachbackTranscript(transcript),
    },
    errorMessage: "Failed to generate the next teach-back objection.",
  });
