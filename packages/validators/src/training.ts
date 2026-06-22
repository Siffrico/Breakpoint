import { z } from "zod/v4";

export const OnboardingSlotSchema = z.enum([
  "target_identity",
  "hard_moments",
  "current_baseline",
  "identity_friction",
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

export const BeforeAfterContrastSchema = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
});

export const BeforeAfterProfileSchema = z.object({
  headline: z.string().min(1),
  beforeSummary: z.string().min(1),
  afterSummary: z.string().min(1),
  contrastPairs: z.array(BeforeAfterContrastSchema).min(3).max(5),
  firstShift: z.string().min(1),
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
  learningGoal: z.string().min(1),
  orderIndex: z.number().int().min(0),
  depth: z.number().int().min(0),
  positionColumn: z.number().int().min(0),
  positionRow: z.number().int().min(0),
  status: CurriculumNodeStatusSchema,
});

export const ProjectOverviewSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  generatedAt: z.string().datetime().nullable(),
});

export const ProjectOverviewSummarySchema = ProjectOverviewSchema.omit({
  body: true,
});

export const CurriculumPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  targetIdentity: z.string().min(1),
  overview: ProjectOverviewSummarySchema.nullable(),
  beforeAfter: BeforeAfterProfileSchema,
  nodes: z.array(CurriculumNodeSchema).min(1),
  nextUnitId: z.string().min(1).nullable(),
});

export const PracticePromptSchema = z.object({
  prompt: z.string().min(1),
  type: z.enum(["identification", "construction", "debugging"]),
});

export const ComplexityBudgetSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const ClusterBriefingMapItemSchema = z.object({
  position: z.number().int().min(1),
  role: z.string().min(1),
});

export const ClusterBriefingSchema = z.object({
  briefingArc: z.string().min(1),
  briefingMap: z.array(ClusterBriefingMapItemSchema).min(1),
});

export const TeachbackRoundSchema = z.object({
  round: z.number().int().min(1).max(3),
  objection: z.string().min(1),
  objective: z.string().min(1),
});

export const TeachbackSetupSchema = z.object({
  studentPersona: z.string().min(1),
  openingMisconception: z.string().min(1),
  roundLadder: z.array(TeachbackRoundSchema).length(3),
  passSignals: z.array(z.string().min(1)).min(2).max(5),
  failureModes: z.array(z.string().min(1)).min(2).max(5),
});

export const ForgeUnitScenarioSchema = z.object({
  title: z.string().min(1),
  focusAreas: z.array(z.string().min(1)).min(1),
});

export const ContractDimensionIdSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const UnitMasteryDimensionSchema = z.object({
  id: ContractDimensionIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  passSignals: z.array(z.string().min(1)).min(1).max(6),
  failSignals: z.array(z.string().min(1)).min(1).max(6),
  surrogateTraps: z.array(z.string().min(1)).min(1).max(6),
});

export const UnitMasteryContractSchema = z.object({
  version: z.literal(1),
  dimensions: z.array(UnitMasteryDimensionSchema).min(1).max(4),
});

export const ScenarioEvaluationDimensionSchema = z.object({
  dimensionId: ContractDimensionIdSchema,
  promptRole: z.string().min(1),
  expectedStrongMoves: z.array(z.string().min(1)).min(1).max(6),
  acceptableVariants: z.array(z.string().min(1)).max(6),
  commonWrongMoves: z.array(z.string().min(1)).min(1).max(6),
  scoreBands: z.object({
    strong: z.string().min(1),
    partial: z.string().min(1),
    weak: z.string().min(1),
  }),
});

export const ScenarioVerifierAuditSchema = z.object({
  answerIntegrity: z.string().min(1),
  wellPosed: z.string().min(1),
  selfContained: z.string().min(1),
  conceptRequired: z.string().min(1),
  shortcutsClosed: z.string().min(1),
  difficulty: z.string().min(1),
  spark: z.string().min(1),
});

export const ScenarioVerifierSchema = z
  .object({
    type: z.enum(["fixed_answer", "checker", "judge_rubric"]),
    answer: z.string().min(1).nullable(),
    checkerSpec: z.string().min(1).nullable(),
    intendedSolution: z.string().min(1),
    shortcutFailures: z.array(z.string().min(1)).min(1).max(8),
    rubricAudit: ScenarioVerifierAuditSchema,
  })
  .superRefine((verifier, ctx) => {
    if (verifier.type === "fixed_answer" && !verifier.answer) {
      ctx.addIssue({
        code: "custom",
        path: ["answer"],
        message: "fixed_answer verifier requires answer.",
      });
    }

    if (verifier.type === "checker" && !verifier.checkerSpec) {
      ctx.addIssue({
        code: "custom",
        path: ["checkerSpec"],
        message: "checker verifier requires checkerSpec.",
      });
    }
  });

export const ScenarioEvaluationContractSchema = z.object({
  version: z.literal(1),
  scenarioStage: z.enum([
    "diagnostic_scenario",
    "guided_application",
    "performance_evaluation",
    "transfer_scenario",
    "recall",
  ]),
  scenarioPromptSummary: z.string().min(1),
  testedDimensions: z.array(ScenarioEvaluationDimensionSchema).min(1).max(4),
  learnerVisibleCriteria: z.array(z.string().min(1)).min(1).max(5),
  evaluatorNotes: z.array(z.string().min(1)).max(6),
  verifier: ScenarioVerifierSchema.optional(),
});

export const EvaluationDimensionResultSchema = z.object({
  dimensionId: ContractDimensionIdSchema,
  score: z.number().int().min(0).max(100),
  evidence: z.string().min(1),
  missing: z.string().min(1).nullable(),
});

export const ForgeUnitContentSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  learningGoal: z.string().min(1),
  seedPrompt: z.string().min(1),
  seedHint: z.string().min(1),
  clusterArcFrame: z.string().min(1).nullable(),
  clusterBriefing: ClusterBriefingSchema.nullable(),
  complexityBudget: ComplexityBudgetSchema,
  buildContent: z.string().min(1).nullable(),
  practicePrompts: z.array(PracticePromptSchema).length(3).nullable(),
  teachbackSetup: TeachbackSetupSchema,
  scenario: ForgeUnitScenarioSchema,
  unitMasteryContract: UnitMasteryContractSchema.nullable(),
});

export const PreSeedUnitContentDraftSchema = ForgeUnitContentSchema.pick({
  title: true,
  seedPrompt: true,
  seedHint: true,
  clusterArcFrame: true,
  complexityBudget: true,
  teachbackSetup: true,
  scenario: true,
}).extend({
  clusterArcFrame: z.string().min(1),
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

export const CapstoneMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
]);

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

export const EducationUnitAttemptModeSchema = z.enum([
  "free_response",
  "multiple_choice",
]);

export const EducationUnitConfidenceSchema = z.enum(["low", "medium", "high"]);

export const EducationUnitActiveStageSchema = z.enum([
  "challenge",
  "mastery_check",
  "transfer_challenge",
  "revision",
  "complete",
]);

export const EducationUnitAssessmentStatusSchema = z.enum([
  "pass",
  "retry_concept",
  "retry_application",
]);

export const EducationUnitOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const EducationUnitPromptCardSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  helper: z.string().nullable(),
  responseMode: EducationUnitAttemptModeSchema,
  options: z.array(EducationUnitOptionSchema).nullable(),
});

export const EducationUnitAttemptSignalsSchema = z.object({
  correctnessBand: z.enum(["strong", "close", "partial", "off_track"]),
  misconceptionDirection: z.string().min(1),
  reasoningStyle: z.string().min(1),
});

export const EducationUnitDiagnosticGapSchema = z.object({
  predictionError: z.string().min(1),
  whatHeldUp: z.string().min(1),
  whatBroke: z.string().min(1),
  attemptSignals: EducationUnitAttemptSignalsSchema,
});

export const EducationUnitConceptCorrectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
});

export const EducationUnitWorkedExampleSchema = z.object({
  label: z.string().min(1),
  content: z.string().min(1),
});

export const EducationUnitResponseRecordSchema = z.object({
  response: z.string().min(1),
  responseMode: EducationUnitAttemptModeSchema,
  confidence: EducationUnitConfidenceSchema,
  latencyMs: z.number().int().min(0).nullable(),
  signals: EducationUnitAttemptSignalsSchema.nullable(),
});

export const EducationUnitImplementationReviewSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1).max(3),
  improvements: z.array(z.string().min(1)).min(1).max(4),
  requiredRevision: z.string().min(1),
});

export const EducationUnitStateSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  learningGoal: z.string().min(1),
  clusterArcFrame: z.string().nullable(),
  clusterBriefing: ClusterBriefingSchema.nullable(),
  activeStage: EducationUnitActiveStageSchema,
  retryCount: z.number().int().min(0),
  challenge: EducationUnitPromptCardSchema,
  initialResponse: EducationUnitResponseRecordSchema.nullable(),
  diagnosticGap: EducationUnitDiagnosticGapSchema.nullable(),
  conceptCorrection: EducationUnitConceptCorrectionSchema.nullable(),
  workedExamples: z.array(EducationUnitWorkedExampleSchema),
  priorKnowledgeBridge: z.string().nullable(),
  masteryCheck: EducationUnitPromptCardSchema.nullable(),
  masteryCheckResponse: EducationUnitResponseRecordSchema.nullable(),
  transferChallenge: EducationUnitPromptCardSchema.nullable(),
  buildResponse: EducationUnitResponseRecordSchema.nullable(),
  implementationReview: EducationUnitImplementationReviewSchema.nullable(),
  revisedBuildResponse: EducationUnitResponseRecordSchema.nullable(),
  assessmentStatus: EducationUnitAssessmentStatusSchema.nullable(),
  assessmentFeedback: z.string().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  nextStep: z.string().nullable(),
});

export const SubmitEducationUnitStepSchema = z.object({
  nodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
  step: z.enum([
    "initial_response",
    "mastery_check",
    "build_response",
    "revision",
  ]),
  response: z.string().min(1).max(5_000),
  responseMode: EducationUnitAttemptModeSchema.default("free_response"),
  confidence: EducationUnitConfidenceSchema.default("medium"),
  latencyMs: z.number().int().min(0).nullable().optional(),
});

export const RecallGateStatusSchema = z.enum([
  "pending",
  "active",
  "passed",
  "repaired",
  "flagged",
]);

export const RecallProbeTypeSchema = z.enum([
  "seed_return",
  "interleave",
  "compression",
]);

export const RecallProbeStatusSchema = z.enum([
  "pending",
  "answered",
  "repair_pending",
  "repaired",
  "failed",
]);

export const UnitRecallStatusSchema = z.enum([
  "retained",
  "decayed",
  "repaired",
]);

export const RecallProbeSchema = z.object({
  id: z.string().min(1),
  gateId: z.string().min(1),
  probeOrder: z.number().int().min(0),
  probeType: RecallProbeTypeSchema,
  sourceUnitNodeIds: z.array(z.string().min(1)).min(1),
  prompt: z.string().min(1),
  seedSnapshot: z.string().nullable(),
  userResponse: z.string().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  passed: z.boolean().nullable(),
  repairPrompt: z.string().nullable(),
  repairResponse: z.string().nullable(),
  repairScore: z.number().int().min(0).max(100).nullable(),
  repairPassed: z.boolean().nullable(),
  status: RecallProbeStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
});

export const RecallGateSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  userId: z.string().nullable(),
  triggerAfterUnitNodeId: z.string().min(1),
  status: RecallGateStatusSchema,
  probes: z.array(RecallProbeSchema),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
});

export const RecallGateSummarySchema = z.object({
  id: z.string().min(1),
  status: RecallGateStatusSchema,
  triggerAfterUnitNodeId: z.string().min(1),
  probeCount: z.number().int().min(0),
  pendingProbeCount: z.number().int().min(0),
});

export const UnitRecallStateSchema = z.object({
  id: z.string().min(1),
  unitNodeId: z.string().min(1),
  planId: z.string().min(1),
  lastRecalledAt: z.date().nullable(),
  lastRecallOrderIndex: z.number().int().min(0).nullable(),
  recallCount: z.number().int().min(0),
  decayCount: z.number().int().min(0),
  lastRecallScore: z.number().int().min(0).max(100).nullable(),
  status: UnitRecallStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});

export const SubmitRecallProbeSchema = z.object({
  gateId: z.string().uuid(),
  probeId: z.string().uuid(),
  mode: z.enum(["probe", "repair"]),
  response: z.string().min(20).max(5_000),
});

export const FinalizeForgeUnitResultSchema = z.discriminatedUnion(
  "nextAction",
  [
    z.object({
      nextAction: z.literal("recall_gate"),
      gate: RecallGateSchema,
    }),
    z.object({
      nextAction: z.literal("unit"),
      nodeId: z.string().min(1),
    }),
    z.object({
      nextAction: z.literal("simulation"),
      nodeId: z.string().min(1),
    }),
    z.object({
      nextAction: z.literal("home"),
    }),
  ],
);

export const UnitContentSchema = ForgeUnitContentSchema;
export const DebriefSchema = ForgeDebriefSchema;

export const BuildContentMoveSchema = z.enum([
  "anchor",
  "disrupt",
  "model",
  "worked_example",
  "misconception",
  "ground",
  "transfer",
]);

export const BuildContentSectionSchema = z.object({
  move: BuildContentMoveSchema,
  content: z.string().min(1),
});

const BUILD_CONTENT_MOVE_ORDER = [
  "anchor",
  "disrupt",
  "model",
  "worked_example",
  "misconception",
  "ground",
  "transfer",
] as const;

const BUILD_CONTENT_MOVE_SET = new Set<string>(BUILD_CONTENT_MOVE_ORDER);

export const parseBuildContentSections = (
  buildContent: string,
): BuildContentSection[] => {
  const trimmed = buildContent.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/);
  const sections: BuildContentSection[] = [];
  let currentMove: BuildContentMove | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentMove) {
      return;
    }

    const content = buffer.join("\n").trim();
    if (content) {
      sections.push({
        move: currentMove,
        content,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const marker = /^\[([a-z_]+)\]$/.exec(line.trim())?.[1];
    if (marker && BUILD_CONTENT_MOVE_SET.has(marker)) {
      flush();
      currentMove = marker as BuildContentMove;
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [
      {
        move: "model",
        content: trimmed,
      },
    ];
  }

  return sections;
};

export const getBuildContentSection = (
  buildContent: string,
  move: BuildContentMove,
): BuildContentSection | null =>
  parseBuildContentSections(buildContent).find(
    (section) => section.move === move,
  ) ?? null;

export type OnboardingSlot = z.infer<typeof OnboardingSlotSchema>;
export type OnboardingPhase = z.infer<typeof OnboardingPhaseSchema>;
export type OnboardingQuestion = z.infer<typeof OnboardingQuestionSchema>;
export type OnboardingTranscriptMessage = z.infer<
  typeof OnboardingTranscriptMessageSchema
>;
export type IdentityReport = z.infer<typeof IdentityReportSchema>;
export type BeforeAfterContrast = z.infer<typeof BeforeAfterContrastSchema>;
export type BeforeAfterProfile = z.infer<typeof BeforeAfterProfileSchema>;
export type CurriculumNodeKind = z.infer<typeof CurriculumNodeKindSchema>;
export type CurriculumNodeStatus = z.infer<typeof CurriculumNodeStatusSchema>;
export type CurriculumNode = z.infer<typeof CurriculumNodeSchema>;
export type ProjectOverview = z.infer<typeof ProjectOverviewSchema>;
export type ProjectOverviewSummary = z.infer<
  typeof ProjectOverviewSummarySchema
>;
export type CurriculumPlan = z.infer<typeof CurriculumPlanSchema>;
export type PracticePrompt = z.infer<typeof PracticePromptSchema>;
export type ComplexityBudget = z.infer<typeof ComplexityBudgetSchema>;
export type ClusterBriefingMapItem = z.infer<
  typeof ClusterBriefingMapItemSchema
>;
export type ClusterBriefing = z.infer<typeof ClusterBriefingSchema>;
export type TeachbackSetup = z.infer<typeof TeachbackSetupSchema>;
export type ForgeUnitScenario = z.infer<typeof ForgeUnitScenarioSchema>;
export type ForgeUnitContent = z.infer<typeof ForgeUnitContentSchema>;
export type BuildContentMove = z.infer<typeof BuildContentMoveSchema>;
export type BuildContentSection = z.infer<typeof BuildContentSectionSchema>;
export type PreSeedUnitContentDraft = z.infer<
  typeof PreSeedUnitContentDraftSchema
>;
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
export type FailureIsolationResult = z.infer<
  typeof FailureIsolationResultSchema
>;
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
export type EducationUnitAttemptMode = z.infer<
  typeof EducationUnitAttemptModeSchema
>;
export type EducationUnitConfidence = z.infer<
  typeof EducationUnitConfidenceSchema
>;
export type EducationUnitActiveStage = z.infer<
  typeof EducationUnitActiveStageSchema
>;
export type EducationUnitAssessmentStatus = z.infer<
  typeof EducationUnitAssessmentStatusSchema
>;
export type EducationUnitPromptCard = z.infer<
  typeof EducationUnitPromptCardSchema
>;
export type EducationUnitAttemptSignals = z.infer<
  typeof EducationUnitAttemptSignalsSchema
>;
export type EducationUnitDiagnosticGap = z.infer<
  typeof EducationUnitDiagnosticGapSchema
>;
export type EducationUnitConceptCorrection = z.infer<
  typeof EducationUnitConceptCorrectionSchema
>;
export type EducationUnitWorkedExample = z.infer<
  typeof EducationUnitWorkedExampleSchema
>;
export type EducationUnitResponseRecord = z.infer<
  typeof EducationUnitResponseRecordSchema
>;
export type EducationUnitImplementationReview = z.infer<
  typeof EducationUnitImplementationReviewSchema
>;
export type EducationUnitState = z.infer<typeof EducationUnitStateSchema>;
export type RecallGateStatus = z.infer<typeof RecallGateStatusSchema>;
export type RecallProbeType = z.infer<typeof RecallProbeTypeSchema>;
export type RecallProbeStatus = z.infer<typeof RecallProbeStatusSchema>;
export type UnitRecallStatus = z.infer<typeof UnitRecallStatusSchema>;
export type RecallProbe = z.infer<typeof RecallProbeSchema>;
export type RecallGate = z.infer<typeof RecallGateSchema>;
export type RecallGateSummary = z.infer<typeof RecallGateSummarySchema>;
export type UnitRecallState = z.infer<typeof UnitRecallStateSchema>;
export type SubmitRecallProbe = z.infer<typeof SubmitRecallProbeSchema>;
export type SubmitEducationUnitStep = z.infer<
  typeof SubmitEducationUnitStepSchema
>;
export type FinalizeForgeUnitResult = z.infer<
  typeof FinalizeForgeUnitResultSchema
>;
export type UnitContent = z.infer<typeof UnitContentSchema>;
export type UnitMasteryContract = z.infer<typeof UnitMasteryContractSchema>;
export type ScenarioEvaluationContract = z.infer<
  typeof ScenarioEvaluationContractSchema
>;
export type EvaluationDimensionResult = z.infer<
  typeof EvaluationDimensionResultSchema
>;
export type Debrief = z.infer<typeof DebriefSchema>;
