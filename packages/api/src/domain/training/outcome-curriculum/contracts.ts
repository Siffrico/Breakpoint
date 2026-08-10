import {
  OutcomeCompilationOutputSchema,
  OutcomeDefinitionSchema,
  PracticeContractSchema,
  PracticeDifficultyBandSchema,
  SkillMapItemSchema,
  SkillMapSchema,
} from "@acme/validators";

export const MIN_OUTCOMES_PER_PLAN = 1;
export const MAX_OUTCOMES_PER_PLAN = 10;

export {
  OutcomeCompilationOutputSchema,
  OutcomeDefinitionSchema,
  PracticeContractSchema,
  PracticeDifficultyBandSchema,
  SkillMapItemSchema,
  SkillMapSchema,
};

export type {
  OutcomeCompilationOutput,
  OutcomeDefinition,
  PracticeContract,
  SkillMap,
} from "@acme/validators";
