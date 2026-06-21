import { z } from "zod/v4";

import { ScenarioEvaluationContractSchema } from "@acme/validators";

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
    ratingSnapshot: z.string().min(1).nullable(),
    // Anchored summary of earlier units that have aged out of the verbatim
    // transcript window. Null until the chat spans enough units to compact.
    progressSummary: z.string().min(1).nullable(),
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
  scenarioEvaluationContract: ScenarioEvaluationContractSchema.nullable(),
  difficultyDirective: z
    .object({
      reason: z.string().min(1),
      promptBlock: z.string().min(1),
    })
    .nullable(),
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
