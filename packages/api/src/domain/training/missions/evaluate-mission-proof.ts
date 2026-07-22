import { Effect } from "effect";
import { z } from "zod/v4";

import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";

import type { MissionEvaluationDraft } from "./mission-evaluation-policy";
import { invokeStructuredModel } from "../engine/invoke-structured-model";
import { requireAiModelForPurpose } from "../engine/model-router";
import { MissionEvaluationError } from "./mission-errors";

const MissionEvaluationDraftSchema = z.object({
  executionScore: z.number().int().min(0).max(40),
  executionFeedback: z.string().min(1).max(500),
  evidenceScore: z.number().int().min(0).max(35),
  evidenceFeedback: z.string().min(1).max(500),
  judgmentScore: z.number().int().min(0).max(25),
  judgmentFeedback: z.string().min(1).max(500),
  summary: z.string().min(1).max(1_000),
  nextStep: z.string().min(1).max(500),
});

const MISSION_EVALUATOR_PROMPT = `You evaluate evidence for one short real-world learning mission.

Hold the learner to the stated mission, but use an attainable apprenticeship standard rather than perfection. Credit credible, specific evidence even when presentation is rough. Do not reward unsupported claims, irrelevant activity, or polished prose without evidence.

Score exactly three dimensions:
- execution, 0–40: the learner substantially performed the mission's required action.
- evidence, 0–35: the proof is concrete and credible enough to support that claim.
- judgment, 0–25: the work reflects the important decisions or understanding the mission was designed to exercise.

Feedback must name observed evidence and the smallest useful improvement. Never invent details from image URLs; treat an image URL as an attached artifact whose unseen contents cannot independently establish a claim.`;

/** This function takes a mission and proof, produces a structured standards evaluation, and fails only when the configured model cannot return valid output. */
export const evaluateMissionProof = ({
  spec,
  plan,
  proof,
}: {
  spec: MissionSpec;
  plan: MissionPlan;
  proof: MissionProof;
}): Effect.Effect<MissionEvaluationDraft, MissionEvaluationError> =>
  Effect.tryPromise({
    try: async () => {
      const model = requireAiModelForPurpose(
        "mission",
        "Mission evaluation is unavailable.",
      );
      const result = invokeStructuredModel({
        model,
        schema: MissionEvaluationDraftSchema,
        schemaName: "mission_evaluation",
        system: MISSION_EVALUATOR_PROMPT,
        prompt: `MISSION\n${JSON.stringify(spec)}\n\nPLAN\n${JSON.stringify(plan)}\n\nPROOF\n${JSON.stringify(proof)}`,
        maxSteps: 1,
      });
      return await result.output;
    },
    catch: (cause) => new MissionEvaluationError({ cause }),
  });
