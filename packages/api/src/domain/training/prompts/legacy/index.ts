import type { PromptTemplate } from "../types";

export { onboardingStepPrompt, identityReportPrompt } from "./onboarding";
export { beforeAfterPrompt } from "./overview";
export {
  legacyUnitSetupPrompt,
  legacyBuildContentPrompt,
  legacyPracticePromptsPrompt,
} from "./unit-authoring";
export {
  gradeRecallProbePrompt,
  recallRepairPrompt,
  legacyTeachbackRoundPrompt,
  legacyTeachbackGradingPrompt,
  isolateFailurePrompt,
  legacyGhostScenarioPrompt,
  legacyGhostGradingPrompt,
  legacyForgeDebriefPrompt,
} from "./assessment";
export {
  recallSeedReturnPrompt,
  recallInterleavePrompt,
  recallCompressionPrompt,
} from "./recall";
export {
  legacyCapstoneDesignPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
} from "./capstone";

export { legacyUnitSetupPrompt as unitSetupPrompt } from "./unit-authoring";
export { legacyBuildContentPrompt as buildContentPrompt } from "./unit-authoring";
export { legacyPracticePromptsPrompt as practicePromptsPrompt } from "./unit-authoring";
export { legacyTeachbackRoundPrompt as teachbackPrompt } from "./assessment";
export { legacyTeachbackGradingPrompt as gradeTeachbackPrompt } from "./assessment";
export { legacyGhostScenarioPrompt as ghostScenarioPrompt } from "./assessment";
export { legacyGhostGradingPrompt as gradeGhostPrompt } from "./assessment";
export { legacyForgeDebriefPrompt as forgeDebriefPrompt } from "./assessment";
export { legacyCapstoneDesignPrompt as capstoneAgentPrompt } from "./capstone";

import { onboardingStepPrompt, identityReportPrompt } from "./onboarding";
import { beforeAfterPrompt } from "./overview";
import { legacyUnitSetupPrompt, legacyBuildContentPrompt, legacyPracticePromptsPrompt } from "./unit-authoring";
import {
  legacyTeachbackRoundPrompt,
  legacyTeachbackGradingPrompt,
  isolateFailurePrompt,
  legacyGhostScenarioPrompt,
  legacyGhostGradingPrompt,
  legacyForgeDebriefPrompt,
} from "./assessment";
import {
  legacyCapstoneDesignPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
} from "./capstone";

const LEGACY_PROMPTS: PromptTemplate[] = [
  onboardingStepPrompt,
  identityReportPrompt,
  beforeAfterPrompt,
  legacyUnitSetupPrompt,
  legacyBuildContentPrompt,
  legacyPracticePromptsPrompt,
  legacyTeachbackRoundPrompt,
  legacyTeachbackGradingPrompt,
  isolateFailurePrompt,
  legacyGhostScenarioPrompt,
  legacyGhostGradingPrompt,
  legacyForgeDebriefPrompt,
  legacyCapstoneDesignPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
];

export const getPrompt = (id: string): PromptTemplate => {
  const found = LEGACY_PROMPTS.find((prompt) => prompt.id === id);
  if (!found) {
    throw new Error(`Prompt template not found: ${id}`);
  }
  return found;
};

export const listPrompts = (): { id: string; version: number; tier: string }[] =>
  LEGACY_PROMPTS.map((prompt) => ({
    id: prompt.id,
    version: prompt.version,
    tier: prompt.tier,
  }));
