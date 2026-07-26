import { z } from "zod/v4";

import type { UnitEvent } from "./unit";
import { ERROR_CLASSIFICATION_CODES } from "../prompts/shared-instructions";

export const PhaseContinuesEvidenceSchema = z
  .object({
    type: z.literal("phase_continues"),
    reason: z.enum(["prompted", "needs_more_work"]),
  })
  .strict();

export const ConnectionGradedEvidenceSchema = z
  .object({
    type: z.literal("connection_graded"),
    connected: z
      .boolean()
      .describe(
        "True only when the learner reconstructed the core connection. The learner-facing reply must clearly agree with this verdict.",
      ),
    reasoning: z
      .string()
      .min(1)
      .describe("Private evidence for the connection verdict."),
  })
  .strict();

export const SolutionGradedEvidenceSchema = z
  .object({
    type: z.literal("solution_graded"),
    score: z.number().min(0).max(100),
    reasoning: z.string().min(1),
    errorCodes: z.array(z.enum(ERROR_CLASSIFICATION_CODES)).max(1),
  })
  .strict();

export const ModelEventEvidenceSchema = z.discriminatedUnion("type", [
  PhaseContinuesEvidenceSchema,
  ConnectionGradedEvidenceSchema,
  SolutionGradedEvidenceSchema,
]);

export type ModelEventEvidence = z.infer<typeof ModelEventEvidenceSchema>;

export const toUnitEvent = (
  evidence: ModelEventEvidence,
  grade: { passAt: number },
): UnitEvent | null => {
  switch (evidence.type) {
    case "phase_continues":
      return evidence;
    case "connection_graded":
      return { type: evidence.type, connected: evidence.connected };
    case "solution_graded": {
      const passed = evidence.score >= grade.passAt;
      if (
        passed
          ? evidence.errorCodes.length !== 0
          : evidence.errorCodes.length !== 1
      ) {
        return null;
      }
      return {
        type: evidence.type,
        passed,
        score: evidence.score,
        errorCodes: evidence.errorCodes,
      };
    }
  }
};
