import { z } from "zod/v4";

import {
  FailureGapSchema,
  GhostEvaluationSchema,
  GhostScenarioSchema,
  PostSeedUnitContentDraftSchema,
  PracticePromptSchema,
  PreSeedUnitContentDraftSchema,
  TeachbackMessageSchema,
} from "@acme/validators";

export const PriorLearningRecordSchema = z.object({
  title: z.string().min(1),
  score: z.number().int().min(0).max(100),
  readiness: z.string().min(1),
  finalArticulation: z.string().nullable(),
  growthDimensions: z.array(z.string().min(1)).nullable(),
  improvements: z.array(z.string().min(1)),
  failureTags: z.array(z.string().min(1)),
  nextStep: z.string().min(1),
});

export const UnitBuilderContextSchema = z.object({
  node: z.object({
    id: z.string().min(1),
    kind: z.enum(["unit", "integration"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    orderIndex: z.number().int().min(0),
  }),
  planContext: z.object({
    slotIndex: z.number().int().min(1),
    totalSlots: z.number().int().min(1),
    clusterContext: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        whyItMatters: z.string().min(1),
      })
      .nullable(),
    integrationContext: z
      .object({
        completedClusterTitles: z.array(z.string().min(1)),
      })
      .nullable(),
  }),
  learner: z.object({
    targetIdentity: z.string().min(1),
    priorLearning: z.array(PriorLearningRecordSchema),
  }),
});

export const SeedStageOutputSchema = PreSeedUnitContentDraftSchema.extend({
  conceptTarget: z.string().min(1),
  misconceptionTarget: z.string().min(1),
  workedExampleBrief: z.string().min(1),
  proofTargets: z.array(z.string().min(1)).min(2).max(5),
});

export const BuildStageInputSchema = UnitBuilderContextSchema.extend({
  seed: SeedStageOutputSchema,
  learnerSeedResponse: z.string().min(20),
});

export const BuildStageOutputSchema = z.object({
  buildContent: PostSeedUnitContentDraftSchema.shape.buildContent,
  workedExample: z.string().min(1),
  coreModel: z.object({
    name: z.string().min(1),
    mechanism: z.string().min(1),
    transferablePrinciple: z.string().min(1),
  }),
});

export const ProveStageInputSchema = BuildStageInputSchema.extend({
  build: BuildStageOutputSchema,
});

export const StageTeachbackSetupSchema = z.object({
  studentPersona: z.string().min(1),
  openingMisconception: z.string().min(1),
  roundLadder: z
    .array(
      z.object({
        round: z.number().int().min(1).max(3),
        objection: z.string().min(1),
        objective: z.string().min(1),
      }),
    )
    .length(3),
  passSignals: z.array(z.string().min(1)).min(2).max(5),
  failureModes: z.array(z.string().min(1)).min(2).max(5),
});

export const ProveStageGenerationSchema = z.object({
  practicePrompts: z.array(PracticePromptSchema).length(3),
  teachbackSetup: StageTeachbackSetupSchema,
  evaluationExpectations: z.array(z.string().min(1)).min(3).max(6),
});

export const PracticeEvidenceSchema = z.object({
  sequence: z.number().int().min(0),
  response: z.string().min(1),
  feedback: z.string().min(1),
  passed: z.boolean(),
});

export const ProveStageReviewSchema = z.object({
  verdict: z.object({
    passed: z.boolean(),
    score: z.number().int().min(0).max(100),
    feedback: z.string().min(1),
  }),
  evidenceAnchors: z.array(z.string().min(1)).min(1),
});

export const RepairTargetSchema = z.object({
  skill: z.string().min(1),
  transferObjective: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(2).max(5),
});

export const RepairStageInputSchema = z.object({
  unit: z.object({
    nodeId: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    scenario: z.object({
      title: z.string().min(1),
      focusAreas: z.array(z.string().min(1)).min(1),
    }),
  }),
  buildContent: z.string().min(200),
  prove: ProveStageGenerationSchema,
  evidence: z.object({
    practiceResponses: z.array(PracticeEvidenceSchema),
    teachbackTranscript: z.array(TeachbackMessageSchema),
    proveReview: ProveStageReviewSchema,
  }),
});

export const RepairStageGenerationSchema = z.object({
  gap: FailureGapSchema,
  repairTarget: RepairTargetSchema,
  ghostScenario: GhostScenarioSchema,
  transferFocus: z.array(z.string().min(1)).min(2).max(4),
});

export const RepairStageEvaluationSchema = GhostEvaluationSchema.extend({
  transferEvidence: z.array(z.string().min(1)).min(1),
});

export type PriorLearningRecord = z.infer<typeof PriorLearningRecordSchema>;
export type UnitBuilderContext = z.infer<typeof UnitBuilderContextSchema>;
export type SeedStageOutput = z.infer<typeof SeedStageOutputSchema>;
export type BuildStageInput = z.infer<typeof BuildStageInputSchema>;
export type BuildStageOutput = z.infer<typeof BuildStageOutputSchema>;
export type ProveStageInput = z.infer<typeof ProveStageInputSchema>;
export type StageTeachbackSetup = z.infer<typeof StageTeachbackSetupSchema>;
export type ProveStageGeneration = z.infer<typeof ProveStageGenerationSchema>;
export type ProveStageReview = z.infer<typeof ProveStageReviewSchema>;
export type PracticeEvidence = z.infer<typeof PracticeEvidenceSchema>;
export type RepairTarget = z.infer<typeof RepairTargetSchema>;
export type RepairStageInput = z.infer<typeof RepairStageInputSchema>;
export type RepairStageGeneration = z.infer<typeof RepairStageGenerationSchema>;
export type RepairStageEvaluation = z.infer<typeof RepairStageEvaluationSchema>;
export type TeachbackTranscript = z.infer<typeof TeachbackMessageSchema>[];
