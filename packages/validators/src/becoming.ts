import { z } from "zod/v4";

export const OnboardingSlotSchema = z.enum([
  "target_identity",
  "hard_moments",
  "current_baseline",
  "constraints",
  "proof_of_progress",
]);

export const OnboardingPhaseSchema = z.enum([
  "intro",
  "questioning",
  "ready_for_generation",
  "generating",
  "complete",
]);

export const OnboardingQuestionSchema = z.object({
  slot: OnboardingSlotSchema,
  prompt: z.string().min(1),
  helper: z.string().min(1).nullable(),
  sequence: z.number().int().min(0),
});

export const OnboardingTranscriptMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
  sequence: z.number().int().min(0),
  slot: OnboardingSlotSchema.nullable(),
});

export const IdentityReportSchema = z.object({
  targetIdentity: z.string().min(1),
  headline: z.string().min(1),
  motivation: z.string().min(1),
  currentBaseline: z.string().min(1),
  hardMoments: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)),
  proofOfProgress: z.string().min(1),
  behaviorSignals: z.array(z.string().min(1)).min(3),
  confidenceFlags: z.array(z.string().min(1)),
});

export const CurriculumNodeKindSchema = z.enum([
  "root",
  "skill_cluster",
  "unit",
  "integration",
  "simulation",
]);

export const CurriculumNodeStatusSchema = z.enum([
  "planned",
  "ready",
  "completed",
]);

export const CurriculumNodeSchema = z.object({
  id: z.string().min(1),
  parentNodeId: z.string().min(1).nullable(),
  kind: CurriculumNodeKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  orderIndex: z.number().int().min(0),
  depth: z.number().int().min(0),
  positionColumn: z.number().int().min(0),
  positionRow: z.number().int().min(0),
  status: CurriculumNodeStatusSchema,
});

export const CurriculumPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  nodes: z.array(CurriculumNodeSchema).min(1),
  nextUnitId: z.string().min(1).nullable(),
});

export const PracticePromptSchema = z.object({
  prompt: z.string().min(1),
  type: z.enum(["identification", "construction", "debugging"]),
});

export const TeachbackSetupSchema = z.object({
  studentPersona: z.string().min(1),
  openingMisconception: z.string().min(1),
});

export const ForgeUnitScenarioSchema = z.object({
  title: z.string().min(1),
  focusAreas: z.array(z.string().min(1)).min(1),
});

export const ForgeUnitContentSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  seedPrompt: z.string().min(1),
  buildContent: z.string().min(1).nullable(),
  practicePrompts: z.array(PracticePromptSchema).length(3).nullable(),
  teachbackSetup: TeachbackSetupSchema,
  scenario: ForgeUnitScenarioSchema,
});

export const PreSeedUnitContentDraftSchema = ForgeUnitContentSchema.pick({
  title: true,
  seedPrompt: true,
  teachbackSetup: true,
  scenario: true,
});

export const PostSeedUnitContentDraftSchema = ForgeUnitContentSchema.pick({
  buildContent: true,
  practicePrompts: true,
}).extend({
  buildContent: z.string().min(200),
  practicePrompts: z.array(PracticePromptSchema).length(3),
});

export const SeedResponseSchema = z.object({
  response: z.string().min(20),
});

export const PracticeSubmissionSchema = z.object({
  nodeId: z.string().min(1),
  sequence: z.number().int().min(0),
  response: z.string().min(30),
});

export const PracticeEvaluationSchema = z.object({
  passed: z.boolean(),
  feedback: z.string().min(1),
});

export const TeachbackSubmissionSchema = z.object({
  nodeId: z.string().min(1),
  round: z.number().int().min(1).max(3),
  response: z.string().min(50),
});

export const TeachbackRoundResultSchema = z.object({
  studentReply: z.string().nullable(),
  passed: z.boolean(),
  round: z.number().int(),
  score: z.number().int().min(0).max(100).nullable(),
  feedback: z.string().nullable(),
});

export const FailureGapSchema = z.object({
  description: z.string().min(1),
  gapType: z.string().min(1),
  whereItBroke: z.string().min(1),
});

export const GhostScenarioSchema = z.object({
  domain: z.string().min(1),
  prompt: z.string().min(1),
  targetDepth: z.number().int().min(1),
});

export const FailureIsolationResultSchema = z.object({
  gap: FailureGapSchema,
  ghostScenario: GhostScenarioSchema,
});

export const GhostSubmissionSchema = z.object({
  nodeId: z.string().min(1),
  response: z.string().min(50),
});

export const GhostEvaluationSchema = z.object({
  passed: z.boolean(),
  feedback: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const TeachbackMessageSchema = z.object({
  role: z.enum(["student", "user"]),
  content: z.string().min(1),
  round: z.number().int().min(1),
});

export const CapstoneFormatSchema = z.enum(["build", "debate", "teach"]);

export const CapstoneStatusSchema = z.enum([
  "pending",
  "in_progress",
  "passed",
  "failed",
]);

export const BuildCapstoneScenarioSchema = z.object({
  format: z.literal("build"),
  title: z.string().min(1),
  artifactType: z.string().min(1),
  briefing: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(2),
  evaluationCriteria: z.array(z.string().min(1)).min(3),
});

export const DebateCapstoneScenarioSchema = z.object({
  format: z.literal("debate"),
  title: z.string().min(1),
  resolution: z.string().min(1),
  context: z.string().min(1),
  aiPosition: z.string().min(1),
  openingArgument: z.string().min(1),
});

export const TeachCapstoneScenarioSchema = z.object({
  format: z.literal("teach"),
  title: z.string().min(1),
  audience: z.string().min(1),
  audienceContext: z.string().min(1),
  deliveryGoal: z.string().min(1),
  openingQuestion: z.string().min(1),
});

export const CapstoneScenarioSchema = z.discriminatedUnion("format", [
  BuildCapstoneScenarioSchema,
  DebateCapstoneScenarioSchema,
  TeachCapstoneScenarioSchema,
]);

export const CapstoneMessageRoleSchema = z.enum(["system", "user", "assistant"]);

export const CapstoneMessageSchema = z.object({
  id: z.string().min(1),
  capstoneId: z.string().min(1),
  role: CapstoneMessageRoleSchema,
  content: z.string().min(1),
  sequence: z.number().int().min(0),
  round: z.number().int().min(0),
  createdAt: z.date(),
});

export const CapstoneAttemptSchema = z.object({
  id: z.string().min(1),
  simulationNodeId: z.string().min(1),
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  userId: z.string().nullable(),
  format: CapstoneFormatSchema,
  status: CapstoneStatusSchema,
  scenario: CapstoneScenarioSchema,
  currentRound: z.number().int().min(0),
  maxRounds: z.number().int().min(1),
  score: z.number().int().min(0).max(100).nullable(),
  feedback: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

export const CapstoneStateSchema = z.object({
  capstone: CapstoneAttemptSchema,
  messages: z.array(CapstoneMessageSchema),
});

export const CapstoneSubmissionSchema = z.object({
  nodeId: z.string().min(1),
  response: z.string().min(50).max(5_000),
});

export const CapstoneTurnResultSchema = z.object({
  assistantReply: z.string().nullable(),
  status: CapstoneStatusSchema,
  round: z.number().int().min(1),
  score: z.number().int().min(0).max(100).nullable(),
  feedback: z.string().nullable(),
});

export const CapstoneEvaluationSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1),
});

export const ForgeDebriefSchema = z.object({
  seedResponse: z.string(),
  finalArticulation: z.string(),
  growthDimensions: z.array(z.string().min(1)).min(1),
  score: z.number().int().min(0).max(100),
  readiness: z.enum(["needs_repair", "developing", "ready_for_next_unit"]),
  strengths: z.array(z.string().min(1)).min(1),
  improvements: z.array(z.string().min(1)).min(1),
  failureTags: z.array(z.string().min(1)),
  nextStep: z.string().min(1),
});

export const UnitContentSchema = ForgeUnitContentSchema;
export const DebriefSchema = ForgeDebriefSchema;

export type OnboardingSlot = z.infer<typeof OnboardingSlotSchema>;
export type OnboardingPhase = z.infer<typeof OnboardingPhaseSchema>;
export type OnboardingQuestion = z.infer<typeof OnboardingQuestionSchema>;
export type OnboardingTranscriptMessage = z.infer<
  typeof OnboardingTranscriptMessageSchema
>;
export type IdentityReport = z.infer<typeof IdentityReportSchema>;
export type CurriculumNodeKind = z.infer<typeof CurriculumNodeKindSchema>;
export type CurriculumNodeStatus = z.infer<typeof CurriculumNodeStatusSchema>;
export type CurriculumNode = z.infer<typeof CurriculumNodeSchema>;
export type CurriculumPlan = z.infer<typeof CurriculumPlanSchema>;
export type PracticePrompt = z.infer<typeof PracticePromptSchema>;
export type TeachbackSetup = z.infer<typeof TeachbackSetupSchema>;
export type ForgeUnitScenario = z.infer<typeof ForgeUnitScenarioSchema>;
export type ForgeUnitContent = z.infer<typeof ForgeUnitContentSchema>;
export type PreSeedUnitContentDraft = z.infer<typeof PreSeedUnitContentDraftSchema>;
export type PostSeedUnitContentDraft = z.infer<
  typeof PostSeedUnitContentDraftSchema
>;
export type SeedResponse = z.infer<typeof SeedResponseSchema>;
export type PracticeSubmission = z.infer<typeof PracticeSubmissionSchema>;
export type PracticeEvaluation = z.infer<typeof PracticeEvaluationSchema>;
export type TeachbackSubmission = z.infer<typeof TeachbackSubmissionSchema>;
export type TeachbackRoundResult = z.infer<typeof TeachbackRoundResultSchema>;
export type FailureGap = z.infer<typeof FailureGapSchema>;
export type GhostScenario = z.infer<typeof GhostScenarioSchema>;
export type FailureIsolationResult = z.infer<typeof FailureIsolationResultSchema>;
export type GhostSubmission = z.infer<typeof GhostSubmissionSchema>;
export type GhostEvaluation = z.infer<typeof GhostEvaluationSchema>;
export type TeachbackMessage = z.infer<typeof TeachbackMessageSchema>;
export type CapstoneFormat = z.infer<typeof CapstoneFormatSchema>;
export type CapstoneStatus = z.infer<typeof CapstoneStatusSchema>;
export type BuildCapstoneScenario = z.infer<typeof BuildCapstoneScenarioSchema>;
export type DebateCapstoneScenario = z.infer<
  typeof DebateCapstoneScenarioSchema
>;
export type TeachCapstoneScenario = z.infer<typeof TeachCapstoneScenarioSchema>;
export type CapstoneScenario = z.infer<typeof CapstoneScenarioSchema>;
export type CapstoneMessageRole = z.infer<typeof CapstoneMessageRoleSchema>;
export type CapstoneMessage = z.infer<typeof CapstoneMessageSchema>;
export type CapstoneAttempt = z.infer<typeof CapstoneAttemptSchema>;
export type CapstoneState = z.infer<typeof CapstoneStateSchema>;
export type CapstoneSubmission = z.infer<typeof CapstoneSubmissionSchema>;
export type CapstoneTurnResult = z.infer<typeof CapstoneTurnResultSchema>;
export type CapstoneEvaluation = z.infer<typeof CapstoneEvaluationSchema>;
export type ForgeDebrief = z.infer<typeof ForgeDebriefSchema>;
export type UnitContent = z.infer<typeof UnitContentSchema>;
export type Debrief = z.infer<typeof DebriefSchema>;
