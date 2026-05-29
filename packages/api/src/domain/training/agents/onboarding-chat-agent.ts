import { tool } from "ai";
import { z } from "zod/v4";

import type { CurriculumPlan } from "../types/training.types";
import { PROJECT_FIT_CONSULTANT_SYSTEM } from "../prompts/personas/project-fit-consultant";
import {
  CurriculumDesignerOutputSchema,
  ProjectOverviewOutputSchema,
} from "./contracts";

const ONBOARDING_RUNTIME_NOTES = `Runtime notes for this session:
- The learner has already been shown the opener "What kind of thing would feel worth building even if it took months?" — their first message is the answer. Continue the consultation from step 2 onward; do not re-ask the opener.
- Run the full 9-step consultation. Do not skip steps. Do not collapse multiple questions into one turn.
- When the learner has explicitly chosen one of the 2–4 projects you suggested (step 9), and only then:
  1. Call nameLearningTrack with the core topic only, lowercase — e.g. "computer engineering", "machine learning". Not the project name, not an identity phrase, not a sentence.
  2. After nameLearningTrack returns, call buildCurriculum with the full curriculum payload built around the chosen project.
  3. Do not ask permission. Do not announce the generation. Do not wait for confirmation.
  4. After the tool returns ok:true, write one short closing line. Do not repeat the plan.
  5. If the tool returns ok:false, apologize briefly and ask if they want to retry.
- Until the learner has chosen, keep consulting. Never call buildCurriculum before a project has been explicitly chosen.

Search policy:
- Search before suggesting projects or building curriculum around tools, libraries, papers, field norms, or any factual claim you have not verified.
- Do not guess when a quick search removes uncertainty.`;

export const ONBOARDING_CHAT_SYSTEM = `${PROJECT_FIT_CONSULTANT_SYSTEM}

${ONBOARDING_RUNTIME_NOTES}`;

export const BuildCurriculumInputSchema = CurriculumDesignerOutputSchema.extend(
  {
    overview: ProjectOverviewOutputSchema.nullable()
      .optional()
      .describe(
        "Optional high-level project overview shown on the overview page. Include this when the path benefits from a readable project narrative.",
      ),
  },
);

export type BuildCurriculumInput = z.infer<typeof BuildCurriculumInputSchema>;

export const NameLearningTrackInputSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe(
      'The saved project/sidebar name as the core study topic only, for example "computer engineering" or "machine learning". Do not use an identity phrase, sentence, or long descriptive title.',
    ),
});

export type NameLearningTrackInput = z.infer<
  typeof NameLearningTrackInputSchema
>;

export type BuildCurriculumResult =
  | {
      ok: true;
      planId: string;
      title: string;
      summary: string;
      unitCount: number;
      nextUnitId: string | null;
    }
  | { ok: false; reason: string };

export const normalizeLearningTrackName = (input: string): string => {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "learning-track";
};

export const createNameLearningTrackTool = ({
  nameLearningTrack,
}: {
  nameLearningTrack: (
    input: NameLearningTrackInput,
  ) => Promise<{ ok: true; name: string } | { ok: false; reason: string }>;
}) =>
  tool({
    description:
      "Persist the saved learning track name used as the project name in the sidebar. Call this before buildCurriculum. The topic must be the core subject only, not an identity phrase or descriptive sentence.",
    inputSchema: NameLearningTrackInputSchema,
    execute: async (input): Promise<
      { ok: true; name: string } | { ok: false; reason: string }
    > => nameLearningTrack(input),
  });

export const createBuildCurriculumTool = ({
  buildCurriculum,
}: {
  buildCurriculum: (
    input: BuildCurriculumInput,
  ) => Promise<
    { success: true; plan: CurriculumPlan } | { success: false; error: string }
  >;
}) =>
  tool({
    description:
      "Persist the learner's complete curriculum from the conversation so far. The input must contain the full identity report, before/after profile, and curriculum plan draft that should become the saved curriculum. Call this only after nameLearningTrack has saved the project/sidebar name.",
    inputSchema: BuildCurriculumInputSchema,
    execute: async (input): Promise<BuildCurriculumResult> => {
      const result = await buildCurriculum(input);
      if (!result.success) {
        return { ok: false, reason: result.error };
      }
      const plan = result.plan;
      const unitCount = plan.nodes.filter(
        (node) => node.kind === "unit" || node.kind === "integration",
      ).length;
      return {
        ok: true,
        planId: plan.id,
        title: plan.title || "learning-track",
        summary: plan.summary,
        unitCount,
        nextUnitId: plan.nextUnitId,
      };
    },
  });
