import { z } from "zod/v4";

export const WORKSPACE_CHAT_MESSAGE_MAX_CHARS = 12_000;
export const WORKSPACE_CHAT_BODY_MAX_BYTES = 64 * 1024;
export const ONBOARDING_CHAT_BODY_MAX_BYTES = 64 * 1024;
export const ONBOARDING_CHAT_MAX_MESSAGES = 32;
export const MISSION_CHAT_BODY_MAX_BYTES = 64 * 1024;
export const MISSION_CHAT_MAX_MESSAGES = 32;
export const MISSION_CHAT_MESSAGE_MAX_CHARS = 12_000;
export const MISSION_CHAT_HISTORY_MAX_CHARS = 32_000;

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
 * What a workspace turn is claiming. `start_unit` opens the mentor's teaching
 * step, and `advance_pass` moves from settled feedback into the next scenario.
 */
export const WorkspaceTurnActionSchema = z.enum([
  "start_unit",
  "submit_answer",
  "advance_pass",
]);

export const WorkspaceChatRequestSchema = z
  .object({
    action: WorkspaceTurnActionSchema.optional(),
    interactionId: z.string().min(1).max(160),
    message: z.string().max(WORKSPACE_CHAT_MESSAGE_MAX_CHARS).optional(),
    messages: z.array(WorkspaceChatMessageSchema).max(100).optional(),
    model: z.string().max(120).optional(),
    sessionId: z.string().uuid(),
    turnId: z.string().min(1).max(96),
  })
  .refine(
    (body) =>
      body.action === "start_unit" ||
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

const MissionChatMessageSchema = z.looseObject({
  id: z.string().min(1).max(128),
  role: z.enum(["user", "assistant"]),
  parts: z
    .array(
      z.looseObject({
        type: z.string().max(64),
        text: z.string().max(MISSION_CHAT_MESSAGE_MAX_CHARS).optional(),
      }),
    )
    .max(100),
});

export const MissionChatRequestSchema = z
  .object({
    unitRunId: z.string().uuid(),
    messages: z
      .array(MissionChatMessageSchema)
      .min(1)
      .max(MISSION_CHAT_MAX_MESSAGES),
    proof: MissionProofSchema.optional(),
    model: z.string().max(120).optional(),
  })
  .superRefine((body, context) => {
    const textLength = body.messages.reduce(
      (messageTotal, message) =>
        messageTotal +
        message.parts.reduce(
          (partTotal, part) => partTotal + (part.text?.length ?? 0),
          0,
        ),
      0,
    );
    if (textLength > MISSION_CHAT_HISTORY_MAX_CHARS) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Mission chat history is too large.",
      });
    }
  });

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
  qualityStandards: z.array(z.string().min(1)),
  behaviorSignals: z.array(z.string().min(1)).min(3),
  confidenceFlags: z.array(z.string().min(1)),
});

export const CurriculumNodeKindSchema = z.enum(["root", "outcome", "unit"]);

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
 * The task-generation contract for one outcome.
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
export const OutcomeDefinitionSchema = z.object({
  title: z.string().min(1).max(80),
  result: z.string().min(1),
});

export const SkillMapItemSchema = z.object({
  kind: z.enum(["concept", "mechanism"]),
  name: z.string().min(1),
  description: z.string().min(1),
});

export const SkillMapSchema = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        items: z.array(SkillMapItemSchema).min(1).max(6),
      }),
    )
    .min(3)
    .max(12),
  expertJudgment: z
    .array(
      z.object({
        rule: z.string().min(1),
        when: z.string().min(1),
      }),
    )
    .min(2)
    .max(8),
  commonMistakes: z
    .array(
      z.object({
        mistake: z.string().min(1),
        whyItHappens: z.string().min(1),
        detectionCue: z.string().min(1),
      }),
    )
    .min(2)
    .max(8),
});

export const PracticeDifficultyBandSchema = z.object({
  band: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  task: z.string().min(1),
  reasoning: z.string().min(1),
  support: z.string().min(1),
  traps: z.array(z.string().min(1)),
});

export const PracticeContractSchema = z.object({
  workflow: z.object({
    name: z.string().min(1),
    steps: z.array(z.string().min(1)).min(3).max(7),
  }),
  responseMode: ScenarioArchetypeSchema,
  taskTypes: z
    .array(
      z.object({
        name: z.string().min(1),
        situation: z.string().min(1),
        learnerDoes: z.string().min(1),
        output: z.string().min(1),
        taskShape: z.string().min(1),
        skills: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(4),
  qualityBar: z.array(z.string().min(1)).min(1).max(6),
  variationAxes: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(2)
    .max(8),
  evaluationCriteria: z
    .array(
      z.object({
        criterion: z.string().min(1),
        skills: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(5),
  difficultyBands: z.array(PracticeDifficultyBandSchema).length(3),
  neverDo: z.array(z.string().min(1)).min(1).max(6),
  maxRatingDeviation: z.number().int().min(30).max(200).optional(),
});

export const OutcomeCompilationOutputSchema = z
  .object({
    skillMap: SkillMapSchema,
    practiceContract: PracticeContractSchema,
  })
  .superRefine((output, ctx) => {
    const skillNames = output.skillMap.skills.map((skill) => skill.name);
    const knownSkills = new Set(skillNames);
    if (knownSkills.size !== skillNames.length) {
      ctx.addIssue({
        code: "custom",
        path: ["skillMap", "skills"],
        message: "Skill Map names must be unique",
      });
    }

    const taskCoverage = new Set<string>();
    output.practiceContract.taskTypes.forEach((task, taskIndex) => {
      task.skills.forEach((skill) => {
        if (knownSkills.has(skill)) taskCoverage.add(skill);
        else {
          ctx.addIssue({
            code: "custom",
            path: ["practiceContract", "taskTypes", taskIndex, "skills"],
            message: `unknown Skill Map entry: ${skill}`,
          });
        }
      });
    });

    const evaluationCoverage = new Set<string>();
    output.practiceContract.evaluationCriteria.forEach(
      (criterion, criterionIndex) => {
        criterion.skills.forEach((skill) => {
          if (knownSkills.has(skill)) evaluationCoverage.add(skill);
          else {
            ctx.addIssue({
              code: "custom",
              path: [
                "practiceContract",
                "evaluationCriteria",
                criterionIndex,
                "skills",
              ],
              message: `unknown Skill Map entry: ${skill}`,
            });
          }
        });
      },
    );

    skillNames.forEach((skill, skillIndex) => {
      if (!taskCoverage.has(skill)) {
        ctx.addIssue({
          code: "custom",
          path: ["skillMap", "skills", skillIndex],
          message: "every skill must be exercised by a task type",
        });
      }
      if (!evaluationCoverage.has(skill)) {
        ctx.addIssue({
          code: "custom",
          path: ["skillMap", "skills", skillIndex],
          message: "every skill must affect an evaluation criterion",
        });
      }
    });

    if (
      output.practiceContract.difficultyBands
        .map((band) => band.band)
        .join(",") !== "0,1,2"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["practiceContract", "difficultyBands"],
        message: "difficulty bands must be ordered 0, 1, 2",
      });
    }
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

export const UnitContextSchema = z
  .object({
    version: z.literal(1),
    performance: z.string().min(1),
    targets: z
      .array(
        z.object({
          id: z.string().min(1),
          skill: z.string().min(1),
          kind: z.enum(["concept", "mechanism"]),
          label: z.string().min(1),
          content: z.string().min(1),
        }),
      )
      .min(1)
      .max(4),
    workflow: PracticeContractSchema.shape.workflow,
    expertise: z.object({
      expertJudgment: SkillMapSchema.shape.expertJudgment,
      commonMistakes: SkillMapSchema.shape.commonMistakes,
    }),
    testing: z.object({
      responseMode: ScenarioArchetypeSchema,
      taskTypes: PracticeContractSchema.shape.taskTypes,
      variationAxes: PracticeContractSchema.shape.variationAxes,
      neverDo: PracticeContractSchema.shape.neverDo,
    }),
    judgment: z.object({
      criteria: z
        .array(
          z.object({
            id: ContractDimensionIdSchema,
            criterion: z.string().min(1),
            skills: z.array(z.string().min(1)).min(1),
          }),
        )
        .min(1)
        .max(5),
      qualityBar: PracticeContractSchema.shape.qualityBar,
    }),
  })
  .superRefine((context, ctx) => {
    const targetIds = context.targets.map((target) => target.id);
    if (new Set(targetIds).size !== targetIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["targets"],
        message: "Target ids must be unique inside a unit.",
      });
    }
    const criterionIds = context.judgment.criteria.map(
      (criterion) => criterion.id,
    );
    if (new Set(criterionIds).size !== criterionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["judgment", "criteria"],
        message: "Judgment criterion ids must be unique inside a unit.",
      });
    }
    const judgedSkills = new Set(
      context.judgment.criteria.flatMap((criterion) => criterion.skills),
    );
    const practicedSkills = new Set(
      context.testing.taskTypes.flatMap((task) => task.skills),
    );
    for (const [index, target] of context.targets.entries()) {
      if (!judgedSkills.has(target.skill)) {
        ctx.addIssue({
          code: "custom",
          path: ["targets", index, "skill"],
          message: "Every target skill must have a judgment criterion.",
        });
      }
      if (!practicedSkills.has(target.skill)) {
        ctx.addIssue({
          code: "custom",
          path: ["targets", index, "skill"],
          message: "Every target skill must appear in a practice task.",
        });
      }
    }
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

/** Feedback waits for Enter before the next independent scenario. */
export const UnitRunModeSchema = z.enum([
  "learning",
  "review",
  "awaiting_next_pass",
  "complete",
]);
export const UnitRunKindSchema = z.enum(["education", "recall"]);

/** The one-based number of the scenario attempt inside a run. */
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

export const ScenarioVerifierSchema = z
  .object({
    type: z.enum(["fixed_answer", "checker", "judge_rubric"]),
    answer: z.string().min(1).nullable(),
    checkerSpec: z.string().min(1).nullable(),
    scratchpad: z
      .string()
      .trim()
      .min(24)
      .max(600)
      .describe(
        "A concise private solution check, 24 to 600 characters. Do not repeat the full prompt or checker instructions.",
      ),
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
  testedCriterionIds: z.array(ContractDimensionIdSchema).min(1).max(5),
  verifier: ScenarioVerifierSchema.optional(),
});

export const UnitReviewChallengeSchema = z.object({
  prompt: z.string().min(24),
  difficultyVector: DifficultyVectorSchema,
  contract: ScenarioEvaluationContractSchema,
});

export const EvaluationDimensionResultSchema = z.object({
  dimensionId: ContractDimensionIdSchema,
  score: z.number().int().min(0).max(100),
  evidence: z.string().min(1),
  missing: z.string().min(1).nullable(),
});

const PreparedUnitScenarioSchema = UnitReviewChallengeSchema.nullable();

export const UnitCursorStepSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("teaching"),
      preparedScenario: PreparedUnitScenarioSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("scenario"),
      attempt: UnitReviewPassSchema,
      challenge: PreparedUnitScenarioSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("feedback"),
      attempt: UnitReviewPassSchema,
      promptRound: z.number().int().min(1).max(3),
      errorCodes: z.array(z.string().min(1)).max(3),
      dimensionResults: z.array(EvaluationDimensionResultSchema).max(5),
      evidencedTargetIds: z.array(z.string().min(1)).max(4),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pass_result"),
      attempt: UnitReviewPassSchema,
      outcome: z.enum(["pass", "fail"]),
      errorCodes: z.array(z.string().min(1)).max(3),
      evidence: z.array(EvaluationDimensionResultSchema).max(5),
      evidencedTargetIds: z.array(z.string().min(1)).max(4),
      preparedScenario: PreparedUnitScenarioSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("complete"),
      attempt: UnitReviewPassSchema,
      outcome: z.enum(["pass", "fail", "retired"]),
      evidence: z.array(EvaluationDimensionResultSchema).max(5),
      evidencedTargetIds: z.array(z.string().min(1)).max(4),
    })
    .strict(),
]);

/** The one durable authority for which learner interaction may happen next. */
export const UnitCursorSchema = z
  .object({
    interactionId: z.string().min(1).max(160),
    scenarioPrompts: z.array(z.string().min(24)),
    step: UnitCursorStepSchema,
  })
  .strict();

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
  unitContext: UnitContextSchema.nullable(),
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
export type OutcomeDefinition = z.infer<typeof OutcomeDefinitionSchema>;
export type SkillMap = z.infer<typeof SkillMapSchema>;
export type PracticeContract = z.infer<typeof PracticeContractSchema>;
export type OutcomeCompilationOutput = z.infer<
  typeof OutcomeCompilationOutputSchema
>;
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
export type UnitCursor = z.infer<typeof UnitCursorSchema>;
export type UnitCursorStep = z.infer<typeof UnitCursorStepSchema>;
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
export type UnitContext = z.infer<typeof UnitContextSchema>;
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
