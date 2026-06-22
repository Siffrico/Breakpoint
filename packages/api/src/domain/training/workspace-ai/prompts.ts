import type { PromptTemplate } from "../prompts/types";
import {
  educationUnitPrompt,
  evaluationStagePrompt,
  onboardingCurriculumPrompt,
  recallPrompt,
} from "../prompts/registry";

const SEARCH_POLICY = `Search policy:
- You have access to a web search tool. Use it whenever you are not 100% certain about a factual claim, named artifact, current state, API/tool detail, person, company, market, event, schedule, law, or anything that may have changed.
- Search before building curriculum or teaching around external facts you have not verified.
- Do not guess when a quick search would remove uncertainty.`;

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
    SEARCH_POLICY,
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
  evaluationStagePrompt,
);
