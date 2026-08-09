import type { ModelTier } from "../prompts/types";

export interface RunProfile {
  /** `critical` runs high-stakes turns; `standard` runs cheaper ones. */
  tier: ModelTier;
  reasoningBudgetTokens: number;
  maxOutputTokens: number;
  maxSteps: number;
  search: boolean;
}

const STANDARD_PROFILE = {
  tier: "standard",
  reasoningBudgetTokens: 0,
  maxOutputTokens: 4_096,
  maxSteps: 4,
  search: false,
} as const satisfies RunProfile;

/**
 * The one registry of model purposes: a purpose exists here or it does not
 * exist. `AiModelPurpose` is derived from these keys, so a row cannot outlive
 * its callers in a second table kept aligned by hand.
 */
export const RUN_PROFILES = {
  onboarding: {
    ...STANDARD_PROFILE,
    tier: "critical",
    maxOutputTokens: 6_144,
    maxSteps: 6,
    search: true,
  },
  curriculum: {
    tier: "critical",
    reasoningBudgetTokens: 24_576,
    maxOutputTokens: 8_192,
    maxSteps: 10,
    search: true,
  },
  buildContent: {
    tier: "critical",
    reasoningBudgetTokens: 8_192,
    maxOutputTokens: 8_192,
    maxSteps: 6,
    search: true,
  },
  education: {
    ...STANDARD_PROFILE,
    tier: "critical",
    reasoningBudgetTokens: 4_096,
  },
  evaluation: {
    ...STANDARD_PROFILE,
    tier: "critical",
    reasoningBudgetTokens: 4_096,
  },
  tutor: STANDARD_PROFILE,
  projectOverview: {
    ...STANDARD_PROFILE,
    reasoningBudgetTokens: 2_048,
    maxOutputTokens: 2_048,
    maxSteps: 3,
  },
  mission: { ...STANDARD_PROFILE, maxSteps: 6, search: true },
  default: STANDARD_PROFILE,
} as const satisfies Record<string, RunProfile>;

export type AiModelPurpose = keyof typeof RUN_PROFILES;

export const getRunProfile = (purpose: AiModelPurpose): RunProfile =>
  RUN_PROFILES[purpose];
