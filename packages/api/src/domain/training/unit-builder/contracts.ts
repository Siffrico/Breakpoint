import { z } from "zod/v4";

import {
  PracticeContractSchema,
  PreSeedUnitContentDraftSchema,
  SkillMapSchema,
} from "@acme/validators";

export const OutcomeTaskContractSchema = z.object({
  outcomeResult: z.string().min(1),
  skillMap: SkillMapSchema,
  practiceContract: PracticeContractSchema,
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
    regime: z.literal("main_outcome").nullable(),
    slotIndex: z.number().int().min(1),
    totalSlots: z.number().int().min(1),
    clusterContext: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
        /** The fixed outcome demand and task-generation constraints. */
        taskContract: OutcomeTaskContractSchema.nullable(),
      })
      .nullable(),
  }),
  /**
   * Deliberately just the identity. Attempt history is not passed here: the
   * transferable part of it already reaches the generator as state — the band
   * brief carries how well this learner performs, and the knowledge context
   * carries which items are proven. Raw history added noise from unrelated
   * skills on top of that, and grew without bound.
   */
  learner: z.object({
    targetIdentity: z.string().min(1),
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
            skill: z.string().min(1),
            kind: z.enum(["concept", "mechanism"]),
            label: z.string().min(1),
            content: z.string().min(1),
          }),
        )
        .min(1)
        .max(4),
    })
    .nullable(),
});

const seedOptionSchema = (label: "A" | "B" | "C" | "D") =>
  z
    .object({
      label: z.literal(label),
      text: z.string().trim().min(1).max(1_000),
    })
    .strict();

export const TeachingCardSchema = z
  .string()
  .trim()
  .min(120)
  .max(2_500)
  .refine(
    (content) =>
      /^\*\*Heuristic\*\*[\s\S]+\*\*Worked example\*\*[\s\S]+\*\*Read\*\*[\s\S]+\*\*Predict\*\*[\s\S]+\*\*Compare\*\*[\s\S]+\*\*Decide\*\*/i.test(
        content,
      ),
    "Teaching must contain the required semantic sections in order.",
  )
  .refine(
    (content) =>
      /own words/i.test(content) &&
      content.trimEnd().endsWith("?") &&
      (content.match(/\?/g)?.length ?? 0) === 1,
    "Teaching must end with exactly one own-words question.",
  );

const SeedStageBaseSchema = PreSeedUnitContentDraftSchema.extend({
  buildContent: TeachingCardSchema,
});

const selectedSeedStageOutputSchema = SeedStageBaseSchema.extend({
  options: z.tuple([
    seedOptionSchema("A"),
    seedOptionSchema("B"),
    seedOptionSchema("C"),
    seedOptionSchema("D"),
  ]),
});

export const seedStageOutputSchema = (selectedResponse: boolean) =>
  selectedResponse ? selectedSeedStageOutputSchema : SeedStageBaseSchema;

export const renderSeedPrompt = (output: {
  readonly seedPrompt: string;
  readonly options?: readonly {
    readonly label: "A" | "B" | "C" | "D";
    readonly text: string;
  }[];
}): string =>
  [
    output.seedPrompt.trim(),
    output.options
      ?.map((option) => `${option.label}) ${option.text.trim()}`)
      .join("\n\n"),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

export type OutcomeTaskContract = z.infer<typeof OutcomeTaskContractSchema>;
export type UnitBuilderContext = z.infer<typeof UnitBuilderContextSchema>;
export type SeedStageOutput = z.infer<typeof SeedStageBaseSchema>;
