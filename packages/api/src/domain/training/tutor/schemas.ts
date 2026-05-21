import { z } from "zod/v4";

export const TutorStageSchema = z.enum([
  "challenge",
  "attempt_diagnosis",
  "concept_correction",
  "mastery_check",
  "transfer_challenge",
  "build_review",
  "revision_evaluation",
  "post_unit_report",
]);

export const CurriculumStageSchema = z.object({
  unitId: z.string().min(1),
  unitTitle: z.string().min(1),
  unitSummary: z.string().min(1),
  learningGoal: z.string().min(1),
  activeStage: z.string().min(1),
  retryCount: z.number().int().min(0),
  unitPosition: z
    .object({
      index: z.number().int().min(1),
      total: z.number().int().min(1),
    })
    .nullable(),
  clusterTitle: z.string().min(1).nullable(),
});

export const UserProfileMemorySchema = z.object({
  targetIdentity: z.string().nullable(),
  currentLearningGoal: z.string().nullable(),
  knownStrengths: z.array(z.string().min(1)),
  recurringFailurePatterns: z.array(z.string().min(1)),
  teachingPreferences: z.array(z.string().min(1)),
  preferredExamples: z.array(z.string().min(1)),
  recentUnitSummaries: z.array(z.string().min(1)),
});

export const TutorContextSchema = z.object({
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  memory: UserProfileMemorySchema,
  stage: TutorStageSchema,
  curriculumStage: CurriculumStageSchema,
});

export const CompletedUnitEvidenceSchema = z.object({
  unitTitle: z.string().min(1),
  learningGoal: z.string().min(1),
  finalScore: z.number().int().min(0).max(100),
  assessmentStatus: z.enum(["pass", "retry_concept", "retry_application"]),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  failureTags: z.array(z.string().min(1)),
  finalArticulation: z.string().nullable(),
  nextStep: z.string().min(1),
});

export const PostUnitReportSchema = z.object({
  profileMemoryPatch: z.object({
    targetIdentity: z.string().nullable(),
    currentLearningGoal: z.string().nullable(),
    knownStrengths: z.array(z.string().min(1)).max(8),
    recurringFailurePatterns: z.array(z.string().min(1)).max(8),
    teachingPreferences: z.array(z.string().min(1)).max(8),
    preferredExamples: z.array(z.string().min(1)).max(8),
  }),
  unitSummaryMemory: z.object({
    unitTitle: z.string().min(1),
    conceptLearned: z.string().min(1),
    evidenceOfGrowth: z.string().min(1),
    remainingGap: z.string().nullable(),
    nextBestStep: z.string().min(1),
  }),
});

export type TutorStage = z.infer<typeof TutorStageSchema>;
export type CurriculumStage = z.infer<typeof CurriculumStageSchema>;
export type UserProfileMemory = z.infer<typeof UserProfileMemorySchema>;
export type TutorContext = z.infer<typeof TutorContextSchema>;
export type CompletedUnitEvidence = z.infer<typeof CompletedUnitEvidenceSchema>;
export type PostUnitReport = z.infer<typeof PostUnitReportSchema>;
