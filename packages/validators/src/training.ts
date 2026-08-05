import { z } from "zod/v4";

export const WORKSPACE_CHAT_MESSAGE_MAX_CHARS = 12_000;
export const WORKSPACE_CHAT_BODY_MAX_BYTES = 64 * 1024;
export const ONBOARDING_CHAT_BODY_MAX_BYTES = 64 * 1024;
export const ONBOARDING_CHAT_MAX_MESSAGES = 32;

const WorkspaceChatMessageSchema = z.looseObject({
  role: z.enum(["system", "user", "assistant"]),
  parts: z
    .array(
      z.looseObject({
        type: z.string().max(64),
        text: z.string().max(WORKSPACE_CHAT_MESSAGE_MAX_CHARS).optional(),
      }),
    )
    .max(100),
});

/**
 * What a workspace turn is claiming. `advance_pass` is the learner pressing
 * Enter to move from a settled Pass 1 into Pass 2 of the same unit: it carries
 * no answer, so it is the one action that runs without learner text.
 */
export const WorkspaceTurnActionSchema = z.enum([
  "submit_answer",
  "advance_pass",
]);

export const WorkspaceChatRequestSchema = z
  .object({
    action: WorkspaceTurnActionSchema.optional(),
    message: z.string().max(WORKSPACE_CHAT_MESSAGE_MAX_CHARS).optional(),
    messages: z.array(WorkspaceChatMessageSchema).max(100).optional(),
    model: z.string().max(120).optional(),
    sessionId: z.string().uuid(),
    turnId: z.string().min(1).max(96),
  })
  .refine(
    (body) =>
      body.action === "advance_pass" ||
      typeof body.message === "string" ||
      Array.isArray(body.messages),
    { message: "A message is required." },
  );

export const OnboardingChatRequestSchema = z
  .object({
    id: z.string().max(128).optional(),
    model: z.string().max(120).optional(),
    messages: z
      .array(z.unknown())
      .min(1)
      .max(ONBOARDING_CHAT_MAX_MESSAGES)
      .optional(),
    resumeBuild: z.boolean().optional(),
    sessionId: z.string().uuid(),
  })
  .refine((body) => body.resumeBuild === true || Array.isArray(body.messages), {
    message: "A conversation is required.",
  });

export const WorkspaceShellInputSchema = z.object({
  sessionId: z.string().uuid().optional(),
  cookieSessionId: z.string().uuid().optional(),
});

export const MissionStatusSchema = z.enum(["drafting", "active", "completed"]);

export const MissionSpecSchema = z.object({
  title: z.string().min(1).max(160),
  hook: z.string().min(1).max(500),
  estMinutes: z.number().int().min(5).max(60),
  proofKind: z.string().min(1).max(120),
});

export const MissionPlanSchema = z.object({
  why: z.string().min(1).max(600),
  steps: z
    .array(z.object({ text: z.string().min(1).max(400), done: z.boolean() }))
    .min(1)
    .max(3),
  bringBack: z.string().min(1).max(300),
  sources: z.array(z.string().url()).max(4),
});

export const MissionProofSchema = z
  .object({
    text: z.string().max(4_000),
    imageUrls: z.array(z.string().url()).max(3),
  })
  .refine(
    (proof) => proof.text.trim().length > 0 || proof.imageUrls.length > 0,
    {
      message: "Mission proof must include text or an image.",
    },
  );

export const MissionEvaluationCriterionSchema = z.object({
  key: z.enum(["execution", "evidence", "judgment"]),
  score: z.number().int().min(0),
  feedback: z.string().min(1).max(500),
});

export const MissionEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  growthPass: z.boolean(),
  attemptNumber: z.number().int().min(1).max(99),
  summary: z.string().min(1).max(1_000),
  nextStep: z.string().min(1).max(500).nullable(),
  criteria: z.array(MissionEvaluationCriterionSchema).length(3),
});

export const MissionQuestionArgsSchema = z.object({
  question: z.string().min(1).max(240),
  options: z.array(z.string().min(1).max(120)).min(2).max(4),
  allowFreeText: z.boolean().default(true),
});

export const ProposeMissionsArgsSchema = z.object({
  missions: z.array(MissionSpecSchema).length(3),
});

export const FinalizePlanArgsSchema = z.object({
  spec: MissionSpecSchema,
  plan: MissionPlanSchema,
});

export const EditPlanArgsSchema = z.object({
  plan: MissionPlanSchema,
});

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

export const CurriculumNodeKindSchema = z.enum([
  "root",
  "ability",
  "skill",
  "unit",
  // Outcome-curriculum (topic mode) only: one node = one main outcome, with
  // units directly beneath it and no skill layer. See CurriculumModeSchema.
  "outcome",
]);

/**
 * Which curriculum shape a plan was built with. Decided once, before the
 * onboarding interview starts (the two modes use different consultants), and
 * stamped onto the plan at build time.
 *
 *   ability — root → ability → skill → unit. Decomposes a target IDENTITY into
 *     the recurring jobs a practitioner does, teaching each skill's concepts in
 *     foundation units before integrating them.
 *   topic   — root → outcome → unit. Narrows what "mastering this topic" MEANS
 *     until each piece has one main outcome, then practises whole tasks
 *     against that outcome. No skill layer, no foundation units.
 */
export const CurriculumModeSchema = z.enum(["ability", "topic"]);

/**
 * How a topic-mode plan sequences its outcome nodes.
 *
 *   sequential — master one outcome, then the next. Correct whenever a learner
 *     can tell from a task alone which outcome it belongs to, which is the
 *     common case (an SAT grid-in is never mistaken for a reading item).
 *   interleaved — outcomes run concurrently. Correct only when telling them
 *     apart is itself part of the performance, e.g. "is this a data problem or
 *     a model problem?" in diagnosis-shaped topics.
 */
export const OutcomeOrderingSchema = z.enum(["sequential", "interleaved"]);

export const CurriculumNodeStatusSchema = z.enum([
  "planned",
  "ready",
  "completed",
]);

export const DifficultyBandSchema = z.object({
  order: z.number().int().min(0),
  minRating: z.number().int(),
  maxRating: z.number().int(),
  label: z.string().min(1).optional(),
});

/**
 * The closed library of scenario archetypes, keyed by the learner's response
 * mode in the Solve beat. The curriculum designer picks exactly ONE per
 * ability (the response mode that best matches how the target credential or
 * craft is actually exercised); every unit under that ability uses it.
 *
 *   select    — recognition under adversarial distractors (MCQ). SAT/AP-shaped.
 *   transform — produce the path or artifact that crosses state A → state B.
 *   judge     — evaluate given artifact(s): find what breaks, or pick and
 *               justify from the mechanism. Absorbs critique/tradeoff/diagnose.
 */
export const ScenarioArchetypeSchema = z.enum(["select", "transform", "judge"]);

/**
 * The task-generation contract for one outcome node (topic mode only).
 *
 * It answers "what does a well-formed task for this outcome look like?" and is
 * authored once by the curriculum designer, so the scenario generator never
 * re-derives it per task. Deliberately structured rather than a prose blob: a
 * malformed brief fails schema validation at the agent boundary instead of
 * silently degrading every task built from it.
 *
 * Note the division of labour with `StoredSkillMap.workflow`, which must not
 * restate any of this: the workflow is how a good ANSWER is produced (what the
 * grader checks reasoning against); the brief is how a good TASK is built.
 */
export const ScenarioBriefSchema = z.object({
  taskShape: z
    .string()
    .min(1)
    .describe(
      "The physical form every task under this outcome takes, concretely enough to build from — e.g. 'one 25-60 word passage, one blank, four lettered options'.",
    ),
  qualityBar: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe(
      "What makes a generated task good, each checkable against the finished task — e.g. 'exactly one option survives the stated constraint'.",
    ),
  variationAxes: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .describe(
      "The dimensions along which tasks legitimately differ while still demanding the same main outcome.",
    ),
  neverDo: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe(
      "Failure modes the generator must avoid — the ways a task can look right but stop measuring the main outcome.",
    ),
});

export const ScenarioFormatSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["mcq", "frq"]),
    description: z.string().min(1),
    optionCount: z.number().int().min(2).optional(),
  })
  .refine(
    (format) => format.kind !== "mcq" || format.optionCount !== undefined,
    {
      message: "optionCount is required for MCQ formats",
      path: ["optionCount"],
    },
  );

export const DifficultyVectorSchema = z.object({
  formatId: z.string().min(1),
  reasoningPathSteps: z.number().int().min(0),
  withheldGivens: z.number().int().min(0),
  embeddedAlternatives: z.number().int().min(0),
});

/**
 * Canonical Goldilocks rating contract shared by the API engine and the
 * database. This is the ONE definition of a persisted difficulty directive and
 * its unit snapshot — the DB `.$type<>()` columns and the engine's runtime
 * types both derive from here, so a rating-model change can never silently
 * drift between the two layers.
 */

/** How scaffolded a scenario is when presented (4C/ID support axis). */
export const SupportLevelSchema = z.enum(["worked_example", "guided", "none"]);

/**
 * Where a learner is starting from in their target field, elicited once during
 * onboarding. This is the single source of truth shared by the DB column, the
 * elicitation tool schema, the tRPC input, and the client. It maps to a seed
 * rating (see engine/rating/seed.ts) — never surfaced to the learner as a level
 * word; the client always shows the concrete option text they tapped.
 */
export const StartingPointTierSchema = z.enum([
  "fundamentals",
  "skip_basics",
  "advanced",
]);

/**
 * A Glicko seed stamped onto a curriculum plan at build time and read back by
 * the workspace as the initial rating state. Mirrors the persisted shape of
 * JobRatingState minus the never-seeded `lastRatedAt` (a fresh node has no
 * last-rated timestamp, so decay never fires on it).
 */
export const SeedRatingSchema = z.object({
  rating: z.number(),
  ratingDeviation: z.number(),
  volatility: z.number(),
});

/** The decision the Goldilocks ladder emits for the next scenario. */
export const DirectiveIntentSchema = z.enum([
  "repair",
  "probe",
  "back_off",
  "promote",
  "fade_support",
  "challenge",
  "mastered",
]);

/** Where the learner sits inside a job's band ladder. */
export const JobProgressStateSchema = z.object({
  bandOrder: z.number().int().min(0),
  supportLevel: SupportLevelSchema,
});

/** A single difficulty directive, as decided by the engine and persisted. */
export const ScenarioDirectiveSchema = z.object({
  intent: DirectiveIntentSchema,
  bandOrder: z.number().int().min(0),
  supportLevel: SupportLevelSchema,
  targetItemRating: z.number(),
  targetMisconceptionCode: z.string().nullable(),
  reason: z.string(),
  nextProgress: JobProgressStateSchema,
});

/** The calibrated-difficulty snapshot stored on a unit run. */
export const UnitDifficultySnapshotSchema = z.object({
  nodeId: z.string(),
  directive: ScenarioDirectiveSchema,
  promptBlock: z.string(),
  ratingSnapshot: z.string(),
  learnerRating: z.number(),
  format: ScenarioFormatSchema.optional(),
  dialPreset: z
    .object({
      steps: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
      withheldGivens: z.tuple([
        z.number().int().min(0),
        z.number().int().min(0),
      ]),
      alternatives: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    })
    .optional(),
});

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
  difficultyBands: z.array(DifficultyBandSchema).nullable(),
});

export const ProjectOverviewSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(600, "Overview must contain at least 600 non-whitespace characters.")
    .max(12_000, "Overview must stay concise."),
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

export const UnitMasteryContractSchema = z
  .object({
    version: z.literal(1),
    dimensions: z.array(UnitMasteryDimensionSchema).min(1).max(4),
  })
  .superRefine((contract, ctx) => {
    const ids = new Set<string>();
    contract.dimensions.forEach((dimension, index) => {
      if (ids.has(dimension.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["dimensions", index, "id"],
          message: `Duplicate mastery dimension id: ${dimension.id}.`,
        });
      }
      ids.add(dimension.id);
    });
  });

const EducationExperienceInstructionsSchema = z
  .string()
  .trim()
  .min(1)
  .max(12_000);

export const EducationExperienceCustomizationSchema = z.object({
  main: z.object({ instructions: EducationExperienceInstructionsSchema }),
  reviewer: z.object({ instructions: EducationExperienceInstructionsSchema }),
});

export const EducationExperienceSnapshotSchema = z.object({
  id: z.string().min(1).max(96),
  version: z.number().int().positive(),
  main: z.object({ instructions: EducationExperienceInstructionsSchema }),
  reviewer: z.object({ instructions: EducationExperienceInstructionsSchema }),
});

/** Legacy row shape, read-only. Hydrated into a UnitTodo on load. */
export const UnitCapabilityTodoSchema = z.object({
  dimensionId: ContractDimensionIdSchema,
  status: z.enum(["pending", "completed"]),
});

/** A settled pass waits for Enter before its next independent scenario. */
export const UnitRunModeSchema = z.enum([
  "learning",
  "review",
  "awaiting_next_pass",
  "complete",
]);
export const UnitRunKindSchema = z.enum(["education", "recall"]);

/** Independent scenarios are unbounded; only Pass 2 feeds Goldilocks. */
export const UnitReviewPassSchema = z.number().int().positive();

export const WORKSPACE_EDUCATION_STAGE_IDS = [
  "learning",
  "review",
  "awaiting_next_pass",
  "complete",
] as const;

export const WorkspaceEducationStageSchema = z.enum(
  WORKSPACE_EDUCATION_STAGE_IDS,
);

const WorkspaceScenarioRunKindSchema = UnitRunKindSchema;

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

export const ScenarioVerifierSchema = z
  .object({
    type: z.enum(["fixed_answer", "checker", "judge_rubric"]),
    answer: z.string().min(1).nullable(),
    checkerSpec: z.string().min(1).nullable(),
    scratchpad: z.string().trim().min(24).max(600),
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
  runKind: WorkspaceScenarioRunKindSchema,
  scenarioPromptSummary: z.string().min(1),
  testedDimensions: z.array(ScenarioEvaluationDimensionSchema).min(1).max(4),
  learnerVisibleCriteria: z.array(z.string().min(1)).min(1).max(5),
  evaluatorNotes: z.array(z.string().min(1)).max(6),
  verifier: ScenarioVerifierSchema.optional(),
});

export const UnitReviewChallengeSchema = z.object({
  prompt: z.string().min(24),
  difficultyVector: DifficultyVectorSchema,
  contract: ScenarioEvaluationContractSchema,
});

/**
 * A unit run teaches one capability. A pass is one route through it: the
 * teaching moves, then the solve the learner answers, then the complete the
 * reviewer marks. The list is the whole state — a pass is over when its list
 * is done, and the complete's mark decides whether the unit ends or another
 * pass is appended.
 */
export const UnitTodoStatusSchema = z.enum(["pending", "completed"]);
export const UnitTodoResultSchema = z.enum(["pass", "fail"]);

export const UnitTodoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("capability"),
    status: UnitTodoStatusSchema,
    dimensionId: ContractDimensionIdSchema,
  }),
  z.object({
    kind: z.literal("solve"),
    /**
     * `pending` is waiting to be shown, `presented` is on the learner's screen
     * waiting for an answer. A later pass parks at `pending` until Enter.
     */
    status: z.enum(["pending", "presented", "completed"]),
    pass: UnitReviewPassSchema,
    /** Filled ahead of time by pre-generation; presented when this todo heads. */
    challenge: UnitReviewChallengeSchema.nullable(),
  }),
  z.object({
    kind: z.literal("complete"),
    status: UnitTodoStatusSchema,
    pass: UnitReviewPassSchema,
    /**
     * What this mark can do, fixed when the todo is created — the one place the
     * difference between "ends the unit" and "opens another pass" is written
     * down. `never` is an education warm-up, `pass` ends only on a clean mark,
     * `any` is a one-shot checkpoint that closes either way.
     */
    endsOn: z.enum(["never", "pass", "any"]),
    result: UnitTodoResultSchema.nullable(),
  }),
]);

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
  difficultyBands: z.array(DifficultyBandSchema).nullable(),
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
export type CurriculumNodeKind = z.infer<typeof CurriculumNodeKindSchema>;
export type CurriculumMode = z.infer<typeof CurriculumModeSchema>;
export type OutcomeOrdering = z.infer<typeof OutcomeOrderingSchema>;
export type ScenarioBrief = z.infer<typeof ScenarioBriefSchema>;
export type CurriculumNodeStatus = z.infer<typeof CurriculumNodeStatusSchema>;
export type DifficultyBand = z.infer<typeof DifficultyBandSchema>;
export type SupportLevel = z.infer<typeof SupportLevelSchema>;
export type StartingPointTier = z.infer<typeof StartingPointTierSchema>;
export type SeedRating = z.infer<typeof SeedRatingSchema>;
export type DirectiveIntent = z.infer<typeof DirectiveIntentSchema>;
export type JobProgressState = z.infer<typeof JobProgressStateSchema>;
export type ScenarioDirective = z.infer<typeof ScenarioDirectiveSchema>;
export type UnitDifficultySnapshot = z.infer<
  typeof UnitDifficultySnapshotSchema
>;
export type ScenarioFormat = z.infer<typeof ScenarioFormatSchema>;
export type ScenarioArchetype = z.infer<typeof ScenarioArchetypeSchema>;
export type EducationExperienceSnapshot = z.infer<
  typeof EducationExperienceSnapshotSchema
>;
export type EducationExperienceCustomization = z.infer<
  typeof EducationExperienceCustomizationSchema
>;
export type UnitCapabilityTodo = z.infer<typeof UnitCapabilityTodoSchema>;
export type UnitTodo = z.infer<typeof UnitTodoSchema>;
export type UnitTodoResult = z.infer<typeof UnitTodoResultSchema>;
export type UnitSolveTodo = Extract<UnitTodo, { kind: "solve" }>;
export type UnitCompleteTodo = Extract<UnitTodo, { kind: "complete" }>;
export type UnitRunMode = z.infer<typeof UnitRunModeSchema>;
export type UnitRunKind = z.infer<typeof UnitRunKindSchema>;
export type UnitReviewPass = z.infer<typeof UnitReviewPassSchema>;
export type WorkspaceTurnAction = z.infer<typeof WorkspaceTurnActionSchema>;
export type UnitReviewChallenge = z.infer<typeof UnitReviewChallengeSchema>;
export type DifficultyVector = z.infer<typeof DifficultyVectorSchema>;
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
export type SubmitEducationUnitStep = z.infer<
  typeof SubmitEducationUnitStepSchema
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
export type MissionStatus = z.infer<typeof MissionStatusSchema>;
export type MissionSpec = z.infer<typeof MissionSpecSchema>;
export type MissionPlan = z.infer<typeof MissionPlanSchema>;
export type MissionProof = z.infer<typeof MissionProofSchema>;
export type MissionEvaluation = z.infer<typeof MissionEvaluationSchema>;
export type MissionQuestionArgs = z.infer<typeof MissionQuestionArgsSchema>;
export type ProposeMissionsArgs = z.infer<typeof ProposeMissionsArgsSchema>;
export type FinalizePlanArgs = z.infer<typeof FinalizePlanArgsSchema>;
export type EditPlanArgs = z.infer<typeof EditPlanArgsSchema>;
