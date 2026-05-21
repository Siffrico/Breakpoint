import { z } from "zod/v4";

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

export const WorkspaceAiMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
  sequence: z.number().int().min(0),
  slot: z.string().nullable(),
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
  stageComplete: z.boolean(),
  nextStage: WorkspaceAiEducationStageSchema,
  unitComplete: z.boolean(),
  score: z.number().int().min(0).max(100).nullable(),
  strengths: z.array(z.string().min(1)).max(4),
  improvements: z.array(z.string().min(1)).max(4),
});

export const WorkspaceAiRecallOutputSchema = z.object({
  assistantMessage: z.string().min(1),
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
export type WorkspaceAiMessage = z.infer<typeof WorkspaceAiMessageSchema>;
export type WorkspaceAiState = z.infer<typeof WorkspaceAiStateSchema>;
export type WorkspaceAiEducationOutput = z.infer<
  typeof WorkspaceAiEducationOutputSchema
>;
export type WorkspaceAiRecallOutput = z.infer<
  typeof WorkspaceAiRecallOutputSchema
>;
export type WorkspaceAiTurnResult = z.infer<typeof WorkspaceAiTurnResultSchema>;
