import { z } from "zod/v4";

import { PreSeedUnitContentDraftSchema } from "@acme/validators";

import { FOUNDATION_UNIT_ENTRY_CAP } from "../unit-creation/create-next-unit";

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
    kind: z.enum(["unit", "integration"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    orderIndex: z.number().int().min(0),
  }),
  planContext: z.object({
    /** Parent regime: skill → foundation, ability/skill_cluster → skillset. */
    regime: z.enum(["foundation", "skillset"]).nullable(),
    slotIndex: z.number().int().min(1),
    totalSlots: z.number().int().min(1),
    clusterContext: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
      })
      .nullable(),
    integrationContext: z
      .object({
        completedClusterTitles: z.array(z.string().min(1)),
      })
      .nullable(),
  }),
  learner: z.object({
    targetIdentity: z.string().min(1),
    priorLearning: z.array(PriorLearningRecordSchema),
  }),
  syllabus: z
    .object({
      workflow: z.object({
        name: z.string().min(1),
        steps: z.array(z.string().min(1)).min(1),
      }),
      /** The knowledge-topic question this unit answers; null = unframed. */
      framing: z
        .object({
          question: z.string().min(1),
          coreIdea: z.string().min(1),
          misconception: z.string().min(1),
          /** 1-based sitting number when the question spans multiple units. */
          part: z.number().int().min(1),
        })
        .nullable(),
      checked: z.array(
        z.object({ label: z.string().min(1), gloss: z.string().min(1) }),
      ),
      targets: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            gloss: z.string().min(1),
          }),
        )
        .min(1)
        .max(FOUNDATION_UNIT_ENTRY_CAP),
    })
    .nullable(),
});

export const SeedStageOutputSchema = PreSeedUnitContentDraftSchema.extend({
  conceptTarget: z.string().min(1),
  misconceptionTarget: z.string().min(1),
  workedExampleBrief: z.string().min(1),
  proofTargets: z.array(z.string().min(1)).min(2).max(5),
});

export type PriorLearningRecord = z.infer<typeof PriorLearningRecordSchema>;
export type UnitBuilderContext = z.infer<typeof UnitBuilderContextSchema>;
export type SeedStageOutput = z.infer<typeof SeedStageOutputSchema>;
