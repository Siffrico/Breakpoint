import type {
  OutcomeDefinition,
  SeedRating,
  StartingPointTier,
} from "@acme/validators";

import type { Result } from "../../../lib/result";
import type {
  LearnerUnderstanding,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type {
  CurriculumBlueprint,
  CurriculumPlan,
  IdentityReport,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import type { ArtifactFailureKind } from "./agent-runtime";
import type { ProjectBuildArtifactPreviewInput } from "./project-build-preview";
import { err, ok } from "../../../lib/result";
import { ProjectOverviewOutputSchema } from "../agents/contracts";
import { normalizeLearningTrackName } from "../agents/onboarding-chat-agent";
import { designProjectOverview } from "../agents/project-overview";
import { seedFromStartingPoint } from "../engine/rating";
import { buildOutcomeNodes } from "../outcome-curriculum/plan-nodes";
import {
  OutcomeCompilationError,
  OutcomeContextMissingError,
  OutcomeNotFoundError,
  OutcomePersistenceError,
} from "../outcome-curriculum/workflows/ensure-outcome-curriculum";
import { ArtifactBuildError, isArtifactBuildError } from "./agent-runtime";
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
 * Only artifacts this orchestrator *owns* belong here: both checkpoint their
 * payload, so a resume can re-save an already-generated output for zero tokens.
 *
 * Outcome-curriculum compilation and unit seeding are deliberately absent. They
 * have their own lifecycle in `TrainingNodeBuild` and dedupe on their own
 * durable rows, so a second status row here could only ever disagree with the
 * one that actually gates the work.
 */
export type ProjectBuildArtifactStep = "curriculum" | "overview";

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

export interface CreateProjectInput {
  projectName: string;
  targetIdentity: string;
  summary: string;
  outcomes: OutcomeDefinition[];
  startingPoint: {
    tier: StartingPointTier;
    reason: string;
  };
  understanding: LearnerUnderstanding;
}

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
  /** Create (or return) the durable "generating" plan shell. Returns its id. */
  ensureShell: (input: {
    sessionId: string;
    ownershipToken: string;
    userId: string | null;
    title: string;
    summary: string;
    targetIdentity: string;
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
  ensureOutcomeCurriculum: (input: {
    outcomeNodeId: string;
    targetIdentity: string;
    abortSignal?: AbortSignal;
  }) => Promise<unknown>;
  createOutcomeUnit: (input: {
    outcomeNodeId: string;
    sessionId: string;
    userId: string;
    abortSignal?: AbortSignal;
  }) => Promise<{ id: string } | null>;
}

const isModuleNode = (node: { kind: string }): boolean =>
  node.kind === "outcome";

const isPrewarmNode = (node: { kind: string; status: string }): boolean =>
  node.kind === "outcome" && node.status === "ready";

/**
 * Wall-clock the build may spend inside one request. The route allows 300s, and
 * the onboarding agent has already spent part of it generating the tool call by
 * the time the build starts — this leaves that headroom.
 */
const BUILD_BUDGET_MS = 270_000;

/**
 * What each step is assumed to need. Derived from the run profiles the step's
 * agents use (see `engine/run-profiles.ts`): a step is not *started* unless its
 * reserve still fits in the remaining budget, so the invocation yields on a
 * clean boundary instead of dying mid-generation.
 *
 * These are estimates. Over-reserving costs one extra resume round;
 * under-reserving costs the whole invocation, so they lean high.
 */
const STEP_RESERVE_MS: Record<"unit", number> = {
  unit: 240_000,
};

/**
 * Ceiling on yield/resume rounds for one build. Without it, a step that
 * reliably exceeds its own reserve would resume forever, paying tokens each
 * round; past the cap the build fails with a real, retryable error.
 */
const MAX_RESUME_ROUNDS = 2;

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
    outcomes: input.outcomes.map((outcome) => ({
      title: outcome.title.trim(),
      result: outcome.result.trim(),
    })),
    startingPoint: persistedStartingPoint
      ? {
          tier: persistedStartingPoint.tier,
          reason: persistedStartingPoint.label.trim(),
        }
      : {
          tier: input.startingPoint.tier,
          reason: input.startingPoint.reason.trim(),
        },
  });

const buildIdentityReport = (input: CreateProjectInput): IdentityReport => {
  const qualityStandards = input.understanding.goodMeans.map((quality) =>
    quality.trim(),
  );
  const qualitySignals = qualityStandards
    .slice(0, 3)
    .map((quality) => `Produces work that is ${quality}.`);
  const behaviorSignals = [
    ...qualitySignals,
    `Works toward ${input.understanding.build}.`,
    `Corrects ${input.understanding.currentGap}.`,
  ];
  return {
    targetIdentity: input.targetIdentity.trim(),
    headline: input.summary.trim(),
    motivation: input.understanding.build.trim(),
    currentBaseline: `${input.startingPoint.reason.trim()} ${input.understanding.currentGap.trim()}`,
    hardMoments: [input.understanding.currentGap.trim()],
    constraints: [],
    proofOfProgress: input.outcomes.map((outcome) => outcome.result).join(" "),
    qualityStandards,
    behaviorSignals,
    confidenceFlags: [],
  };
};

const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const failureKindOf = (error: unknown): ArtifactFailureKind => {
  if (isArtifactBuildError(error)) return error.failureKind;
  if (error instanceof OutcomeCompilationError) return error.kind;
  if (error instanceof OutcomePersistenceError) return "save";
  if (
    error instanceof OutcomeNotFoundError ||
    error instanceof OutcomeContextMissingError
  ) {
    return "schema";
  }
  return "provider";
};

/** The last captured partial from an ArtifactBuildError, if any. */
const partialOf = (error: unknown): unknown =>
  isArtifactBuildError(error)
    ? error.partial
    : error instanceof OutcomeCompilationError &&
        isArtifactBuildError(error.cause)
      ? error.cause.partial
      : undefined;

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
  transcript: _transcript,
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
  const persistedStartingPoint = await deps
    .getStartingPoint(sessionId)
    .catch(() => null);
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

  const recordArtifact = (
    step: ProjectBuildArtifactStep,
    status: ProjectBuildArtifactStatus,
    payload: unknown,
    failureKind: ArtifactFailureKind | null,
    attempts?: number,
  ) =>
    deps.saveArtifact({
      sessionId,
      ownershipToken: requireOwnershipToken(),
      step,
      sourceKey,
      payload,
      status,
      failureKind,
      attempts,
    });

  emit();

  const artifacts = await deps.getArtifacts({ sessionId, sourceKey });
  const artifactMap = new Map(artifacts.map((record) => [record.step, record]));
  const curriculumRecord = artifactMap.get("curriculum");
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
  // starting point stamps a Glicko seed onto the plan shell.
  const startingPointTier =
    persistedStartingPoint?.tier ?? input.startingPoint.tier;
  const seedRating = seedFromStartingPoint(startingPointTier);

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

  const report = buildIdentityReport(input);
  const blueprint: CurriculumBlueprint = {
    title: projectName,
    summary: input.summary.trim(),
    targetIdentity: report.targetIdentity,
    overview: null,
    nodes: buildOutcomeNodes({
      outcomes: input.outcomes,
      targetIdentity: report.targetIdentity,
      summary: input.summary.trim(),
    }),
  };

  setStep("curriculum", "active");
  state.modules = moduleTitles(blueprint);
  state.moduleCount = state.modules.length;
  setArtifactDetail({
    step: "curriculum",
    payload: { identityReport: report, outcomes: input.outcomes },
  });
  if (decide(curriculumRecord) !== "skip") {
    const attempts = (curriculumRecord?.attempts ?? 0) + 1;
    try {
      await deps.persistCurriculum({
        sessionId,
        ownershipToken: requireOwnershipToken(),
        userId,
        planId,
        report,
        blueprint,
      });
      await recordArtifact(
        "curriculum",
        "complete",
        { identityReport: report, outcomes: input.outcomes },
        null,
        attempts,
      );
    } catch (error) {
      await recordArtifact(
        "curriculum",
        "failed",
        { identityReport: report, outcomes: input.outcomes },
        "save",
        attempts,
      );
      return fail(
        messageFrom(
          error,
          "I built the curriculum but couldn't save it. Want to try again?",
        ),
      );
    }
  }
  setStep("curriculum", "done");
  emit();

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

      // Compile the first outcome's Skill Map and Practice Contract, then seed
      // its unit. Neither call is checkpointed here: both own a TrainingNodeBuild
      // lifecycle row that already records attempts and short-circuits finished
      // work, so a resume re-enters them and they no-op on their own state.
      // Both belong to one critical-path budget. Sharing this signal prevents a
      // slow compile from leaving a fresh full timeout for the unit seed.
      const unitAbortSignal = stepAbortSignal("unit");
      let firstUnit: { id: string } | null;
      try {
        const outcomeCurriculum = await deps.ensureOutcomeCurriculum({
          outcomeNodeId: firstFrontier.id,
          targetIdentity: launchPlan.targetIdentity,
          abortSignal: unitAbortSignal,
        });
        if (outcomeCurriculum === null) {
          throw new ArtifactBuildError(
            "The first outcome is missing required curriculum data.",
            "schema",
          );
        }
        firstUnit = await deps.createOutcomeUnit({
          outcomeNodeId: firstFrontier.id,
          sessionId,
          userId,
          abortSignal: unitAbortSignal,
        });
      } catch (error) {
        if (unitAbortSignal.aborted) return yieldForResume();
        throw error;
      }
      if (!firstUnit) {
        return fail("I couldn't prepare your first unit. Want to try again?");
      }
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
