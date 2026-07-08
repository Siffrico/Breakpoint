import type { AiModelPurpose } from "./model-router";

export interface RunProfile {
  reasoningBudgetTokens: number;
  maxOutputTokens: number;
  maxSteps: number;
  search: boolean;
}

const STANDARD_PROFILE = {
  reasoningBudgetTokens: 0,
  maxOutputTokens: 4_096,
  maxSteps: 4,
  search: false,
} as const satisfies RunProfile;

export const RUN_PROFILES = {
  onboarding: { ...STANDARD_PROFILE, maxOutputTokens: 6_144 },
  curriculum: {
    reasoningBudgetTokens: 24_576,
    maxOutputTokens: 8_192,
    maxSteps: 10,
    search: true,
  },
  syllabus: {
    reasoningBudgetTokens: 16_384,
    maxOutputTokens: 8_192,
    maxSteps: 8,
    search: true,
  },
  buildContent: {
    reasoningBudgetTokens: 8_192,
    maxOutputTokens: 8_192,
    maxSteps: 6,
    search: true,
  },
  failure: { ...STANDARD_PROFILE, reasoningBudgetTokens: 8_192 },
  ghost: { ...STANDARD_PROFILE, reasoningBudgetTokens: 8_192 },
  education: { ...STANDARD_PROFILE, reasoningBudgetTokens: 4_096 },
  recall: STANDARD_PROFILE,
  evaluation: { ...STANDARD_PROFILE, reasoningBudgetTokens: 4_096 },
  tutor: STANDARD_PROFILE,
  capstone: { ...STANDARD_PROFILE, reasoningBudgetTokens: 8_192 },
  projectOverview: {
    ...STANDARD_PROFILE,
    reasoningBudgetTokens: 8_192,
    maxOutputTokens: 8_192,
    maxSteps: 6,
    search: true,
  },
  default: STANDARD_PROFILE,
} as const satisfies Record<AiModelPurpose, RunProfile>;

export const getRunProfile = (purpose: AiModelPurpose): RunProfile =>
  RUN_PROFILES[purpose];
