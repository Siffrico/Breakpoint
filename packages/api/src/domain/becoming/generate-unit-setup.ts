import { PreSeedUnitContentDraftSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
import type { PreSeedUnitContentDraft } from "./types/becoming.types";

interface PriorLearningRecord {
  title: string;
  score: number;
  readiness: string;
  finalArticulation: string | null;
  growthDimensions: string[] | null;
  improvements: string[];
  failureTags: string[];
  nextStep: string;
}

export const generateUnitSetup = async ({
  slotKind,
  slotIndex,
  totalSlots,
  clusterContext,
  integrationContext,
  targetIdentity,
  priorLearning,
}: {
  slotKind: "unit" | "integration";
  slotIndex: number;
  totalSlots: number;
  clusterContext:
    | {
        title: string;
        summary: string;
        whyItMatters: string;
      }
    | null;
  integrationContext:
    | {
        completedClusterTitles: string[];
      }
    | null;
  targetIdentity: string;
  priorLearning: PriorLearningRecord[];
}): Promise<PreSeedUnitContentDraft> =>
  generateBecomingObject({
    schema: PreSeedUnitContentDraftSchema,
    errorMessage: "Failed to generate the next unit setup.",
    system:
      "You are generating the next training unit only when the learner reaches it. Your job is to choose the exact lesson this learner now needs, based on the curriculum skeleton and everything they have already done.",
    retryPromptSuffix:
      "- Return only title, seedPrompt, teachbackSetup, and scenario.\n- Make the unit feel like the next necessary step, not a generic lesson.",
    prompt: `Generate the next just-in-time learning unit.

Rules:
- This unit is being generated only now, when the learner reached this slot.
- Choose the specific lesson based on the learner's prior work. Do not repeat earlier units.
- title must be concrete and specific to the lesson you choose now.
- seedPrompt must probe what the learner currently believes about this exact lesson.
- teachbackSetup must pressure-test the chosen lesson, not the broader cluster in general.
- scenario.focusAreas should contain 2 or 3 concrete evaluation targets.
- If slotKind is "unit", stay inside the cluster scope while advancing deeper into it.
- If slotKind is "integration", synthesize across the completed clusters rather than teaching an isolated skill.
- Respect position: earlier slots should establish leverage, later slots should push complexity, transfer, or edge cases.

Target identity: ${targetIdentity}
Slot kind: ${slotKind}
Slot position: ${slotIndex} of ${totalSlots}

Cluster context:
${clusterContext
  ? `Title: ${clusterContext.title}
Summary: ${clusterContext.summary}
Why it matters: ${clusterContext.whyItMatters}`
  : "None"}

Integration context:
${integrationContext
  ? `Completed clusters: ${integrationContext.completedClusterTitles.join("; ")}`
  : "None"}

Prior learner history:
${priorLearning.length > 0
  ? priorLearning
      .map(
        (item, index) => `History ${index + 1}
Title: ${item.title}
Score: ${item.score}
Readiness: ${item.readiness}
Final articulation: ${item.finalArticulation ?? "None"}
Growth dimensions: ${item.growthDimensions?.join("; ") ?? "None"}
Improvements: ${item.improvements.join("; ") || "None"}
Failure tags: ${item.failureTags.join("; ") || "None"}
Next step: ${item.nextStep}`,
      )
      .join("\n\n")
  : "No completed unit history yet."}`,
  });
