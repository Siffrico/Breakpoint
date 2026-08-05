import { z } from "zod/v4";

import { WorkspaceEducationStageSchema } from "@acme/validators";

import { ScenarioBriefSchema } from "../education-unit/scenario-brief";

export const WorkspaceAiPromptKindSchema = z.enum(["education_unit", "recall"]);
export const WorkspaceAiEducationStageSchema = WorkspaceEducationStageSchema;
export const WorkspaceAiTurnModeSchema = z.literal("education_unit");

export const WorkspaceAiMessageSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
  sequence: z.number().int().min(0),
  slot: z.string().nullable(),
  unitId: z.string().uuid().nullable(),
  turnId: z.string().min(1).max(96).nullable().optional(),
  metadata: z
    .object({
      difficultyDirectiveReason: z.string().min(1).optional(),
      passNumber: z.number().int().positive().optional(),
      hiddenFromTranscript: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});

export const WorkspaceAiStateSchema = z.object({
  mode: WorkspaceAiTurnModeSchema,
  promptKind: WorkspaceAiPromptKindSchema,
  educationStage: WorkspaceAiEducationStageSchema.nullable(),
  workflowId: z.string().nullable().optional(),
  activeUnitId: z.string().uuid().nullable(),
  activeUnitTitle: z.string().min(1).nullable(),
  recallUnitId: z.string().uuid().nullable(),
  recallUnitTitle: z.string().min(1).nullable(),
});

export const WorkspaceAiTurnResultSchema = z.object({
  passNumber: z.number().int().positive(),
  state: WorkspaceAiStateSchema,
  /** The brief for the pass this turn left on the board. */
  scenario: ScenarioBriefSchema.nullable(),
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
export type WorkspaceAiTurnResult = z.infer<typeof WorkspaceAiTurnResultSchema>;
