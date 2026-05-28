import { z } from "zod/v4";

import {
  AttemptTimingSchema,
  EvaluationPlanSchema,
  WorkspaceAiEducationStageSchema,
} from "../workspace-ai/types";

export const WorkspaceContextMoveSchema = z.enum([
  "diagnose",
  "teach",
  "guide",
  "evaluate",
  "transfer",
  "recall",
]);

export const WorkspaceContextEnvelopeSchema = z.object({
  learner: z.object({
    targetIdentity: z.string().min(1),
    durableMemory: z.array(z.string().min(1)),
    recurringFailurePatterns: z.array(z.string().min(1)),
    preferences: z.array(z.string().min(1)),
  }),
  curriculum: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    currentUnitIndex: z.number().int().min(1).nullable(),
    totalUnits: z.number().int().min(0),
  }),
  unit: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    learningGoal: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    seedScenario: z.string().min(1),
    focusAreas: z.array(z.string().min(1)),
  }),
  state: z.object({
    mode: z.enum(["education_unit", "recall"]),
    educationStage: WorkspaceAiEducationStageSchema.nullable(),
    retryCount: z.number().int().min(0),
  }),
  evidence: z.object({
    latestLearnerMessage: z.string().min(1),
    recentTranscript: z.array(z.string().min(1)),
    mostRelevantFailure: z.string().min(1).nullable(),
    strongestPriorSuccess: z.string().min(1).nullable(),
    unresolvedPattern: z.string().min(1).nullable(),
  }),
  promptShownToLearner: z
    .object({
      helper: z.string().min(1).nullable(),
      prompt: z.string().min(1),
    })
    .nullable(),
  evaluationPlan: EvaluationPlanSchema.nullable(),
  attemptTiming: AttemptTimingSchema.nullable(),
  outputContract: z.object({
    move: WorkspaceContextMoveSchema,
    maxWords: z.number().int().min(80).max(400),
    mustDo: z.array(z.string().min(1)),
    mustNotDo: z.array(z.string().min(1)),
  }),
});

export type WorkspaceContextMove = z.infer<typeof WorkspaceContextMoveSchema>;
export type WorkspaceContextEnvelope = z.infer<
  typeof WorkspaceContextEnvelopeSchema
>;
