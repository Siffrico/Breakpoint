import { PreSeedUnitContentDraftSchema } from "@acme/validators";

import { executePrompt } from "./engine";
import {
  formatClusterContext,
  formatIntegrationContext,
  formatLearningHistory,
} from "./prompts/fragments";
import type { PriorLearningRecord } from "./prompts/fragments";
import { unitSetupPrompt } from "./prompts/registry";
import type { PreSeedUnitContentDraft } from "./types/becoming.types";

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
  clusterContext: {
    title: string;
    summary: string;
    whyItMatters: string;
  } | null;
  integrationContext: {
    completedClusterTitles: string[];
  } | null;
  targetIdentity: string;
  priorLearning: PriorLearningRecord[];
}): Promise<PreSeedUnitContentDraft> =>
  executePrompt({
    template: unitSetupPrompt,
    schema: PreSeedUnitContentDraftSchema,
    context: {
      "Target identity": targetIdentity,
      "Slot kind": slotKind,
      "Slot position": `${slotIndex} of ${totalSlots}`,
      "Cluster context": formatClusterContext(clusterContext),
      "Integration context": formatIntegrationContext(integrationContext),
      "Prior learner history": formatLearningHistory(priorLearning),
    },
    errorMessage: "Failed to generate the next unit setup.",
  });
