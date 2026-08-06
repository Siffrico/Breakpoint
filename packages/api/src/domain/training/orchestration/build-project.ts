import type {
  CurriculumMode,
  SeedRating,
  StartingPointTier,
} from "@acme/validators";

import type { Result } from "../../../lib/result";
import type {
  CurriculumDesignerOutput,
  LearnerBrief,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { OutcomeCurriculumOutput } from "../outcome-curriculum/contracts";
import type {
  CurriculumBlueprint,
  CurriculumPlan,
  IdentityReport,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import type { ArtifactFailureKind } from "./agent-runtime";
import type { ProjectBuildArtifactPreviewInput } from "./project-build-preview";
import { err, ok } from "../../../lib/result";
import {
  CurriculumDesignerOutputSchema,
  ProjectOverviewOutputSchema,
} from "../agents/contracts";
import { designCurriculum } from "../agents/curriculum-designer";
import { normalizeLearningTrackName } from "../agents/onboarding-chat-agent";
import { designProjectOverview } from "../agents/project-overview";
import { seedFromStartingPoint } from "../engine/rating";
import { OutcomeCurriculumOutputSchema } from "../outcome-curriculum/contracts";
import { designOutcomeCurriculum } from "../outcome-curriculum/outcome-designer";
import { buildOutcomeNodes } from "../outcome-curriculum/plan-nodes";
import { ArtifactBuildError, isArtifactBuildError } from "./agent-runtime";
import { buildCurriculumNodes } from "./curriculum-flow";
import {
  getProjectBuildStepDetail,
  previewProjectBuildArtifact,
} from "./project-build-preview";

/**
 * The project build is presented to the learner as a checklist. Each step is
 * one discrete unit of work — most of them a dedicated AI agent — and every
 * agent receives the *same* onboarding transcript plus its own derived input.
 * The order here is the order the card renders.
 */
export type ProjectBuildStep =
  | "name" // create the durable plan shell + resolve the saved name (instant)
  | "curriculum" // curriculum designer agent — identity report + skeleton + persist
  | "unit" // prepare the first complete workspace unit
  | "overview" // project overview agent — the readable field map (best-effort)
  | "save"; // finalize: flip the plan active + complete the session

export type ProjectBuildStepStatus = "pending" | "active" | "done";

export interface ProjectBuildStepState {
  id: ProjectBuildStep;
  label: string;
  status: ProjectBuildStepStatus;
  detail?: ProjectBuildStepDetail;
}

export interface ProjectBuildStepDetail {
  title: string;
  body: string;
  generated?: boolean;
}

/**
 * `needs_resume` is not a failure: the invocation ran out of request budget
 * before a step that would not have fit, checkpointed everything it had, and
 * released its lease. The client resumes it immediately and the learner sees an
 * uninterrupted build.
 */
export type ProjectBuildPhase =
  | "building"
  | "needs_resume"
  | "complete"
  | "error";

/** A required-but-missing artifact the learner can regenerate after the build. */
export type ProjectBuildGap = "overview";

/**
 * The AI-generated artifacts that get their own registry lifecycle row.
 *
 * `curriculum` and `overview` additionally checkpoint their *payload*, so a
 * resume can re-save an already-generated output for zero tokens. `blueprint`
 * and `unitSeed` record status only: both already dedupe on their own durable
 * rows (a blueprinted outcome has syllabus rows; a prepared unit has content),
 * so a payload copy would buy nothing a re-read does not already give.
 */
export type ProjectBuildArtifactStep =
  | "curriculum"
  | "blueprint"
  | "unitSeed"
  | "overview";

/**
 * The full snapshot streamed to the client on every transition. It is emitted
 * as a single keyed data part (see `PROJECT_BUILD_DATA_ID`) so the client
 * always renders the latest complete state rather than reconstructing deltas.
 */
export interface ProjectBuildState {
  phase: ProjectBuildPhase;
  /** Display name (human-readable), resolved in the `name` step. */
  projectName: string;
  steps: ProjectBuildStepState[];
  /** Skill titles, revealed once the curriculum agent returns. */
  modules: string[];
  moduleCount: number;
  // Populated as soon as the shell exists (before AI runs), so the library and
  // workspace can show a real "building" project immediately.
  sessionId?: string;
  planId?: string;
  firstUnitId?: string | null;
  targetIdentity?: string;
  /** Optional artifacts that failed; build is complete but with these gaps. */
  gaps?: ProjectBuildGap[];
  /**
   * How many times this build has yielded and been resumed. Carried in the
   * streamed state (rather than a separate payload field) so the client's
   * auto-resume and the round cap read the same number the row already holds.
   */
  resumeRounds?: number;
  // Populated only when `phase === "error"`.
  error?: string;
}

const STEP_LABELS: Record<ProjectBuildStep, string> = {
  name: "Naming your project",
  curriculum: "Designing your curriculum",
  unit: "Preparing your first unit",
  overview: "Writing your overview",
  save: "Saving to your library",
};

const STEP_ORDER: ProjectBuildStep[] = [
  "name",
  "curriculum",
  "unit",
  "overview",
  "save",
];

const initialSteps = (): ProjectBuildStepState[] =>
  STEP_ORDER.map((id) => ({
    id,
    label: STEP_LABELS[id],
    status: "pending",
    detail: getProjectBuildStepDetail(id),
  }));

/** Small input the consultant proposes; everything else is derived server-side. */
export interface CreateProjectInput {
  /** The learner brief the consultant distilled from its own interview. These
   *  three are optional here (never in the tool schema) so builds resumed from
   *  checkpoints written before the brief moved into the tool still typecheck
   *  and complete — see `resolveLearnerBrief`. */
  whatToLearn?: string;
  whatToMake?: string;
  interests?: string[];
  /** Core study topic, lowercase — becomes the sidebar/project name. */
  projectName: string;
  /** Who the learner is becoming, used only for the confirmation preview. */
  targetIdentity: string;
  /** One line describing what they'll build, shown on the confirm card. */
  summary: string;
  /** Verb-first whole-performance titles shown on the confirm card and used as
   *  ability-title hints for the curriculum designer. Optional so resumed builds
   *  from older checkpoints (which lack it) still typecheck. Ability mode only. */
  abilities?: string[];
  /** Topic mode's equivalent: the outcome titles the learner approved. */
  outcomes?: string[];
  /** Where the learner is starting from, and why. Seeds the plan's rating.
   *  Optional for the same resume-compatibility reason. */
  startingPoint?: {
    tier: StartingPointTier;
    reason: string;
  };
}

export type ProjectBuildReadiness =
  | { ready: true }
  | { ready: false; reason: string };

type ProjectBuildRunStatus = "building" | "complete" | "error";

/**
 * Per-artifact lifecycle. `generated_pending_save` means the AI output is in
 * the checkpoint payload but persistence failed — the orchestrator re-saves it
 * for zero tokens. `failed` carries a `failureKind` that selects the policy.
 */
export type ProjectBuildArtifactStatus =
  | "pending"
  | "generating"
  | "complete"
  | "generated_pending_save"
  | "failed";

export interface ProjectBuildArtifactRecord {
  step: ProjectBuildArtifactStep;
  status: ProjectBuildArtifactStatus;
  attempts: number;
  failureKind: ArtifactFailureKind | null;
  payload: unknown;
}

/**
 * Backstop for premature tool calls. This intentionally avoids a rigid turn
 * count: a compressed but high-signal consultation can proceed, while short
 * low-information exchanges cannot create a project just because the model
 * called the tool early.
 */
export const getProjectBuildReadiness = (
  transcript: OnboardingTranscriptMessage[],
): ProjectBuildReadiness => {
  const userMessages = transcript
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const assistantMessages = transcript.filter(
    (message) => message.role === "assistant",
  );

  const learnerSignalChars = userMessages.reduce(
    (total, message) => total + message.length,
    0,
  );

  const enoughConsultationShape =
    userMessages.length >= 4 ||
    (userMessages.length >= 3 && learnerSignalChars >= 600) ||
    (userMessages.length >= 2 && learnerSignalChars >= 1200);

  const hasBackAndForth = assistantMessages.length >= 2;

  if (enoughConsultationShape && hasBackAndForth) {
    return { ready: true };
  }

  return {
    ready: false,
    reason:
      "Keep consulting before creating the project. The learner has not given enough concrete signal yet.",
  };
};

/** Injected so persistence stays per-artifact + transactional and the orchestrator stays testable. */
export interface BuildProjectDeps {
  /** Raw plan row for idempotency: tells us status + whether a shell exists. */
  getPlanRow: (sessionId: string) => Promise<{
    id: string;
    status: string;
    profileVersionId: string | null;
  } | null>;
  /** Full read for the final/complete snapshot. */
  getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  hasUnitContent: (nodeId: string) => Promise<boolean>;
  claimRun: (input: {
    sessionId: string;
    sourceKey: string;
    payload: {
      status: ProjectBuildRunStatus;
      input: CreateProjectInput;
      state: ProjectBuildState;
      error?: string;
    };
  }) => Promise<
    | { status: "claimed"; ownershipToken: string }
    | { status: "processing"; state: ProjectBuildState }
  >;
  heartbeatRun: (input: {
    sessionId: string;
    ownershipToken: string;
  }) => Promise<boolean>;
  updateRun: (input: {
    sessionId: string;
    sourceKey: string;
    payload: {
      status: ProjectBuildRunStatus;
      input: CreateProjectInput;
      state: ProjectBuildState;
      error?: string;
    };
    ownershipToken: string;
  }) => Promise<unknown>;
  /** Read the artifact registry for resume decisions. */
  getArtifacts: (input: {
    sessionId: string;
    sourceKey: string;
  }) => Promise<ProjectBuildArtifactRecord[]>;
  /** Upsert one artifact's registry row (status + last-good/partial payload). */
  saveArtifact: (input: {
    sessionId: string;
    ownershipToken: string;
    step: ProjectBuildArtifactStep;
    sourceKey: string;
    payload: unknown;
    status: ProjectBuildArtifactStatus;
    failureKind?: ArtifactFailureKind | null;
    attempts?: number;
  }) => Promise<unknown>;
  /** The learner's persisted starting point (mid-chat tap or [change] override). */
  getStartingPoint: (
    sessionId: string,
  ) => Promise<{ tier: StartingPointTier; label: string } | null>;
  /**
   * Which curriculum shape this session builds. Chosen before the interview
   * (the two modes run different consultants) and read here rather than passed
   * in the tool input, so a resumed build can never disagree with the session
   * about which designer already ran.
   */
  getCurriculumMode: (sessionId: string) => Promise<CurriculumMode>;
  /** Persist onboarding-derived scenario inspiration into learner memory. */
  persistScenarioInspiration: (input: {
    userId: string;
    content: string;
  }) => Promise<void>;
  /** Create (or return) the durable "generating" plan shell. Returns its id. */
  ensureShell: (input: {
    sessionId: string;
    ownershipToken: string;
    userId: string | null;
    title: string;
    summary: string;
    targetIdentity: string;
    curriculumMode: CurriculumMode;
    seedRating: SeedRating | null;
  }) => Promise<{ id: string }>;
  /**
   * One small transaction: upsert the profile version, link it to the plan, and
   * replace the plan's nodes. Throws on failure (a `"save"` failure kind).
   */
  persistCurriculum: (input: {
    sessionId: string;
    ownershipToken: string;
    userId: string | null;
    planId: string;
    report: IdentityReport;
    blueprint: CurriculumBlueprint;
  }) => Promise<void>;
  /** Write the overview onto the plan, independently of node creation. */
  persistOverview: (input: {
    sessionId: string;
    ownershipToken: string;
    overview: { title: string; summary: string; body: string };
  }) => Promise<void>;
  /** Flip the plan active + complete the session. Returns the freshly-read plan. */
  finalize: (input: {
    sessionId: string;
    ownershipToken: string;
    planId: string;
  }) => Promise<CurriculumPlan | null>;
  ensureSkillKnowledge: (input: {
    skillNodeId: string;
    targetIdentity: string;
    abortSignal?: AbortSignal;
  }) => Promise<unknown>;
  createSkillUnit: (input: {
    skillNodeId: string;
    sessionId: string;
    userId: string;
  }) => Promise<{ id: string } | null>;
}

/**
 * A finished curriculum from either mode, tagged so the blueprint builder and
 * the artifact re-parse never have to guess which designer produced it.
 * `mode` is derived from the plan, never from inspecting the payload's shape.
 */
type CurriculumDesign =
  | {
      mode: "ability";
      identityReport: IdentityReport;
      planDraft: CurriculumDesignerOutput["planDraft"];
    }
  | {
      mode: "topic";
      identityReport: IdentityReport;
      planDraft: OutcomeCurriculumOutput["planDraft"];
    };

/** The nodes shown as the project's modules: abilities, or topic-mode outcomes. */
const isModuleNode = (node: { kind: string }): boolean =>
  node.kind === "ability" || node.kind === "outcome";

/**
 * Nodes whose knowledge map (ability mode) or syllabus (topic mode) is
 * generated at build time. Both are gated node-by-node: only unlocked (ready)
 * ones are needed now, and the rest are generated lazily at unlock time. In a
 * sequential topic plan that is exactly one node.
 */
const isPrewarmNode = (node: { kind: string; status: string }): boolean =>
  (node.kind === "skill" || node.kind === "outcome") && node.status === "ready";

/**
 * Wall-clock the build may spend inside one request. The route allows 300s, and
 * the onboarding agent has already spent part of it generating the tool call by
 * the time the build starts — this leaves that headroom.
 */
const BUILD_BUDGET_MS = 240_000;

/**
 * What each step is assumed to need. Derived from the run profiles the step's
 * agents use (see `engine/run-profiles.ts`): a step is not *started* unless its
 * reserve still fits in the remaining budget, so the invocation yields on a
 * clean boundary instead of dying mid-generation.
 *
 * These are estimates. Over-reserving costs one extra resume round;
 * under-reserving costs the whole invocation, so they lean high.
 */
const STEP_RESERVE_MS: Record<"curriculum" | "unit", number> = {
  curriculum: 150_000,
  unit: 160_000,
};

/**
 * Ceiling on yield/resume rounds for one build. Without it, a step that
 * reliably exceeds its own reserve would resume forever, paying tokens each
 * round; past the cap the build fails with a real, retryable error.
 */
const MAX_RESUME_ROUNDS = 4;

const countModules = (plan: CurriculumPlan): number =>
  plan.nodes.filter(isModuleNode).length;

const moduleTitles = (blueprint: CurriculumBlueprint): string[] =>
  blueprint.nodes.filter(isModuleNode).map((node) => node.title);

const getProjectBuildSourceKey = (
  input: CreateProjectInput,
  persistedStartingPoint: { tier: StartingPointTier; label: string } | null,
) =>
  JSON.stringify({
    projectName: normalizeLearningTrackName(input.projectName),
    targetIdentity: input.targetIdentity.trim(),
    summary: input.summary.trim(),
    whatToLearn: input.whatToLearn?.trim() ?? "",
    whatToMake: input.whatToMake?.trim() ?? "",
    interests: (input.interests ?? []).map((interest) => interest.trim()),
    abilities: (input.abilities ?? []).map((ability) => ability.trim()),
    startingPoint: persistedStartingPoint
      ? {
          tier: persistedStartingPoint.tier,
          reason: persistedStartingPoint.label.trim(),
        }
      : input.startingPoint
        ? {
            tier: input.startingPoint.tier,
            reason: input.startingPoint.reason.trim(),
          }
        : null,
  });

/**
 * The brief the consultant emitted, or a degraded one reconstructed from the
 * confirmation fields when resuming a checkpoint written before the brief moved
 * into `createProject`. Reconstruction keeps old builds finishable: the
 * downstream agents also read the full transcript, so a thin brief costs
 * steering precision, never correctness.
 */
const resolveLearnerBrief = (input: CreateProjectInput): LearnerBrief => ({
  whatToLearn: input.whatToLearn?.trim() ?? input.projectName.trim(),
  whatToMake: input.whatToMake?.trim() ?? input.summary.trim(),
  interests: (input.interests ?? [])
    .map((interest) => interest.trim())
    .filter(Boolean),
});

const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const failureKindOf = (error: unknown): ArtifactFailureKind =>
  isArtifactBuildError(error) ? error.failureKind : "provider";

/** The last captured partial from an ArtifactBuildError, if any. */
const partialOf = (error: unknown): unknown =>
  isArtifactBuildError(error) ? error.partial : undefined;

/**
 * The cross-attempt action for an artifact, derived from its registry row.
 * (Within a single attempt, restart/repair/continue are handled by the
 * resilient agent runner; this is the resume-time decision.)
 */
type ArtifactAction = "skip" | "save_only" | "generate";

const decide = (record?: ProjectBuildArtifactRecord): ArtifactAction => {
  if (!record || record.status === "pending") return "generate";
  if (record.status === "complete") return "skip";
  if (record.status === "generated_pending_save") return "save_only";
  return "generate"; // generating (crashed) or failed
};

/**
 * Re-read a checkpointed curriculum artifact for a zero-token re-save.
 *
 * Validated against the schema of the plan's OWN mode, never sniffed from the
 * payload: a resumed build must refuse a payload written by the other
 * designer rather than persist a tree of the wrong shape. A refusal is safe —
 * the caller falls through to a fresh generation.
 */
const parseCachedDesign = (
  mode: CurriculumMode,
  payload: unknown,
):
  | { success: true; data: CurriculumDesign }
  | { success: false; data?: undefined } => {
  const parsed =
    mode === "topic"
      ? OutcomeCurriculumOutputSchema.safeParse(payload)
      : CurriculumDesignerOutputSchema.safeParse(payload);
  if (!parsed.success) return { success: false };
  return mode === "topic"
    ? {
        success: true,
        data: {
          mode,
          ...(parsed.data as OutcomeCurriculumOutput),
        },
      }
    : {
        success: true,
        data: { mode, ...(parsed.data as CurriculumDesignerOutput) },
      };
};

/** Seed a continuation from a mid-stream crash or a truncated failure. */
const seedFor = (record?: ProjectBuildArtifactRecord): unknown =>
  record && (record.status === "generating" || record.failureKind === "partial")
    ? record.payload
    : undefined;

/**
 * Runs the full project build as an ordered checklist, emitting a fresh
 * {@link ProjectBuildState} after every transition via `onProgress`. The plan
 * shell is created up front; each AI artifact is persisted into it the moment it
 * lands, with its own registry lifecycle so a resume continues from the last
 * good artifact instead of regenerating everything.
 *
 * Never throws — all failures resolve to `err(...)` and a final `phase: "error"`
 * snapshot, so the card can show a reason and a retry.
 */
export const buildProjectFromOnboarding = async ({
  sessionId,
  userId,
  transcript,
  input,
  deps,
  onProgress,
  scheduleBackgroundTask,
  resumeRound = 0,
}: {
  sessionId: string;
  userId: string | null;
  transcript: OnboardingTranscriptMessage[];
  input: CreateProjectInput;
  deps: BuildProjectDeps;
  onProgress: (state: ProjectBuildState) => void;
  /**
   * Keeps the best-effort overview alive past the response on serverless hosts
   * (Next.js `after`). Falls back to a detached promise.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
  /** Yield/resume rounds already spent, read from the checkpoint by the caller. */
  resumeRound?: number;
}): Promise<
  Result<{
    sessionId: string;
    planId: string;
    title: string;
    moduleCount: number;
    firstUnitId: string | null;
    targetIdentity: string;
    gaps?: ProjectBuildGap[];
    /** `building` means the build yielded and the client should resume it. */
    status: "building" | "complete";
  }>
> => {
  const startedAt = Date.now();
  const remainingMs = () => BUILD_BUDGET_MS - (Date.now() - startedAt);
  const projectName = normalizeLearningTrackName(input.projectName);
  const brief = resolveLearnerBrief(input);
  const [persistedStartingPoint, curriculumMode] = await Promise.all([
    deps.getStartingPoint(sessionId).catch(() => null),
    // Fail closed to the original mode: a read failure must not silently
    // rebuild a topic plan as an ability plan.
    deps.getCurriculumMode(sessionId).catch(() => "ability" as const),
  ]);
  const sourceKey = getProjectBuildSourceKey(input, persistedStartingPoint);
  const steps = initialSteps();
  const state: ProjectBuildState = {
    phase: "building",
    projectName,
    steps,
    modules: [],
    moduleCount: 0,
    sessionId,
    resumeRounds: resumeRound,
  };

  const snapshotSteps = () =>
    steps.map((step) => ({
      ...step,
      detail: step.detail ? { ...step.detail } : undefined,
    }));

  const setStep = (id: ProjectBuildStep, status: ProjectBuildStepStatus) => {
    const step = steps.find((candidate) => candidate.id === id);
    if (step) step.status = status;
  };
  const emit = () =>
    onProgress({
      ...state,
      steps: snapshotSteps(),
    });
  const setArtifactDetail = (input: ProjectBuildArtifactPreviewInput) => {
    const step = steps.find((candidate) => candidate.id === input.step);
    if (step) step.detail = previewProjectBuildArtifact(input);
    emit();
  };
  const buildRunPayload = (status: ProjectBuildRunStatus, error?: string) => ({
    status,
    input,
    state: { ...state, steps: snapshotSteps() },
    error,
  });
  let ownershipToken: string | null = null;
  const requireOwnershipToken = () => {
    if (!ownershipToken) throw new Error("Project build lease is not claimed.");
    return ownershipToken;
  };
  let stopHeartbeat: () => void = () => undefined;
  const updateRun = (status: ProjectBuildRunStatus, error?: string) =>
    ownershipToken
      ? deps.updateRun({
          sessionId,
          sourceKey,
          payload: buildRunPayload(status, error),
          ownershipToken,
        })
      : Promise.resolve(null);
  const fail = async (message: string): Promise<Result<never>> => {
    stopHeartbeat();
    state.phase = "error";
    state.error = message;
    emit();
    await updateRun("error", message);
    return err(message);
  };

  /**
   * True when `step` should not be started in this invocation. Checked only on
   * step boundaries — everything already generated is checkpointed, so yielding
   * here costs a round-trip and never costs tokens.
   */
  const outOfBudgetFor = (step: keyof typeof STEP_RESERVE_MS): boolean =>
    remainingMs() < STEP_RESERVE_MS[step];

  /**
   * Hard ceiling on a step's model calls. Bounded by whichever runs out first —
   * the step's own reserve or the request budget — so a provider that stalls
   * surfaces as a retryable abort inside the build instead of running the
   * invocation into the route's 300s wall, where nothing gets checkpointed.
   */
  const stepAbortSignal = (step: keyof typeof STEP_RESERVE_MS): AbortSignal =>
    AbortSignal.timeout(
      Math.max(Math.min(STEP_RESERVE_MS[step], remainingMs()), 1_000),
    );

  /**
   * Stop cleanly and hand the rest to the next invocation. `updateRun` writes
   * the checkpoint AND nulls `leaseExpiresAt`, so the resume's `claimRun` finds
   * a reclaimable row instead of bouncing off a live 120s lease.
   */
  const yieldForResume = async (): Promise<
    Result<{
      sessionId: string;
      planId: string;
      title: string;
      moduleCount: number;
      firstUnitId: string | null;
      targetIdentity: string;
      status: "building";
    }>
  > => {
    stopHeartbeat();
    state.phase = "needs_resume";
    state.resumeRounds = resumeRound + 1;
    emit();
    await updateRun("building");
    return ok({
      sessionId,
      planId: state.planId ?? "",
      title: state.projectName,
      moduleCount: state.moduleCount,
      firstUnitId: state.firstUnitId ?? null,
      targetIdentity: state.targetIdentity ?? input.targetIdentity.trim(),
      status: "building" as const,
    });
  };

  // The most recent in-flight "generating" partial write per step. A terminal
  // write (complete / failed / generated_pending_save) awaits this first, so a
  // late mid-stream flush can never commit *after* it and reset the row to
  // "generating" — which a resume would read as unfinished and regenerate from
  // scratch, the exact wasted work the checkpoint exists to prevent.
  const partialTail = new Map<ProjectBuildArtifactStep, Promise<unknown>>();

  // Persist an artifact's registry row (status + last-good/partial payload).
  const recordArtifact = async (
    step: ProjectBuildArtifactStep,
    status: ProjectBuildArtifactStatus,
    payload: unknown,
    failureKind: ArtifactFailureKind | null,
    attempts?: number,
  ) => {
    if (status !== "generating") {
      // Order barrier: let the last partial commit before stamping a terminal
      // status. The chain below never rejects, so this can't break never-throws.
      await (partialTail.get(step) ?? Promise.resolve());
    }
    return deps.saveArtifact({
      sessionId,
      ownershipToken: requireOwnershipToken(),
      step,
      sourceKey,
      payload,
      status,
      failureKind,
      attempts,
    });
  };
  // Throttled, fire-and-forget mid-stream partial sink so a crash mid-generation
  // is resumable (the runner already throttles its callback to ~4s). Writes are
  // chained per step so they commit in dispatch order and stay behind the
  // terminal barrier above.
  const persistPartial =
    (step: ProjectBuildArtifactStep) => (partial: unknown) => {
      const next = (partialTail.get(step) ?? Promise.resolve())
        .then(() =>
          deps.saveArtifact({
            sessionId,
            ownershipToken: requireOwnershipToken(),
            step,
            sourceKey,
            payload: partial,
            status: "generating",
            failureKind: null,
          }),
        )
        .catch(() => undefined);
      partialTail.set(step, next);
    };
  // Accepts either designer's partial: the preview and the checkpoint sink both
  // read defensively, so neither needs to know which mode produced it.
  const curriculumPartialSink = (
    partial:
      | Partial<CurriculumDesignerOutput>
      | Partial<OutcomeCurriculumOutput>,
  ) => {
    setArtifactDetail({ step: "curriculum", payload: partial });
    persistPartial("curriculum")(partial);
  };

  emit();

  const artifacts = await deps.getArtifacts({ sessionId, sourceKey });
  const artifactMap = new Map(artifacts.map((record) => [record.step, record]));
  const curriculumRecord = artifactMap.get("curriculum");
  const blueprintRecord = artifactMap.get("blueprint");
  const unitSeedRecord = artifactMap.get("unitSeed");
  const overviewRecord = artifactMap.get("overview");

  // Idempotency: a fully-built plan (status "active") with no unfinished artifact
  // short-circuits to complete instead of regenerating. A "generating" shell, or
  // an active plan that still has a failed/unsaved artifact (e.g. an overview gap
  // the learner asked to regenerate), falls through so the registry can finish it.
  const hasUnfinishedArtifact = artifacts.some(
    (record) =>
      record.status === "failed" || record.status === "generated_pending_save",
  );
  const planRow = await deps.getPlanRow(sessionId);
  if (planRow?.status === "active" && !hasUnfinishedArtifact) {
    const existingPlan = await deps.getActivePlan(sessionId);
    if (
      existingPlan?.nextUnitId &&
      (await deps.hasUnitContent(existingPlan.nextUnitId))
    ) {
      for (const step of steps) step.status = "done";
      state.phase = "complete";
      state.projectName = existingPlan.title || projectName;
      state.modules = existingPlan.nodes
        .filter(isModuleNode)
        .map((node) => node.title);
      state.moduleCount = countModules(existingPlan);
      state.planId = existingPlan.id;
      state.firstUnitId = existingPlan.nextUnitId;
      state.targetIdentity = existingPlan.targetIdentity;
      emit();
      return ok({
        sessionId,
        planId: existingPlan.id,
        title: existingPlan.title || projectName,
        moduleCount: state.moduleCount,
        firstUnitId: existingPlan.nextUnitId,
        targetIdentity: existingPlan.targetIdentity,
        status: "complete",
      });
    }
  }

  const claim = await deps.claimRun({
    sessionId,
    sourceKey,
    payload: buildRunPayload("building"),
  });
  if (claim.status === "processing") {
    onProgress(claim.state);
    return err("Project build is already running.");
  }
  ownershipToken = claim.ownershipToken;
  const heartbeat = setInterval(() => {
    void deps.heartbeatRun({ sessionId, ownershipToken: claim.ownershipToken });
  }, 15_000);
  stopHeartbeat = () => clearInterval(heartbeat);

  // Claimed first so the failure is durable: a build that keeps yielding without
  // progressing has to stop as a real error the learner can retry, not as
  // another resume the client would fire again.
  if (resumeRound >= MAX_RESUME_ROUNDS) {
    return fail(
      "The build kept running out of time. Retry to pick it up from where it stopped.",
    );
  }

  // Resolve the learner's starting point: the persisted value (mid-chat tap or a
  // [change] override) wins over whatever the createProject tool proposed. A
  // non-null tier stamps a Glicko seed onto the plan shell; null leaves the
  // workspace on its defaults.
  const startingPointTier =
    persistedStartingPoint?.tier ?? input.startingPoint?.tier ?? null;
  const seedRating = startingPointTier
    ? seedFromStartingPoint(startingPointTier)
    : null;

  // 1 — name + shell: create the durable project home before any AI runs.
  setStep("name", "active");
  emit();
  let planId: string;
  try {
    const shell = await deps.ensureShell({
      sessionId,
      ownershipToken: requireOwnershipToken(),
      userId,
      title: projectName,
      summary: input.summary.trim(),
      targetIdentity: input.targetIdentity.trim(),
      curriculumMode,
      seedRating,
    });
    planId = shell.id;
  } catch (error) {
    return fail(
      messageFrom(error, "I couldn't create your project. Want to try again?"),
    );
  }
  state.planId = planId;
  setStep("name", "done");
  emit();

  if (userId) {
    // One memory row per interest so each stays individually recallable when
    // scenario and unit context is assembled later.
    for (const interest of brief.interests) {
      try {
        await deps.persistScenarioInspiration({
          userId,
          content: `Interest: ${interest}`,
        });
      } catch (error) {
        console.error(
          "Scenario inspiration persistence failed; continuing project build",
          { sessionId, error },
        );
      }
    }
  }

  const buildBlueprint = (design: CurriculumDesign): CurriculumBlueprint => {
    const { identityReport } = design;
    const shared = {
      title: projectName,
      summary: design.planDraft.summary,
      targetIdentity: identityReport.targetIdentity,
      overview: null, // persisted separately via persistOverview
    };
    return design.mode === "topic"
      ? {
          ...shared,
          outcomeOrdering: design.planDraft.ordering,
          nodes: buildOutcomeNodes(
            design.planDraft,
            identityReport.targetIdentity,
            identityReport.headline,
          ),
        }
      : {
          ...shared,
          outcomeOrdering: null,
          nodes: buildCurriculumNodes(
            design.planDraft,
            identityReport.targetIdentity,
            identityReport.headline,
          ),
        };
  };

  const persistDesign = async (design: CurriculumDesign) => {
    const blueprint = buildBlueprint(design);
    state.modules = moduleTitles(blueprint);
    state.moduleCount = state.modules.length;
    emit();
    await deps.persistCurriculum({
      sessionId,
      ownershipToken: requireOwnershipToken(),
      userId,
      planId,
      report: design.identityReport,
      blueprint,
    });
  };

  // 3 — curriculum (REQUIRED): design + persist profile/nodes into the shell.
  const runCurriculum = async (): Promise<Result<"done" | "yielded">> => {
    setStep("curriculum", "active");
    emit();
    const action = decide(curriculumRecord);
    const attemptsBase = curriculumRecord?.attempts ?? 0;

    if (action === "skip") {
      setStep("curriculum", "done");
      emit();
      return ok("done");
    }

    if (action === "save_only") {
      const cached = parseCachedDesign(
        curriculumMode,
        curriculumRecord?.payload,
      );
      if (cached.success) {
        try {
          setArtifactDetail({ step: "curriculum", payload: cached.data });
          await persistDesign(cached.data);
          await recordArtifact(
            "curriculum",
            "complete",
            cached.data,
            null,
            attemptsBase,
          );
          setStep("curriculum", "done");
          emit();
          return ok("done");
        } catch (error) {
          await recordArtifact(
            "curriculum",
            "generated_pending_save",
            cached.data,
            "save",
            attemptsBase,
          );
          return err(
            messageFrom(
              error,
              "I built the curriculum but couldn't save it. Want to try again?",
            ),
          );
        }
      }
      // Cached payload is unusable — fall through to a fresh generation.
    }

    // Nothing generated yet, so yielding here is free.
    if (outOfBudgetFor("curriculum")) return ok("yielded");

    const attempts = attemptsBase + 1;
    let design: CurriculumDesign;
    try {
      design =
        curriculumMode === "topic"
          ? {
              mode: "topic",
              ...(await designOutcomeCurriculum({
                topic: projectName,
                transcript,
                proposedOutcomes: input.outcomes,
                options: {
                  onPartial: curriculumPartialSink,
                  seedPartial: seedFor(curriculumRecord) as
                    | Partial<OutcomeCurriculumOutput>
                    | undefined,
                  abortSignal: stepAbortSignal("curriculum"),
                },
              })),
            }
          : {
              mode: "ability",
              ...(await designCurriculum({
                brief,
                transcript,
                abilities: input.abilities,
                options: {
                  onPartial: curriculumPartialSink,
                  seedPartial: seedFor(curriculumRecord) as
                    | Partial<CurriculumDesignerOutput>
                    | undefined,
                  abortSignal: stepAbortSignal("curriculum"),
                },
              })),
            };
      setArtifactDetail({ step: "curriculum", payload: design });
    } catch (error) {
      await recordArtifact(
        "curriculum",
        "failed",
        partialOf(error) ?? curriculumRecord?.payload ?? null,
        failureKindOf(error),
        attempts,
      );
      return err(
        messageFrom(
          error,
          "I couldn't design the curriculum. Want to try again?",
        ),
      );
    }

    try {
      await persistDesign(design);
      await recordArtifact("curriculum", "complete", design, null, attempts);
      setStep("curriculum", "done");
      emit();
      return ok("done");
    } catch (error) {
      // AI succeeded but the write failed — keep the output for a zero-token re-save.
      await recordArtifact(
        "curriculum",
        "generated_pending_save",
        design,
        "save",
        attempts,
      );
      return err(
        messageFrom(
          error,
          "I built the curriculum but couldn't save it. Want to try again?",
        ),
      );
    }
  };

  const curriculumResult = await runCurriculum();

  if (!curriculumResult.success) {
    return fail(curriculumResult.error);
  }
  if (curriculumResult.data === "yielded") {
    return yieldForResume();
  }

  // A project is launch-ready only when its first unit content has committed.
  // Keeping this inside the resumable build makes Start learning a read-only
  // navigation command instead of a hidden multi-model recovery request.
  setStep("unit", "active");
  emit();
  if (!userId) {
    return fail("I couldn't prepare your first unit. Want to try again?");
  }
  let launchPlan: CurriculumPlan | null;
  try {
    launchPlan = await deps.getActivePlan(sessionId);
    if (
      launchPlan?.nextUnitId &&
      (await deps.hasUnitContent(launchPlan.nextUnitId))
    ) {
      state.firstUnitId = launchPlan.nextUnitId;
      setStep("unit", "done");
      emit();
    } else {
      const existingUnit = launchPlan?.nextUnitId
        ? launchPlan.nodes.find((node) => node.id === launchPlan?.nextUnitId)
        : null;
      const firstFrontier = existingUnit?.parentNodeId
        ? launchPlan?.nodes.find(
            (node) => node.id === existingUnit.parentNodeId,
          )
        : launchPlan?.nodes
            .filter(isPrewarmNode)
            .sort((left, right) => left.orderIndex - right.orderIndex)[0];
      if (!launchPlan || !firstFrontier) {
        return fail("The curriculum has no ready starting point.");
      }

      // The curriculum is persisted and the plan shell is durable, so stopping
      // between the two steps loses nothing. Both calls below are AI-backed.
      if (outOfBudgetFor("unit")) return yieldForResume();

      // Blueprint (topic mode) / knowledge map (ability mode). Status-only
      // checkpoint: the call already short-circuits on its own persisted rows,
      // so the registry row exists to record failures and skip a redundant
      // round-trip, not to re-save a payload.
      if (decide(blueprintRecord) === "generate") {
        const blueprintAttempts = (blueprintRecord?.attempts ?? 0) + 1;
        await recordArtifact(
          "blueprint",
          "generating",
          null,
          null,
          blueprintAttempts,
        );
        try {
          await deps.ensureSkillKnowledge({
            skillNodeId: firstFrontier.id,
            targetIdentity: launchPlan.targetIdentity,
            abortSignal: stepAbortSignal("unit"),
          });
        } catch (error) {
          await recordArtifact(
            "blueprint",
            "failed",
            null,
            failureKindOf(error),
            blueprintAttempts,
          );
          throw error;
        }
        await recordArtifact(
          "blueprint",
          "complete",
          null,
          null,
          blueprintAttempts,
        );
      }

      const unitSeedAttempts = (unitSeedRecord?.attempts ?? 0) + 1;
      await recordArtifact(
        "unitSeed",
        "generating",
        null,
        null,
        unitSeedAttempts,
      );
      let firstUnit: { id: string } | null;
      try {
        firstUnit = await deps.createSkillUnit({
          skillNodeId: firstFrontier.id,
          sessionId,
          userId,
        });
      } catch (error) {
        await recordArtifact(
          "unitSeed",
          "failed",
          null,
          failureKindOf(error),
          unitSeedAttempts,
        );
        throw error;
      }
      if (!firstUnit) {
        await recordArtifact(
          "unitSeed",
          "failed",
          null,
          "provider",
          unitSeedAttempts,
        );
        return fail("I couldn't prepare your first unit. Want to try again?");
      }
      await recordArtifact(
        "unitSeed",
        "complete",
        null,
        null,
        unitSeedAttempts,
      );
      state.firstUnitId = firstUnit.id;
    }
  } catch (error) {
    return fail(
      messageFrom(
        error,
        "I couldn't prepare your first unit. Want to try again?",
      ),
    );
  }
  if (steps.find((step) => step.id === "unit")?.status !== "done") {
    setStep("unit", "done");
    emit();
  }

  // 5 — save/finalize: flip the plan active + complete the session.
  setStep("save", "active");
  emit();
  let plan: CurriculumPlan | null;
  try {
    plan = await deps.finalize({
      sessionId,
      ownershipToken: requireOwnershipToken(),
      planId,
    });
  } catch {
    // finalize failed: only trust an *already-active* plan (a prior attempt may
    // have flipped it). getActivePlan returns a profile-linked shell even while
    // its status is still "generating", so gate on the live status — otherwise a
    // failed finalize reports success on a half-built plan that never goes
    // active. On a still-generating shell we fail and let a resume re-run finalize.
    plan = await deps
      .getPlanRow(sessionId)
      .then((row) =>
        row?.status === "active" ? deps.getActivePlan(sessionId) : null,
      )
      .catch(() => null);
  }
  if (!plan) {
    return fail(
      "I built the curriculum but couldn't save it. Want to try again?",
    );
  }
  setStep("save", "done");

  const overviewAction = decide(overviewRecord);
  const overviewAttempts = overviewRecord?.attempts ?? 0;
  const overviewIsReady = overviewAction === "skip";
  if (overviewIsReady) {
    setStep("overview", "done");
  } else {
    setStep("overview", "active");
    await recordArtifact(
      "overview",
      "generating",
      overviewRecord?.payload ?? null,
      null,
      overviewAttempts + 1,
    );
  }
  state.phase = "complete";
  state.projectName = plan.title || projectName;
  state.moduleCount = countModules(plan);
  state.modules = plan.nodes.filter(isModuleNode).map((node) => node.title);
  state.planId = plan.id;
  state.firstUnitId = plan.nextUnitId ?? state.firstUnitId;
  state.targetIdentity = plan.targetIdentity;
  state.gaps = undefined;
  emit();
  await updateRun("complete");
  stopHeartbeat();

  if (!overviewIsReady) {
    const generateOverview = async () => {
      try {
        if (overviewAction === "save_only") {
          const cached = ProjectOverviewOutputSchema.safeParse(
            overviewRecord?.payload,
          );
          if (cached.success) {
            await deps.persistOverview({
              sessionId,
              ownershipToken: requireOwnershipToken(),
              overview: cached.data,
            });
            await recordArtifact(
              "overview",
              "complete",
              cached.data,
              null,
              overviewAttempts,
            );
            setStep("overview", "done");
            await updateRun("complete");
            return;
          }
        }
        const generatedOverview = await designProjectOverview({
          curriculum: plan,
          options: {
            seedPartial: seedFor(overviewRecord) as
              | Partial<ProjectOverviewOutput>
              | undefined,
          },
        });
        const parsedOverview =
          ProjectOverviewOutputSchema.safeParse(generatedOverview);
        if (!parsedOverview.success) {
          throw new ArtifactBuildError(
            "Generated overview did not pass quality validation.",
            "schema",
          );
        }
        const overview = parsedOverview.data;
        await deps.persistOverview({
          sessionId,
          ownershipToken: requireOwnershipToken(),
          overview,
        });
        await recordArtifact(
          "overview",
          "complete",
          overview,
          null,
          overviewAttempts + 1,
        );
        setStep("overview", "done");
      } catch (error) {
        await recordArtifact(
          "overview",
          "failed",
          partialOf(error) ?? overviewRecord?.payload ?? null,
          failureKindOf(error),
          overviewAttempts + 1,
        );
        setStep("overview", "done");
        state.gaps = ["overview"];
        console.error(
          "[build-project] overview failed after curriculum completion",
          {
            sessionId,
            error,
          },
        );
      }
      await updateRun("complete");
    };
    if (scheduleBackgroundTask) scheduleBackgroundTask(generateOverview);
    else void generateOverview();
  }

  // Nodes past the first are NOT prewarmed here. Fanning every remaining node's
  // blueprint + unit out of a request that is already at its budget produced
  // leases that outlived the invocation that held them; they are built lazily
  // instead, on the same node-build lock, when the learner reaches them.

  return ok({
    sessionId,
    planId: plan.id,
    title: plan.title || projectName,
    moduleCount: state.moduleCount,
    firstUnitId: plan.nextUnitId,
    targetIdentity: plan.targetIdentity,
    gaps: undefined,
    status: "complete",
  });
};
