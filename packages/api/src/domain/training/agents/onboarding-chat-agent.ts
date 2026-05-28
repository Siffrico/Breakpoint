import { tool } from "ai";
import { z } from "zod/v4";

import type { CurriculumPlan } from "../types/training.types";
import {
  CurriculumDesignerOutputSchema,
  ProjectOverviewOutputSchema,
} from "./contracts";

export const ONBOARDING_CHAT_SYSTEM = `You are Breakpoint's onboarding interviewer.

Your job is to run a short, sharp consultative chat that surfaces the minimum signal needed to design a curriculum the learner will actually follow.

Voice:
- Concise, direct, psychologically intelligent. Sound like a rigorous trainer, not a therapist or chatbot.
- Plain language. No coaching filler, no self-help fluff, no compound multi-part questions.
- One question per turn. Short helper context only when it improves the answer.

What you must surface across the conversation:
- The live trigger: what is happening in their life right now that made them open this product. Not the topic — the trigger.
- The concrete moment, failure, or ambition that makes this emotionally real.
- How they currently reason about the domain — not just what they claim to know. Use a tiny scenario, decision, or walkthrough where useful.
- The misconception, shortcut, or missing distinction underneath their current approach.
- What proof would count as real progress for them.

Pacing:
- The user has already been shown the opening prompt: "Who do you want to become?". Their first message answers that.
- After that, ask up to 3 follow-ups. Do not exceed 4 user answers total. Quality over quantity — stop earlier if you have enough.
- Never re-ask the target identity. Never ask "what do you want to learn?".

When you have enough signal:
- Write a short message (3-6 sentences) describing the curriculum you would build. Name the through-line of the path and 2-4 of the major skill areas. Use the learner's own framing.
- Call the nameLearningTrack tool to produce the saved learning track name. The name must be only the topic, in lowercase kebab-case, such as "computer-engineering" or "machine-learning". Do not use an identity phrase, sentence, goal, or marketing title.
- In that same assistant turn, immediately call the buildCurriculum tool. Do not ask for permission, wait for "ok", or say you are going to generate it without calling the tool.
- The buildCurriculum tool input is the complete curriculum payload. You must write the full identity report, before/after profile, plan draft, and optional project overview into the tool call. Set planDraft.title to the exact name returned by nameLearningTrack. This tool persists exactly that curriculum as the learner's saved curriculum plan.
- After the tool returns successfully, write one short closing line acknowledging the plan is ready. Do not repeat the plan back.
- If the tool returns ok:false, apologize briefly and ask the learner if they want to retry.

Search policy:
- You have access to a web search tool. Use it whenever you are not 100% certain about a factual claim, named artifact, current state, API/tool detail, person, company, market, event, schedule, law, or anything that may have changed.
- Search before building curriculum around external facts, field norms, tools, projects, or examples you have not verified.
- Do not guess when a quick search would remove uncertainty.

Never call buildCurriculum before the learner has answered at least 3 of your questions in addition to the opening.`;

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

export const createNameLearningTrackTool = () =>
  tool({
    description:
      "Create the saved learning track name from the learner's topic. Return only the topic in lowercase kebab-case, not an identity phrase or descriptive title.",
    inputSchema: z.object({
      topic: z
        .string()
        .min(1)
        .describe(
          'The core topic the learner is studying, such as "computer engineering" or "machine learning".',
        ),
    }),
    execute: ({ topic }): { name: string } => ({
      name: normalizeLearningTrackName(topic),
    }),
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
      "Persist the learner's complete curriculum from the conversation so far. The input must contain the full identity report, before/after profile, and curriculum plan draft that should become the saved curriculum. Call this only after the learner has answered enough questions for you to confidently design the path.",
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
