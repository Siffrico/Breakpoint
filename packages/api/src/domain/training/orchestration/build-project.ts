import type { Result } from "../../../lib/result";
import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import {
  CurriculumDesignerOutputSchema,
  OnboardingPacketSchema,
  ProjectOverviewOutputSchema,
} from "../agents/contracts";
import type {
  BeforeAfterProfile,
  CurriculumBlueprint,
  CurriculumPlan,
  IdentityReport,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import { err, ok } from "../../../lib/result";
import { designCurriculum } from "../agents/curriculum-designer";
import { normalizeLearningTrackName } from "../agents/onboarding-chat-agent";
import { designProjectOverview } from "../agents/project-overview";
import { createOnboardingPacket } from "./onboarding-flow";
import { buildCurriculumNodes } from "./curriculum-flow";

/**
 * The project build is presented to the learner as a checklist. Each step is
 * one discrete unit of work — most of them a dedicated AI agent — and every
 * agent receives the *same* onboarding transcript plus its own derived input.
 * The order here is the order the card renders.
 */
export type ProjectBuildStep =
  | "name" // resolve the saved project/sidebar name (no AI, instant)
  | "goals" // onboarding packet agent — distil the transcript
  | "curriculum" // curriculum designer agent — identity report + skeleton
  | "overview" // project overview agent — the readable field map
  | "save"; // deterministic persistence (profile + plan + session)

export type ProjectBuildStepStatus = "pending" | "active" | "done";

export interface ProjectBuildStepState {
  id: ProjectBuildStep;
  label: string;
  status: ProjectBuildStepStatus;
}

export type ProjectBuildPhase = "building" | "complete" | "error";

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
  /** Unit titles, revealed once the curriculum agent returns. */
  modules: string[];
  moduleCount: number;
  // Populated only when `phase === "complete"` — the handoff card needs these.
  sessionId?: string;
  planId?: string;
  firstUnitId?: string | null;
  targetIdentity?: string;
  // Populated only when `phase === "error"`.
  error?: string;
}

const STEP_LABELS: Record<ProjectBuildStep, string> = {
  name: "Naming your project",
  goals: "Reading your goals",
  curriculum: "Designing your curriculum",
  overview: "Writing your overview",
  save: "Saving to your library",
};

const STEP_ORDER: ProjectBuildStep[] = [
  "name",
  "goals",
  "curriculum",
  "overview",
  "save",
];

const initialSteps = (): ProjectBuildStepState[] =>
  STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: "pending" }));

/** Small input the consultant proposes; everything else is derived server-side. */
export interface CreateProjectInput {
  /** Core study topic, lowercase — becomes the sidebar/project name. */
  projectName: string;
  /** Who the learner is becoming, used only for the confirmation preview. */
  targetIdentity: string;
  /** One line describing what they'll build, shown on the confirm card. */
  summary: string;
}

export type ProjectBuildReadiness =
  | { ready: true }
  | { ready: false; reason: string };

type ProjectBuildCheckpointStep = "goals" | "curriculum" | "overview";
type ProjectBuildRunStatus = "building" | "complete" | "error";

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

/** Injected so persistence stays transactional and the orchestrator stays testable. */
export interface BuildProjectDeps {
  /** Idempotency + final read. Returns the active plan for the session if any. */
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
    | { status: "claimed" }
    | { status: "processing"; state: ProjectBuildState }
  >;
  updateRun: (input: {
    sessionId: string;
    sourceKey: string;
    payload: {
      status: ProjectBuildRunStatus;
      input: CreateProjectInput;
      state: ProjectBuildState;
      error?: string;
    };
  }) => Promise<unknown>;
  getCheckpoint: (input: {
    sessionId: string;
    step: ProjectBuildCheckpointStep;
    sourceKey: string;
  }) => Promise<unknown>;
  saveCheckpoint: (input: {
    sessionId: string;
    step: ProjectBuildCheckpointStep;
    sourceKey: string;
    payload: unknown;
  }) => Promise<unknown>;
  /**
   * Atomically writes the profile version, the plan (+nodes +overview), and
   * flips the session to complete. Returns the freshly-read plan, or null on
   * any failure (the transaction is rolled back by the caller).
   */
  persistProject: (input: {
    sessionId: string;
    userId: string | null;
    report: IdentityReport;
    beforeAfter: BeforeAfterProfile;
    blueprint: CurriculumBlueprint;
  }) => Promise<CurriculumPlan | null>;
}

const countModules = (plan: CurriculumPlan): number =>
  plan.nodes.filter(
    (node) => node.kind === "unit" || node.kind === "integration",
  ).length;

const moduleTitles = (blueprint: CurriculumBlueprint): string[] =>
  blueprint.nodes
    .filter((node) => node.kind === "unit" || node.kind === "integration")
    .map((node) => node.title);

const getProjectBuildSourceKey = (input: CreateProjectInput) =>
  JSON.stringify({
    projectName: normalizeLearningTrackName(input.projectName),
    targetIdentity: input.targetIdentity.trim(),
    summary: input.summary.trim(),
  });

const saveCheckpoint = async ({
  deps,
  sessionId,
  step,
  sourceKey,
  payload,
}: {
  deps: BuildProjectDeps;
  sessionId: string;
  step: ProjectBuildCheckpointStep;
  sourceKey: string;
  payload: unknown;
}) => {
  try {
    await deps.saveCheckpoint({ sessionId, step, sourceKey, payload });
  } catch (error) {
    console.error("[build-project] failed to save checkpoint:", {
      sessionId,
      step,
      error,
    });
  }
};

/**
 * Runs the full project build as an ordered checklist, emitting a fresh
 * {@link ProjectBuildState} after every transition via `onProgress`. AI
 * generation (the slow part) runs *outside* any DB transaction; persistence is
 * a single short transaction owned by `deps.persistProject`.
 *
 * Never throws — all failures resolve to `err(...)` and a final
 * `phase: "error"` snapshot, so the card can show a reason and a retry.
 */
export const buildProjectFromOnboarding = async ({
  sessionId,
  userId,
  transcript,
  input,
  deps,
  onProgress,
}: {
  sessionId: string;
  userId: string | null;
  transcript: OnboardingTranscriptMessage[];
  input: CreateProjectInput;
  deps: BuildProjectDeps;
  onProgress: (state: ProjectBuildState) => void;
}): Promise<
  Result<{
    sessionId: string;
    planId: string;
    title: string;
    moduleCount: number;
    firstUnitId: string | null;
    targetIdentity: string;
  }>
> => {
  const projectName = normalizeLearningTrackName(input.projectName);
  const sourceKey = getProjectBuildSourceKey(input);
  const steps = initialSteps();
  const state: ProjectBuildState = {
    phase: "building",
    projectName,
    steps,
    modules: [],
    moduleCount: 0,
    sessionId,
  };

  const setStep = (id: ProjectBuildStep, status: ProjectBuildStepStatus) => {
    const step = steps.find((candidate) => candidate.id === id);
    if (step) step.status = status;
  };
  const emit = () => onProgress({ ...state, steps: steps.map((s) => ({ ...s })) });
  const buildRunPayload = (
    status: ProjectBuildRunStatus,
    error?: string,
  ) => ({
    status,
    input,
    state: { ...state, steps: steps.map((s) => ({ ...s })) },
    error,
  });
  const updateRun = (status: ProjectBuildRunStatus, error?: string) =>
    deps.updateRun({
      sessionId,
      sourceKey,
      payload: buildRunPayload(status, error),
    });
  const fail = async (message: string): Promise<Result<never>> => {
    state.phase = "error";
    state.error = message;
    emit();
    await updateRun("error", message);
    return err(message);
  };

  emit();

  // Idempotency: if a plan already exists (double-approval, retry, reconnect),
  // surface it as complete instead of generating a second curriculum.
  const existingPlan = await deps.getActivePlan(sessionId);
  if (existingPlan) {
    for (const step of steps) step.status = "done";
    state.phase = "complete";
    state.projectName = existingPlan.title || projectName;
    state.modules = existingPlan.nodes
      .filter((node) => node.kind === "unit" || node.kind === "integration")
      .map((node) => node.title);
    state.moduleCount = countModules(existingPlan);
    state.sessionId = sessionId;
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

  const claim = await deps.claimRun({
    sessionId,
    sourceKey,
    payload: buildRunPayload("building"),
  });
  if (claim.status === "processing") {
    onProgress(claim.state);
    return err("Project build is already running.");
  }

  // 1 — name (instant, deterministic)
  setStep("name", "active");
  emit();
  setStep("name", "done");
  emit();

  // 2 — goals: the onboarding packet agent reads the full transcript.
  setStep("goals", "active");
  emit();
  const cachedPacket = OnboardingPacketSchema.safeParse(
    await deps.getCheckpoint({
      sessionId,
      step: "goals",
      sourceKey,
    }),
  );
  let packet: OnboardingPacket;
  try {
    if (cachedPacket.success) {
      packet = cachedPacket.data;
    } else {
      packet = await createOnboardingPacket(transcript);
      await saveCheckpoint({
        deps,
        sessionId,
        step: "goals",
        sourceKey,
        payload: packet,
      });
    }
  } catch (error) {
    return fail(
      error instanceof Error && error.message
        ? error.message
        : "I couldn't read enough from our conversation yet.",
    );
  }
  setStep("goals", "done");
  emit();

  // 3 + 4 — curriculum and overview agents run in parallel, both fed the same
  // packet + transcript. Each ticks its own step the moment it resolves. The
  // overview is best-effort: a failure there must not sink a valid curriculum.
  setStep("curriculum", "active");
  setStep("overview", "active");
  emit();

  const [cachedDesign, cachedOverview] = await Promise.all([
    deps.getCheckpoint({ sessionId, step: "curriculum", sourceKey }).then(
      (payload) => CurriculumDesignerOutputSchema.safeParse(payload),
    ),
    deps.getCheckpoint({ sessionId, step: "overview", sourceKey }).then(
      (payload) => ProjectOverviewOutputSchema.safeParse(payload),
    ),
  ]);

  const overviewPromise: Promise<ProjectOverviewOutput> =
    cachedOverview.success
      ? Promise.resolve(cachedOverview.data).then((value) => {
          setStep("overview", "done");
          emit();
          return value;
        })
      : designProjectOverview({ packet, transcript }).then(
          async (value) => {
            await saveCheckpoint({
              deps,
              sessionId,
              step: "overview",
              sourceKey,
              payload: value,
            });
            setStep("overview", "done");
            emit();
            return value;
          },
          (reason: unknown) => {
            setStep("overview", "done");
            emit();
            throw reason;
          },
        );

  let design: CurriculumDesignerOutput;
  try {
    if (cachedDesign.success) {
      design = cachedDesign.data;
      setStep("curriculum", "done");
      emit();
    } else {
      design = await designCurriculum({ packet, transcript });
      await saveCheckpoint({
        deps,
        sessionId,
        step: "curriculum",
        sourceKey,
        payload: design,
      });
    }
  } catch (error) {
    return fail(
      error instanceof Error && error.message
        ? error.message
        : "I couldn't design the curriculum. Want to try again?",
    );
  }
  setStep("curriculum", "done");

  const blueprint: CurriculumBlueprint = {
    title: projectName,
    summary: design.planDraft.summary,
    targetIdentity: design.identityReport.targetIdentity,
    overview: null,
    beforeAfter: design.beforeAfter,
    nodes: buildCurriculumNodes(
      design.planDraft,
      design.identityReport.targetIdentity,
      design.identityReport.headline,
    ),
  };
  state.modules = moduleTitles(blueprint);
  state.moduleCount = state.modules.length;
  emit();

  // Overview is best-effort (see the contract at the top of this block): a
  // failure must not sink a valid curriculum. We persist with overview = null
  // (the blueprint default); it can be regenerated later.
  try {
    const overview = await overviewPromise;
    blueprint.overview = { ...overview, generatedAt: new Date().toISOString() };
  } catch (error) {
    console.error("[build-project] overview failed; saving without it:", {
      sessionId,
      error,
    });
  }

  // 5 — save: one transaction. Profile + plan + session status, all or nothing.
  setStep("save", "active");
  emit();
  let plan: CurriculumPlan | null;
  try {
    plan = await deps.persistProject({
      sessionId,
      userId,
      report: design.identityReport,
      beforeAfter: design.beforeAfter,
      blueprint,
    });
  } catch (error) {
    const savedPlan = await deps.getActivePlan(sessionId);
    if (savedPlan) {
      for (const step of steps) step.status = "done";
      state.phase = "complete";
      state.projectName = savedPlan.title || projectName;
      state.modules = savedPlan.nodes
        .filter((node) => node.kind === "unit" || node.kind === "integration")
        .map((node) => node.title);
      state.moduleCount = countModules(savedPlan);
      state.sessionId = sessionId;
      state.planId = savedPlan.id;
      state.firstUnitId = savedPlan.nextUnitId;
      state.targetIdentity = savedPlan.targetIdentity;
      emit();
      await updateRun("complete");
      return ok({
        sessionId,
        planId: savedPlan.id,
        title: savedPlan.title || projectName,
        moduleCount: state.moduleCount,
        firstUnitId: savedPlan.nextUnitId,
        targetIdentity: savedPlan.targetIdentity,
      });
    }

    return fail(
      error instanceof Error && error.message
        ? error.message
        : "I built the curriculum but couldn't save it. Want to try again?",
    );
  }
  if (!plan) {
    return fail("I built the curriculum but couldn't save it. Want to try again?");
  }
  setStep("save", "done");

  state.phase = "complete";
  state.projectName = plan.title || projectName;
  state.moduleCount = countModules(plan);
  state.sessionId = sessionId;
  state.planId = plan.id;
  state.firstUnitId = plan.nextUnitId;
  state.targetIdentity = plan.targetIdentity;
  emit();
  await updateRun("complete");

  return ok({
    sessionId,
    planId: plan.id,
    title: plan.title || projectName,
    moduleCount: state.moduleCount,
    firstUnitId: plan.nextUnitId,
    targetIdentity: plan.targetIdentity,
  });
};
