import { tool } from "ai";
import { z } from "zod/v4";

import type { CurriculumPlan } from "../types/becoming.types";

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
- Then call the buildCurriculum tool. The tool persists the plan and returns a confirmation.
- After the tool returns successfully, write one short closing line acknowledging the plan is ready. Do not repeat the plan back.
- If the tool returns ok:false, apologize briefly and ask the learner if they want to retry.

Never call buildCurriculum before the learner has answered at least 3 of your questions in addition to the opening.`;

const BuildCurriculumInputSchema = z.object({
  reasoning: z
    .string()
    .min(8)
    .describe(
      "One sentence: why you have enough signal now to build the curriculum.",
    ),
});

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

export const createBuildCurriculumTool = ({
  buildCurriculum,
}: {
  buildCurriculum: () => Promise<
    | { success: true; plan: CurriculumPlan }
    | { success: false; error: string }
  >;
}) =>
  tool({
    description:
      "Build the learner's curriculum from the conversation so far. Call this only after the learner has answered enough questions for you to confidently describe the path. Returns the materialized plan id and title on success.",
    inputSchema: BuildCurriculumInputSchema,
    execute: async (): Promise<BuildCurriculumResult> => {
      const result = await buildCurriculum();
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
        title: plan.targetIdentity || "Learning track",
        summary: plan.summary ?? "",
        unitCount,
        nextUnitId: plan.nextUnitId,
      };
    },
  });
