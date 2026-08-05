import { z } from "zod/v4";

import {
  PreSeedUnitContentDraftSchema,
  UnitMasteryContractSchema,
} from "@acme/validators";

import { FOUNDATION_UNIT_KNOWLEDGE_CAP } from "../unit-creation/target-selection";

export const PriorLearningRecordSchema = z.object({
  title: z.string().min(1),
  score: z.number().int().min(0).max(100),
  readiness: z.string().min(1),
  finalArticulation: z.string().nullable(),
  growthDimensions: z.array(z.string().min(1)).nullable(),
  improvements: z.array(z.string().min(1)),
  failureTags: z.array(z.string().min(1)),
  nextStep: z.string().min(1),
});

export const UnitBuilderContextSchema = z.object({
  node: z.object({
    id: z.string().min(1),
    kind: z.literal("unit"),
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    orderIndex: z.number().int().min(0),
  }),
  planContext: z.object({
    /** Parent regime: skill → foundation, ability → skillset, outcome → main_outcome. */
    regime: z.enum(["foundation", "skillset", "main_outcome"]).nullable(),
    slotIndex: z.number().int().min(1),
    totalSlots: z.number().int().min(1),
    clusterContext: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        /**
         * Topic mode only: the one thing every task under this parent demands.
         * Null in ability mode, where the demand varies with the unit.
         */
        mainOutcome: z.string().min(1).nullable(),
      })
      .nullable(),
  }),
  learner: z.object({
    targetIdentity: z.string().min(1),
    priorLearning: z.array(PriorLearningRecordSchema),
  }),
  knowledge: z
    .object({
      workflow: z.object({
        name: z.string().min(1),
        steps: z.array(z.string().min(1)).min(1),
      }),
      framing: z
        .object({
          question: z.string().min(1),
          part: z.number().int().min(1),
        })
        .nullable(),
      checked: z.array(
        z.object({ label: z.string().min(1), content: z.string().min(1) }),
      ),
      targets: z
        .array(
          z.object({
            id: z.string().min(1),
            kind: z.enum(["concept", "mechanism"]),
            label: z.string().min(1),
            content: z.string().min(1),
          }),
        )
        .min(1)
        .max(FOUNDATION_UNIT_KNOWLEDGE_CAP),
    })
    .nullable(),
});

export const SeedStageOutputSchema = PreSeedUnitContentDraftSchema.extend({
  conceptTarget: z.string().min(1),
  misconceptionTarget: z.string().min(1),
  workedExampleBrief: z.string().min(1),
  unitMasteryContract: UnitMasteryContractSchema,
});

export type PriorLearningRecord = z.infer<typeof PriorLearningRecordSchema>;
export type UnitBuilderContext = z.infer<typeof UnitBuilderContextSchema>;
export type SeedStageOutput = z.infer<typeof SeedStageOutputSchema>;
