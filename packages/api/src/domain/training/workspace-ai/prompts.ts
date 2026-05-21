import type { PromptTemplate } from "../prompts/types";
import {
  educationUnitPrompt,
  evaluateFeedbackPrompt,
  onboardingCurriculumPrompt,
  recallPrompt,
} from "../prompts/registry";

const formatMainPrompt = (template: PromptTemplate) =>
  [
    template.persona.role,
    "",
    "Expertise:",
    ...template.persona.expertise.map((item) => `- ${item}`),
    "",
    "Constraints:",
    ...template.persona.constraints.map((item) => `- ${item}`),
    "",
    "Output expectation:",
    template.persona.outputExpectation,
    "",
    template.instruction,
  ].join("\n");

export const WORKSPACE_AI_ONBOARDING_CURRICULUM_PROMPT = formatMainPrompt(
  onboardingCurriculumPrompt,
);

export const WORKSPACE_AI_EDUCATION_UNIT_PROMPT = formatMainPrompt(
  educationUnitPrompt,
);

export const WORKSPACE_AI_RECALL_PROMPT = formatMainPrompt(recallPrompt);

export const WORKSPACE_AI_EVALUATE_FEEDBACK_PROMPT = formatMainPrompt(
  evaluateFeedbackPrompt,
);
