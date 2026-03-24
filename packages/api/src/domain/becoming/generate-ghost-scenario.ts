import { GhostScenarioSchema } from "@acme/validators";

import { generateBecomingObject } from "./generate-becoming-object";
import type {
  FailureGap,
  ForgeUnitContent,
  GhostScenario,
} from "./types/becoming.types";

export const generateGhostScenario = async ({
  gap,
  unitContent,
  previousDomains,
}: {
  gap: FailureGap;
  unitContent: ForgeUnitContent;
  previousDomains: string[];
}): Promise<GhostScenario> =>
  generateBecomingObject({
    schema: GhostScenarioSchema,
    errorMessage: "Failed to generate a ghost scenario.",
    system:
      "You are generating a transfer scenario that tests the same cognitive skill in a different domain. The learner failed at a specific gap, and this scenario must require exactly that skill.",
    retryPromptSuffix:
      "- Domain must be clearly different from the unit domain.\n- Keep the prompt concrete and actionable.",
    prompt: `Generate a ghost scenario.

Rules:
1. Domain must be completely different from the unit content domain.
2. Domain must not be in previousDomains.
3. The scenario must test the same reasoning skill behind the identified gap.
4. Keep it concrete and actionable.
5. Make clear what kind of response is expected.

Gap description: ${gap.description}
Gap type: ${gap.gapType}
Where it broke: ${gap.whereItBroke}

Unit title: ${unitContent.title}
Unit content:
${unitContent.buildContent ?? "Build content missing."}

Previous ghost domains: ${previousDomains.join(", ") || "None"}`,
  });
