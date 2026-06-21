import { z } from "zod/v4";

import {
  EvaluationDimensionResultSchema,
  ScenarioEvaluationContractSchema,
  UnitMasteryContractSchema,
} from "@acme/validators";

export const WorkspaceAiPromptKindSchema = z.enum([
  "onboarding_curriculum",
  "education_unit",
  "recall",
  "evaluate_feedback",
]);

export const WorkspaceAiEducationStageSchema = z.enum([
  "diagnostic_scenario",
  "concept_instruction",
  "guided_application",
  "performance_evaluation",
  "transfer_scenario",
  "completed",
]);

export const WorkspaceAiTurnModeSchema = z.enum(["education_unit", "recall"]);

export const EvaluationModeSchema = z.enum([
  "intuition_sprint",
  "deep_reasoning",
  "standard",
]);

export const EvaluationPlanSchema = z.object({
  mode: EvaluationModeSchema,
  scenarioCount: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  timeLimitSeconds: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(300),
    z.literal(600),
  ]),
  feedbackMode: z.literal("full_after_each"),
  reason: z.string().min(1),
});

export const AttemptTimingSchema = z.object({
  elapsedSeconds: z.number().int(),
  timeLimitSeconds: z.number().int().positive(),
  overrunSeconds: z.number().int().min(0),
  wasOverTime: z.boolean(),
  pausedSeconds: z.number().int().min(0).optional(),
});

export const WorkspaceAiMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
  sequence: z.number().int().min(0),
  slot: z.string().nullable(),
  unitId: z.string().uuid().nullable(),
  metadata: z
    .object({
      difficultyDirectiveReason: z.string().min(1).optional(),
    })
    .nullable()
    .optional(),
});

export const WorkspaceAiStateSchema = z.object({
  mode: WorkspaceAiTurnModeSchema,
  promptKind: WorkspaceAiPromptKindSchema,
  educationStage: WorkspaceAiEducationStageSchema.nullable(),
  activeUnitId: z.string().uuid().nullable(),
  activeUnitTitle: z.string().min(1).nullable(),
  recallUnitId: z.string().uuid().nullable(),
  recallUnitTitle: z.string().min(1).nullable(),
});

export const WorkspaceAiEducationOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  unitMasteryContract: UnitMasteryContractSchema.nullable().optional(),
  scenarioEvaluationContract:
    ScenarioEvaluationContractSchema.nullable().optional(),
  estimatedItemRating: z.number().int().nullable().optional(),
  stageComplete: z.boolean(),
  nextStage: WorkspaceAiEducationStageSchema,
  unitComplete: z.boolean(),
  score: z.number().int().min(0).max(100).nullable(),
  strengths: z.array(z.string().min(1)).max(4),
  improvements: z.array(z.string().min(1)).max(4),
});

export const WorkspaceAiEvaluationOutputSchema =
  WorkspaceAiEducationOutputSchema.extend({
    evaluationPlan: EvaluationPlanSchema,
    routingDecision: z.enum(["pass", "retry", "repair"]),
    evaluationSummary: z.string().min(1),
    evidenceCitations: z.array(z.string().min(1)).min(1).max(6),
    failedDimensions: z.array(z.string().min(1)).max(4),
    dimensionResults: z.array(EvaluationDimensionResultSchema).min(1).max(4),
  });

export const WorkspaceAiRecallOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  estimatedItemRating: z.number().int().nullable().optional(),
  recallComplete: z.boolean(),
  score: z.number().int().min(0).max(100).nullable(),
  strengths: z.array(z.string().min(1)).max(4),
  improvements: z.array(z.string().min(1)).max(4),
});

export const WorkspaceAiTurnResultSchema = z.object({
  state: WorkspaceAiStateSchema,
  messages: z.array(WorkspaceAiMessageSchema),
  assistantMessage: WorkspaceAiMessageSchema,
});

export type WorkspaceAiPromptKind = z.infer<typeof WorkspaceAiPromptKindSchema>;
export type WorkspaceAiEducationStage = z.infer<
  typeof WorkspaceAiEducationStageSchema
>;
export type WorkspaceAiTurnMode = z.infer<typeof WorkspaceAiTurnModeSchema>;
export type EvaluationMode = z.infer<typeof EvaluationModeSchema>;
export type EvaluationPlan = z.infer<typeof EvaluationPlanSchema>;
export type AttemptTiming = z.infer<typeof AttemptTimingSchema>;
export type WorkspaceAiMessage = z.infer<typeof WorkspaceAiMessageSchema>;
export type WorkspaceAiState = z.infer<typeof WorkspaceAiStateSchema>;
export type WorkspaceAiEducationOutput = z.infer<
  typeof WorkspaceAiEducationOutputSchema
>;
export type WorkspaceAiEvaluationOutput = z.infer<
  typeof WorkspaceAiEvaluationOutputSchema
>;
export type WorkspaceAiRecallOutput = z.infer<
  typeof WorkspaceAiRecallOutputSchema
>;
export type WorkspaceAiTurnResult = z.infer<typeof WorkspaceAiTurnResultSchema>;
