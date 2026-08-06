import { z } from "zod/v4";

import {
  PreSeedUnitContentDraftSchema,
  ScenarioBriefSchema,
  UnitMasteryContractSchema,
} from "@acme/validators";

import { SubtypeBlueprintSchema } from "../outcome-curriculum/contracts";
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

export const TopicTaskContractSchema = z.object({
  mainOutcome: z.string().min(1),
  scenarioBrief: ScenarioBriefSchema,
  blueprint: SubtypeBlueprintSchema,
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
        /** Topic mode only: the fixed demand and task-generation constraints. */
        taskContract: TopicTaskContractSchema.nullable(),
      })
      .nullable(),
  }),
  learner: z.object({
    targetIdentity: z.string().min(1),
    priorLearning: z.array(PriorLearningRecordSchema),
  }),
  /**
   * The goldilocks call for this rep, resolved from the parent cluster's rating
   * at build time. `promptBlock` is the rendered directive the generator must
   * follow; `bandOrder` selects which of the outcome's band briefs applies.
   * Null when the rating scope could not be resolved — the generator then falls
   * back to the slot position alone.
   */
  difficulty: z
    .object({
      promptBlock: z.string().min(1),
      bandOrder: z.number().int().min(0),
    })
    .nullable(),
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
export type TopicTaskContract = z.infer<typeof TopicTaskContractSchema>;
export type UnitBuilderContext = z.infer<typeof UnitBuilderContextSchema>;
export type SeedStageOutput = z.infer<typeof SeedStageOutputSchema>;
