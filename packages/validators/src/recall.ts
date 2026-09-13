import { z } from "zod/v4";

export const RecallTaskStateSchema = z.enum([
  "preparing",
  "ready",
  "retrieving",
  "correcting",
  "complete",
]);

export const RecallCriterionSnapshotSchema = z
  .object({
    id: z.string().min(1).max(96),
    description: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const RecallKnowledgeSnapshotSchema = z
  .object({
    label: z.string().trim().min(1).max(500),
    content: z.string().trim().min(1).max(4_000),
    teachingContext: z.string().trim().min(1).max(12_000),
    criteria: z.array(RecallCriterionSnapshotSchema).min(1).max(8),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const ids = snapshot.criteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: "Recall criterion ids must be unique.",
      });
    }
  });

export const RecallVerifierSchema = z
  .object({
    idealReasoning: z.string().trim().min(1).max(4_000),
    disqualifyingErrors: z.array(z.string().trim().min(1).max(800)).max(8),
  })
  .strict();

export const RecallScenarioSchema = z
  .object({
    challenge: z.string().trim().min(1).max(8_000),
    verifier: RecallVerifierSchema,
  })
  .strict();

export const RecallCriterionEvidenceSchema = z
  .object({
    criterionId: z.string().min(1).max(96),
    passed: z.boolean(),
    evidence: z.string().trim().min(1).max(1_500),
  })
  .strict();

export const RecallRetrievalAssessmentSchema = z
  .object({
    evidence: z.array(RecallCriterionEvidenceSchema).min(1).max(8),
    feedback: z.string().trim().min(1).max(4_000),
    explanation: z.string().trim().min(1).max(4_000).nullable(),
    correctionQuestion: z.string().trim().min(1).max(4_000).nullable(),
  })
  .strict();

export const RecallCorrectionAssessmentSchema = z
  .object({
    evidence: z.array(RecallCriterionEvidenceSchema).min(1).max(8),
    feedback: z.string().trim().min(1).max(4_000),
    nextQuestion: z.string().trim().min(1).max(4_000).nullable(),
  })
  .strict();

export const RecallCorrectionRecordSchema = z
  .object({
    interactionId: z.string().uuid(),
    answer: z.string().min(1).max(20_000),
    feedback: z.string().min(1).max(4_000),
    evidence: z.array(RecallCriterionEvidenceSchema).min(1).max(8),
    passed: z.boolean(),
    question: z.string().min(1).max(4_000),
    answeredAt: z.coerce.date(),
  })
  .strict();

export const RecallRetrievalRecordSchema = z
  .object({
    interactionId: z.string().uuid(),
    answer: z.string().min(1).max(20_000),
    feedback: z.string().min(1).max(4_000),
    explanation: z.string().min(1).max(4_000).nullable(),
    correctionQuestion: z.string().min(1).max(4_000).nullable(),
    evidence: z.array(RecallCriterionEvidenceSchema).min(1).max(8),
    passed: z.boolean(),
    answeredAt: z.coerce.date(),
  })
  .strict();

export const RecallSubmitAnswerInputSchema = z
  .object({
    taskId: z.string().uuid(),
    interactionId: z.string().uuid(),
    requestId: z.string().uuid(),
    answer: z.string().trim().min(1).max(20_000),
  })
  .strict();

export const RecallTaskActionInputSchema = z
  .object({ taskId: z.string().uuid() })
  .strict();

export const RecallTaskPublicSchema = z
  .object({
    id: z.string().uuid(),
    state: RecallTaskStateSchema,
    interactionId: z.string().uuid().nullable(),
    knowledgeLabel: z.string().min(1),
    challenge: z.string().min(1).nullable(),
    currentQuestion: z.string().min(1).nullable(),
    firstRetrieval: RecallRetrievalRecordSchema.nullable(),
    correctionHistory: z.array(RecallCorrectionRecordSchema),
    pausedAt: z.coerce.date().nullable(),
  })
  .strict();

export type RecallTaskState = z.infer<typeof RecallTaskStateSchema>;
export type RecallCriterionSnapshot = z.infer<
  typeof RecallCriterionSnapshotSchema
>;
export type RecallKnowledgeSnapshot = z.infer<
  typeof RecallKnowledgeSnapshotSchema
>;
export type RecallScenario = z.infer<typeof RecallScenarioSchema>;
export type RecallCriterionEvidence = z.infer<
  typeof RecallCriterionEvidenceSchema
>;
export type RecallCorrectionRecord = z.infer<
  typeof RecallCorrectionRecordSchema
>;
export type RecallRetrievalRecord = z.infer<typeof RecallRetrievalRecordSchema>;
export type RecallTaskPublic = z.infer<typeof RecallTaskPublicSchema>;

export interface RecallFirstRetrievalPersistence {
  requestId: string;
  interactionId: string;
  answer: string;
  feedback: string;
  explanation: string | null;
  correctionQuestion: string | null;
  evidence: RecallCriterionEvidence[];
  passed: boolean;
  answeredAt: string;
  strengthBefore: number;
  strengthAfter: number;
}

export const RecallCommittedResponseSchema = z
  .object({
    taskId: z.string().uuid(),
    interactionId: z.string().uuid().nullable(),
    state: z.enum(["retrieving", "correcting", "complete"]),
    feedback: z.string().min(1).max(8_000),
    question: z.string().min(1).max(4_000).nullable(),
    passed: z.boolean(),
    canPause: z.boolean(),
  })
  .strict();

export type RecallCommittedResponse = z.infer<
  typeof RecallCommittedResponseSchema
>;
