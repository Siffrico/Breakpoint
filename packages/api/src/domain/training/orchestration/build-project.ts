import type { SeedRating, StartingPointTier } from "@acme/validators";

import type { Result } from "../../../lib/result";
import type {
  CurriculumDesignerOutput,
  LearnerBrief,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type {
  BeforeAfterProfile,
  CurriculumBlueprint,
  CurriculumPlan,
  IdentityReport,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import type { ArtifactFailureKind } from "./agent-runtime";
import type { ProjectBuildArtifactPreviewInput } from "./project-build-preview";
import { createTaskLimiter } from "../../../lib/concurrency";
import { err, ok } from "../../../lib/result";
import {
  CurriculumDesignerOutputSchema,
  ProjectOverviewOutputSchema,
} from "../agents/contracts";
import { designCurriculum } from "../agents/curriculum-designer";
import { normalizeLearningTrackName } from "../agents/onboarding-chat-agent";
import { designProjectOverview } from "../agents/project-overview";
import { seedFromStartingPoint } from "../engine/rating";
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

export type ProjectBuildPhase = "building" | "complete" | "error";

/** A required-but-missing artifact the learner can regenerate after the build. */
export type ProjectBuildGap = "overview";

/** The AI-generated artifacts that get their own registry lifecycle row. */
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
  // Populated only when `phase === "error"`.
  error?: string;
}

const STEP_LABELS: Record<ProjectBuildStep, string> = {
  name: "Naming your project",
  curriculum: "Designing your curriculum",
  overview: "Writing your overview",
  save: "Saving to your library",
};

const STEP_ORDER: ProjectBuildStep[] = [
  "name",
  "curriculum",
  "overview",
  "save",
];

/** Plain-language phrasing of each tier for the curriculum placement note. */
const STARTING_POINT_PHRASE: Record<StartingPointTier, string> = {
  fundamentals: "starting from the fundamentals",
  skip_basics: "skipping the basics",
  advanced: "straight to the hard stuff",
};

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
   *  from older checkpoints (which lack it) still typecheck. */
  abilities?: string[];
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
  /** Persist onboarding-derived scenario inspiration into learner memory. */
  persistScenarioInspiration: (input: {
    userId: string;
    content: string;
  }) => Promise<void>;
  /** Create (or return) the durable "generating" plan shell. Returns its id. */
  ensureShell: (input: {
    sessionId: string;
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
    userId: string | null;
    planId: string;
    report: IdentityReport;
    beforeAfter: BeforeAfterProfile;
    blueprint: CurriculumBlueprint;
  }) => Promise<void>;
  /** Write the overview onto the plan, independently of node creation. */
  persistOverview: (input: {
    sessionId: string;
    overview: { title: string; summary: string; body: string };
  }) => Promise<void>;
  /** Flip the plan active + complete the session. Returns the freshly-read plan. */
  finalize: (input: {
    sessionId: string;
    planId: string;
  }) => Promise<CurriculumPlan | null>;
  prepareUnit: (input: {
    node: CurriculumPlan["nodes"][number];
    sessionId: string;
  }) => Promise<unknown>;
  ensureSkillSyllabus: (input: {
    clusterNodeId: string;
    targetIdentity: string;
    topics?: {
      id: string;
      slug: string;
      title: string;
      gloss: string;
      coreIdea: string;
    }[];
  }) => Promise<unknown>;
  ensureAbilityKnowledgeModel: (input: {
    abilityNodeId: string;
    targetIdentity: string;
  }) => Promise<
    {
      id: string;
      slug: string;
      title: string;
      gloss: string;
      coreIdea: string;
    }[]
  >;
  createSkillUnit: (input: {
    clusterNodeId: string;
    sessionId: string;
    userId: string;
  }) => Promise<unknown>;
}

/** v2 plans decompose into abilities; legacy plans into skill clusters. */
const isModuleNode = (node: { kind: string }): boolean =>
  node.kind === "ability" || node.kind === "skill_cluster";

/**
 * The skillMap nodes whose syllabus/first-unit are prewarmed after a build:
 * v2 `skill` nodes (foundation units) and legacy `skill_cluster`s. Abilities
 * are excluded — their skillset units open only after every skill is mastered.
 */
/**
 * Skills whose syllabus is prewarmed at build time. v2 `skill` nodes are
 * gated skill-by-skill: only unlocked (ready) ones need a syllabus now — the
 * rest are generated lazily at unlock time (loadSkill / recovery both pass
 * the ability's topics). Legacy `skill_cluster` nodes have no lazy ensure
 * path, so they are always prewarmed.
 */
const isPrewarmSkillNode = (node: { kind: string; status: string }): boolean =>
  node.kind === "skill_cluster" ||
  (node.kind === "skill" && node.status === "ready");

/**
 * Ceiling on concurrent prewarm AI calls (knowledge models + syllabi). The
 * fan-out previously fired every node at once, which melts the host and
 * invites provider rate limits.
 */
const PREWARM_CONCURRENCY = 3;

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
}: {
  sessionId: string;
  userId: string | null;
  transcript: OnboardingTranscriptMessage[];
  input: CreateProjectInput;
  deps: BuildProjectDeps;
  onProgress: (state: ProjectBuildState) => void;
  /**
   * Keeps the first-unit prewarm alive past the response on serverless hosts
   * (Next.js `after`). Falls back to a detached promise.
   */
  scheduleBackgroundTask?: (task: () => Promise<void>) => void;
}): Promise<
  Result<{
    sessionId: string;
    planId: string;
    title: string;
    moduleCount: number;
    firstUnitId: string | null;
    targetIdentity: string;
    gaps?: ProjectBuildGap[];
  }>
> => {
  const projectName = normalizeLearningTrackName(input.projectName);
  const brief = resolveLearnerBrief(input);
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
  const curriculumPartialSink = (
    partial: Partial<CurriculumDesignerOutput>,
  ) => {
    setArtifactDetail({ step: "curriculum", payload: partial });
    persistPartial("curriculum")(partial);
  };

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
    if (existingPlan) {
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

  // Resolve the learner's starting point: the persisted value (mid-chat tap or a
  // [change] override) wins over whatever the createProject tool proposed. A
  // non-null tier stamps a Glicko seed onto the plan shell and adds a placement
  // note to the curriculum designer; null leaves the workspace on its defaults.
  const startingPointTier =
    persistedStartingPoint?.tier ?? input.startingPoint?.tier ?? null;
  const startingPointLabel =
    persistedStartingPoint?.label ?? input.startingPoint?.reason ?? null;
  const seedRating = startingPointTier
    ? seedFromStartingPoint(startingPointTier)
    : null;
  const placementNote =
    startingPointTier && seedRating
      ? `Learner starting point: ${STARTING_POINT_PHRASE[startingPointTier]}${
          startingPointLabel ? ` — ${startingPointLabel}` : ""
        }; start each cluster's bandRamp near ${seedRating.rating}.`
      : null;

  // 1 — name + shell: create the durable project home before any AI runs.
  setStep("name", "active");
  emit();
  let planId: string;
  try {
    const shell = await deps.ensureShell({
      sessionId,
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

  const buildBlueprint = (
    design: CurriculumDesignerOutput,
  ): CurriculumBlueprint => ({
    title: projectName,
    summary: design.planDraft.summary,
    targetIdentity: design.identityReport.targetIdentity,
    overview: null, // persisted separately via persistOverview
    beforeAfter: design.beforeAfter,
    nodes: buildCurriculumNodes(
      design.planDraft,
      design.identityReport.targetIdentity,
      design.identityReport.headline,
    ),
  });

  const persistDesign = async (design: CurriculumDesignerOutput) => {
    const blueprint = buildBlueprint(design);
    state.modules = moduleTitles(blueprint);
    state.moduleCount = state.modules.length;
    emit();
    await deps.persistCurriculum({
      sessionId,
      userId,
      planId,
      report: design.identityReport,
      beforeAfter: design.beforeAfter,
      blueprint,
    });
  };

  // 3 — curriculum (REQUIRED): design + persist profile/nodes into the shell.
  const runCurriculum = async (): Promise<Result<true>> => {
    setStep("curriculum", "active");
    emit();
    const action = decide(curriculumRecord);
    const attemptsBase = curriculumRecord?.attempts ?? 0;

    if (action === "skip") {
      setStep("curriculum", "done");
      emit();
      return ok(true);
    }

    if (action === "save_only") {
      const cached = CurriculumDesignerOutputSchema.safeParse(
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
          return ok(true);
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

    const attempts = attemptsBase + 1;
    let design: CurriculumDesignerOutput;
    try {
      design = await designCurriculum({
        brief,
        transcript,
        abilities: input.abilities,
        placementNote,
        options: {
          onPartial: curriculumPartialSink,
          seedPartial: seedFor(curriculumRecord) as
            | Partial<CurriculumDesignerOutput>
            | undefined,
        },
      });
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
      return ok(true);
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

  // 5 — save/finalize: flip the plan active + complete the session.
  setStep("save", "active");
  emit();
  let plan: CurriculumPlan | null;
  try {
    plan = await deps.finalize({ sessionId, planId });
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
  state.firstUnitId = plan.nextUnitId;
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
            await deps.persistOverview({ sessionId, overview: cached.data });
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
        await deps.persistOverview({ sessionId, overview });
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

  const firstReadyUnit = plan.nodes.find(
    (node) =>
      (node.kind === "unit" || node.kind === "integration") &&
      node.status === "ready",
  );
  if (firstReadyUnit) {
    const prewarmFirstUnit = () =>
      deps.prepareUnit({ node: firstReadyUnit, sessionId }).then(
        () => undefined,
        (error: unknown) => {
          console.error("First workspace unit prewarm failed", {
            nodeId: firstReadyUnit.id,
            error,
          });
        },
      );
    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(prewarmFirstUnit);
    } else {
      void prewarmFirstUnit();
    }
  }

  const skills = plan.nodes.filter(isPrewarmSkillNode);
  const prewarmLimiter = createTaskLimiter(PREWARM_CONCURRENCY);
  const abilityTopics = new Map<
    string,
    Promise<
      {
        id: string;
        slug: string;
        title: string;
        gloss: string;
        coreIdea: string;
      }[]
    >
  >();
  for (const ability of plan.nodes.filter((node) => node.kind === "ability")) {
    abilityTopics.set(
      ability.id,
      prewarmLimiter(() =>
        deps.ensureAbilityKnowledgeModel({
          abilityNodeId: ability.id,
          targetIdentity: plan.targetIdentity,
        }),
      ).catch((error) => {
        console.error("Knowledge model prewarm failed; continuing topic-less", {
          abilityNodeId: ability.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return [];
      }),
    );
  }
  for (const skill of skills) {
    const prepareSkill = async () => {
      try {
        // Topics are awaited outside the limited section so a queued skill
        // never holds a limiter slot while waiting on its ability's call.
        const topics = skill.parentNodeId
          ? await abilityTopics.get(skill.parentNodeId)
          : undefined;
        await prewarmLimiter(async () => {
          await deps.ensureSkillSyllabus({
            clusterNodeId: skill.id,
            targetIdentity: plan.targetIdentity,
            topics,
          });
          if (userId && skill.status === "ready") {
            await deps.createSkillUnit({
              clusterNodeId: skill.id,
              sessionId,
              userId,
            });
          }
        });
      } catch (error) {
        console.error("Skill syllabus prewarm failed", {
          clusterNodeId: skill.id,
          error,
        });
      }
    };
    if (scheduleBackgroundTask) scheduleBackgroundTask(prepareSkill);
    else void prepareSkill();
  }

  return ok({
    sessionId,
    planId: plan.id,
    title: plan.title || projectName,
    moduleCount: state.moduleCount,
    firstUnitId: plan.nextUnitId,
    targetIdentity: plan.targetIdentity,
    gaps: undefined,
  });
};
