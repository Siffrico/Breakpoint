import type { AiModelPurpose } from "./model-router";
import type { RunProfile } from "./run-profiles";
import { getModelTierForPurpose } from "./model-router";
import { getRunProfile } from "./run-profiles";

export type AgentId = keyof typeof AGENT_CONFIG;

type DefaultLimit = "default";

interface AgentDefinition {
  description: string;
  purpose: AiModelPurpose;
  limits: "purpose-profile" | "default";
  maxSteps?: number;
}

/**
 * The readable inventory of every learner-facing or artifact-producing agent.
 * Model ids remain learner-selectable; `modelTier` reports how the router maps
 * each agent into that selected model stack.
 */
export const AGENT_CONFIG = {
  onboardingConsultant: {
    description:
      "Interviews the learner, identifies a motivating project, and hands off a structured learning brief.",
    purpose: "onboarding",
    limits: "default",
  },
  curriculumDesigner: {
    description:
      "Turns the learner's goal into a job- and workflow-driven curriculum architecture.",
    purpose: "curriculum",
    limits: "purpose-profile",
  },
  knowledgeMapper: {
    description:
      "Maps one skill into authored practitioner questions and their required concepts or executable mechanisms.",
    purpose: "knowledge",
    limits: "purpose-profile",
  },
  buildContent: {
    description:
      "Builds unit seed content and cross-unit briefing artifacts used by later teaching agents.",
    purpose: "buildContent",
    limits: "purpose-profile",
  },
  projectOverview: {
    description:
      "Writes the learner-facing overview that explains the project's destination and learning path.",
    purpose: "projectOverview",
    limits: "purpose-profile",
  },
  unitMentor: {
    description:
      "Persistently mentors one capability todo at a time until the learner demonstrates autonomous ability.",
    purpose: "education",
    limits: "default",
    maxSteps: 1,
  },
  adversarialReviewer: {
    description:
      "Stress-tests completed capabilities, pushes improvement, and produces authoritative Goldilocks evidence.",
    purpose: "evaluation",
    limits: "default",
    maxSteps: 1,
  },
  unitCoach: {
    description:
      "Answers learner questions about the active unit using server-owned workspace context.",
    purpose: "tutor",
    limits: "default",
  },
  missionCreator: {
    description:
      "Interviews the learner, proposes real-world missions, and turns the chosen mission into an actionable plan.",
    purpose: "mission",
    limits: "default",
  },
  missionEvaluator: {
    description:
      "Scores submitted mission proof for execution, evidence quality, and demonstrated judgment.",
    purpose: "mission",
    limits: "default",
    maxSteps: 1,
  },
} as const satisfies Record<string, AgentDefinition>;

export interface ResolvedAgentConfig {
  id: AgentId;
  description: string;
  purpose: AiModelPurpose;
  model: "learner-selected (default when unset)";
  modelTier: "critical" | "standard";
  inputTokenLimit: DefaultLimit;
  reasoningTokenLimit: number | DefaultLimit;
  outputTokenLimit: number | DefaultLimit;
  totalGenerationTokenLimit: number | DefaultLimit;
  maxSteps: number | DefaultLimit;
  search: boolean | DefaultLimit;
}

const resolveLimits = (
  definition: AgentDefinition,
): Pick<
  ResolvedAgentConfig,
  | "reasoningTokenLimit"
  | "outputTokenLimit"
  | "totalGenerationTokenLimit"
  | "maxSteps"
  | "search"
> => {
  if (definition.limits === "default") {
    return {
      reasoningTokenLimit: "default",
      outputTokenLimit: "default",
      totalGenerationTokenLimit: "default",
      maxSteps: definition.maxSteps ?? "default",
      search: "default",
    };
  }

  const profile: RunProfile = getRunProfile(definition.purpose);
  return {
    reasoningTokenLimit: profile.reasoningBudgetTokens,
    outputTokenLimit: profile.maxOutputTokens,
    totalGenerationTokenLimit:
      profile.reasoningBudgetTokens + profile.maxOutputTokens,
    maxSteps: profile.maxSteps,
    search: profile.search,
  };
};

export const getAgentConfig = (id: AgentId): ResolvedAgentConfig => {
  const definition: AgentDefinition = AGENT_CONFIG[id];
  return {
    id,
    description: definition.description,
    purpose: definition.purpose,
    model: "learner-selected (default when unset)",
    modelTier: getModelTierForPurpose(definition.purpose),
    inputTokenLimit: "default",
    ...resolveLimits(definition),
  };
};

export const listAgentConfigs = (): ResolvedAgentConfig[] =>
  (Object.keys(AGENT_CONFIG) as AgentId[]).map(getAgentConfig);
