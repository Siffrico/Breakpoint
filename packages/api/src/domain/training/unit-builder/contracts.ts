import { z } from "zod/v4";

import { PracticeContractSchema, SkillMapSchema } from "@acme/validators";

export const OutcomeTaskContractSchema = z.object({
  outcomeResult: z.string().min(1),
  skillMap: SkillMapSchema,
  practiceContract: PracticeContractSchema,
});

export type OutcomeTaskContract = z.infer<typeof OutcomeTaskContractSchema>;
