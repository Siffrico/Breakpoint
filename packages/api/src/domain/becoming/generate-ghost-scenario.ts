import { GhostScenarioSchema } from "@acme/validators";

import { executePrompt } from "./engine";
import { formatUnitContext, formatGapContext } from "./prompts/fragments";
import { ghostScenarioPrompt } from "./prompts/registry";
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
  executePrompt({
    template: ghostScenarioPrompt,
    schema: GhostScenarioSchema,
    context: {
      "Gap": formatGapContext(gap),
      "Unit context": formatUnitContext(unitContent),
      "Previous ghost domains": previousDomains.join(", ") || "None",
    },
    errorMessage: "Failed to generate a ghost scenario.",
  });
