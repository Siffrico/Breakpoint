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

export const RetrievalItemSchema = z.object({
  prompt: z.string().min(1),
  intent: z.string().min(1),
  expectedSignals: z.array(z.string().min(1)).min(1),
});

export const UnitScenarioSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  focusAreas: z.array(z.string().min(1)).min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
});

export const UnitContentSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  concept: z.string().min(1),
  workedExample: z.string().min(1),
  retrievalItems: z.array(RetrievalItemSchema).length(3),
  scenario: UnitScenarioSchema,
});

export const RetrievalEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  feedback: z.array(z.string().min(1)).min(1),
});

export const DebriefSchema = z.object({
  score: z.number().int().min(0).max(100),
  readiness: z.enum(["needs_repair", "developing", "ready_for_next_unit"]),
  strengths: z.array(z.string().min(1)).min(1),
  improvements: z.array(z.string().min(1)).min(1),
  failureTags: z.array(z.string().min(1)).min(1),
  targetComparison: z.string().min(1),
  nextStep: z.string().min(1),
});

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
export type RetrievalItem = z.infer<typeof RetrievalItemSchema>;
export type UnitScenario = z.infer<typeof UnitScenarioSchema>;
export type UnitContent = z.infer<typeof UnitContentSchema>;
export type RetrievalEvaluation = z.infer<typeof RetrievalEvaluationSchema>;
export type Debrief = z.infer<typeof DebriefSchema>;
