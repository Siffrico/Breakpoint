import type { PromptTemplate } from "./types";

export { onboardingCurriculumPrompt } from "./onboarding-curriculum";
export { educationUnitPrompt } from "./education-unit";
export { recallPrompt } from "./recall";
export { evaluationStagePrompt } from "./evaluation-stage";
export { evaluationStagePrompt as evaluateFeedbackPrompt } from "./evaluation-stage";

import { onboardingCurriculumPrompt } from "./onboarding-curriculum";
import { educationUnitPrompt } from "./education-unit";
import { recallPrompt } from "./recall";
import { evaluationStagePrompt } from "./evaluation-stage";

const ACTIVE_PROMPTS: PromptTemplate[] = [
  onboardingCurriculumPrompt,
  educationUnitPrompt,
  recallPrompt,
  evaluationStagePrompt,
];

export const getPrompt = (id: string): PromptTemplate => {
  const found = ACTIVE_PROMPTS.find((prompt) => prompt.id === id);
  if (!found) {
    throw new Error(`Main prompt template not found: ${id}`);
  }
  return found;
};

export const listPrompts = (): {
  id: string;
  version: number;
  tier: string;
}[] =>
  ACTIVE_PROMPTS.map((prompt) => ({
    id: prompt.id,
    version: prompt.version,
    tier: prompt.tier,
  }));
