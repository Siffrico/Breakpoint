import type { PromptTemplate } from "./types";
import { onboardingCurriculumPrompt } from "./onboarding-curriculum";

export { onboardingCurriculumPrompt } from "./onboarding-curriculum";

const ACTIVE_PROMPTS: PromptTemplate[] = [onboardingCurriculumPrompt];

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
