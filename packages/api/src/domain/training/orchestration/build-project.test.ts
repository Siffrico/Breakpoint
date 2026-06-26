import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { CurriculumPlan } from "../types/training.types";
import type {
  BuildProjectDeps,
  ProjectBuildArtifactRecord,
  ProjectBuildState,
} from "./build-project";
import { designCurriculum } from "../agents/curriculum-designer";
import { designProjectOverview } from "../agents/project-overview";
import { ArtifactBuildError } from "./agent-runtime";
import { buildProjectFromOnboarding } from "./build-project";
import { createOnboardingPacket } from "./onboarding-flow";

// The build artifacts' agents are imported directly (not injected), so we mock
// the three entry points and drive each test's behaviour through them.
vi.mock("./onboarding-flow", () => ({ createOnboardingPacket: vi.fn() }));
vi.mock("../agents/curriculum-designer", () => ({ designCurriculum: vi.fn() }));
vi.mock("../agents/project-overview", () => ({
  designProjectOverview: vi.fn(),
}));

const mockPacket = vi.mocked(createOnboardingPacket);
const mockCurriculum = vi.mocked(designCurriculum);
const mockOverview = vi.mocked(designProjectOverview);

const UNEXPECTED = (name: string) => () =>
  Promise.reject(new Error(`unexpected agent call: ${name}`));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: any agent call is a test failure unless explicitly allowed.
  mockPacket.mockImplementation(UNEXPECTED("packet"));
  mockCurriculum.mockImplementation(UNEXPECTED("curriculum"));
  mockOverview.mockImplementation(UNEXPECTED("overview"));
});

const input = {
  projectName: "distributed systems",
  targetIdentity: "backend engineer",
  summary: "Build reliable replicated services.",
};
const sourceKey = JSON.stringify({
  projectName: "distributed-systems",
  targetIdentity: input.targetIdentity,
  summary: input.summary,
});

const transcript = [
  {
    role: "assistant" as const,
    content: "Who do you want to become?",
    sequence: 0,
    slot: "target_identity" as const,
  },
  {
    role: "user" as const,
    content: "I want to become a backend engineer.",
    sequence: 1,
    slot: "target_identity" as const,
  },
];

const packet: OnboardingPacket = {
  targetIdentity: "backend engineer",
  motivation: "Build reliable systems.",
  currentBaseline: "Knows terms but needs operational judgment.",
  hardMoments: ["Choosing consistency tradeoffs under pressure."],
  constraints: [],
  proofOfProgress: "Can explain and repair replicated-service failures.",
  identityFriction: "Reaches for slogans before tracing mechanics.",
  behaviorSignals: [
    "Traces concrete failure paths.",
    "Names tradeoffs before choosing.",
    "Repairs weak explanations.",
  ],
  confidenceFlags: [],
};

const buildUnit = (index: number) => ({
  title: `Unit ${index + 1}`,
  learningGoal:
    "Given a concrete replicated-service failure, identify the causal mechanism and choose the next operational move.",
});

const curriculum: CurriculumDesignerOutput = {
  identityReport: {
    targetIdentity: "backend engineer",
    headline: "Reliable systems operator",
    motivation: "Build reliable systems.",
    currentBaseline: "Knows terms but needs operational judgment.",
    hardMoments: ["Choosing consistency tradeoffs under pressure."],
    constraints: [],
    proofOfProgress: "Can explain and repair replicated-service failures.",
    behaviorSignals: [
      "Traces concrete failure paths.",
      "Names tradeoffs before choosing.",
      "Repairs weak explanations.",
    ],
    confidenceFlags: [],
  },
  beforeAfter: {
    headline: "From slogans to mechanics.",
    beforeSummary: "Uses distributed-systems terms loosely.",
    afterSummary: "Traces concrete failure mechanics.",
    contrastPairs: [
      { before: "Names CAP.", after: "Traces the failed guarantee." },
      { before: "Guesses retry.", after: "Checks idempotency first." },
      { before: "Trusts quorum.", after: "Models replica intersections." },
    ],
    firstShift: "Trace the messages before naming the pattern.",
  },
  planDraft: {
    title: "Distributed systems",
    summary: "Practice operational judgment for replicated services.",
    targetIdentity: "backend engineer",
    clusters: [
      {
        title: "Diagnose replicated-service failures",
        summary: "Trace reads, writes, lag, and acknowledgement boundaries.",
        whyItMatters: "Reliability claims fail here first.",
        units: Array.from({ length: 20 }, (_, index) => buildUnit(index)),
        bandRamp: { startRating: 1000, peakRating: 1600 },
        simulation: {
          title: "Checkout under replica lag",
          summary: "Diagnose stale inventory during a live incident.",
          whyItMatters: "It combines user impact and consistency mechanics.",
        },
      },
    ],
    integrationLayers: [],
  },
};

const overview: ProjectOverviewOutput = {
  title: "Distributed systems map",
  summary: "A field map for reliable replicated services.",
  body: "Distributed systems are about preserving useful guarantees while machines, messages, and time fail independently.",
};

const plan: CurriculumPlan = {
  id: "plan-id",
  title: "distributed-systems",
  summary: "Practice operational judgment for replicated services.",
  targetIdentity: "backend engineer",
  overview: {
    title: overview.title,
    summary: overview.summary,
    generatedAt: "2026-06-23T12:00:00.000Z",
  },
  beforeAfter: curriculum.beforeAfter,
  nodes: [
    {
      id: "unit-id",
      parentNodeId: null,
      kind: "unit",
      title: "Quorum reads under replica lag",
      summary: "Decide when a read is fresh enough.",
      whyItMatters: "Replica lag is where consistency claims become real.",
      learningGoal: "Trace quorum reads through replica lag.",
      orderIndex: 0,
      depth: 0,
      positionColumn: 0,
      positionRow: 0,
      status: "ready",
      difficultyBands: null,
    },
  ],
  nextUnitId: "unit-id",
};

/**
 * In-memory deps with an artifact registry + plan-status store, so a single
 * test can simulate a resume across two build calls.
 */
const makeDeps = (
  opts: {
    artifacts?: ProjectBuildArtifactRecord[];
    artifactsSourceKey?: string;
    planStatus?: string | null;
    claim?: Awaited<ReturnType<BuildProjectDeps["claimRun"]>>;
    persistCurriculum?: BuildProjectDeps["persistCurriculum"];
    persistOverview?: BuildProjectDeps["persistOverview"];
  } = {},
) => {
  const store = new Map<
    string,
    ProjectBuildArtifactRecord & { sourceKey: string }
  >();
  const seedSourceKey = opts.artifactsSourceKey ?? sourceKey;
  for (const record of opts.artifacts ?? []) {
    store.set(record.step, { ...record, sourceKey: seedSourceKey });
  }
  const planState: { exists: boolean; status: string | null } = {
    exists: opts.planStatus != null,
    status: opts.planStatus ?? null,
  };
  const updateRunCalls: { status: string }[] = [];
  const saveArtifact = vi.fn<BuildProjectDeps["saveArtifact"]>((payload) => {
    store.set(payload.step, {
      step: payload.step,
      sourceKey: payload.sourceKey,
      status: payload.status,
      attempts: payload.attempts ?? store.get(payload.step)?.attempts ?? 0,
      failureKind: payload.failureKind ?? null,
      payload: payload.payload,
    });
    return Promise.resolve(null);
  });

  const deps: BuildProjectDeps = {
    getPlanRow: vi.fn<BuildProjectDeps["getPlanRow"]>(() =>
      Promise.resolve(
        planState.exists
          ? {
              id: "plan-id",
              status: planState.status ?? "generating",
              profileVersionId: null,
            }
          : null,
      ),
    ),
    getActivePlan: vi.fn<BuildProjectDeps["getActivePlan"]>(() =>
      Promise.resolve(planState.status === "active" ? plan : null),
    ),
    claimRun: vi.fn<BuildProjectDeps["claimRun"]>(() =>
      Promise.resolve(opts.claim ?? { status: "claimed" }),
    ),
    updateRun: vi.fn<BuildProjectDeps["updateRun"]>((payload) => {
      updateRunCalls.push({ status: payload.payload.status });
      return Promise.resolve(null);
    }),
    getArtifacts: vi.fn<BuildProjectDeps["getArtifacts"]>((payload) =>
      Promise.resolve(
        [...store.values()]
          .filter((record) => record.sourceKey === payload.sourceKey)
          .map(({ sourceKey: _sourceKey, ...record }) => record),
      ),
    ),
    saveArtifact,
    ensureShell: vi.fn<BuildProjectDeps["ensureShell"]>(() => {
      planState.exists = true;
      planState.status ??= "generating";
      return Promise.resolve({ id: "plan-id" });
    }),
    persistCurriculum:
      opts.persistCurriculum ??
      vi.fn<BuildProjectDeps["persistCurriculum"]>(() => Promise.resolve()),
    persistOverview:
      opts.persistOverview ??
      vi.fn<BuildProjectDeps["persistOverview"]>(() => Promise.resolve()),
    finalize: vi.fn<BuildProjectDeps["finalize"]>(() => {
      planState.status = "active";
      return Promise.resolve(plan);
    }),
  };

  return { deps, store, updateRunCalls };
};

const run = (deps: BuildProjectDeps, onProgress = vi.fn()) =>
  buildProjectFromOnboarding({
    sessionId: "session-id",
    userId: "user-id",
    transcript,
    input,
    deps,
    onProgress,
  });

describe("buildProjectFromOnboarding", () => {
  it("does not generate or persist while a build is already running", async () => {
    const processing: Awaited<ReturnType<BuildProjectDeps["claimRun"]>> = {
      status: "processing",
      state: {
        phase: "building",
        projectName: "distributed-systems",
        steps: [],
        modules: [],
        moduleCount: 0,
        sessionId: "session-id",
      } satisfies ProjectBuildState,
    };
    const { deps } = makeDeps({ claim: processing });

    const result = await run(deps);

    expect(result.success).toBe(false);
    expect(deps.ensureShell).not.toHaveBeenCalled();
    expect(mockPacket).not.toHaveBeenCalled();
    expect(mockCurriculum).not.toHaveBeenCalled();
  });

  it("creates the plan shell and emits planId before any AI runs", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const onProgress = vi.fn<(state: ProjectBuildState) => void>();
    const { deps } = makeDeps();

    const result = await run(deps, onProgress);

    expect(result.success).toBe(true);
    expect(deps.ensureShell).toHaveBeenCalledOnce();
    // A snapshot carries the planId while goals/curriculum are still pending,
    // i.e. the shell exists before the agents finish.
    const earlyShellEmit = onProgress.mock.calls.find(
      ([state]) =>
        state.planId === "plan-id" &&
        state.steps.find((s) => s.id === "goals")?.status !== "done",
    );
    expect(earlyShellEmit).toBeDefined();
  });

  it("completes a fresh build end to end with no gaps", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps, updateRunCalls } = makeDeps();

    const result = await run(deps);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.planId).toBe("plan-id");
      expect(result.data.gaps).toBeUndefined();
    }
    expect(deps.persistCurriculum).toHaveBeenCalledOnce();
    expect(deps.persistOverview).toHaveBeenCalledOnce();
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(updateRunCalls.at(-1)?.status).toBe("complete");
  });

  it("re-saves a generated_pending_save curriculum with zero agent calls", async () => {
    const persistCurriculum = vi.fn<BuildProjectDeps["persistCurriculum"]>(() =>
      Promise.resolve(),
    );
    const { deps, store } = makeDeps({
      planStatus: "generating",
      persistCurriculum,
      artifacts: [
        {
          step: "goals",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: packet,
        },
        {
          step: "curriculum",
          status: "generated_pending_save",
          attempts: 1,
          failureKind: "save",
          payload: curriculum,
        },
        {
          step: "overview",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: overview,
        },
      ],
    });

    const result = await run(deps);

    expect(result.success).toBe(true);
    // The whole point of save_only: no model is invoked.
    expect(mockPacket).not.toHaveBeenCalled();
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(persistCurriculum).toHaveBeenCalledOnce();
    expect(store.get("curriculum")?.status).toBe("complete");
  });

  it("completes with an overview gap when the overview agent fails", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockRejectedValue(
      new ArtifactBuildError("overview model failed", "provider"),
    );
    const { deps, store } = makeDeps();

    const result = await run(deps);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gaps).toEqual(["overview"]);
    }
    expect(deps.persistCurriculum).toHaveBeenCalledOnce();
    expect(deps.persistOverview).not.toHaveBeenCalled();
    expect(store.get("overview")?.status).toBe("failed");
    expect(store.get("overview")?.failureKind).toBe("provider");
  });

  it("fails resumably on curriculum error, keeping the shell + packet checkpoint", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockRejectedValue(
      new ArtifactBuildError("curriculum schema invalid", "schema"),
    );
    const { deps, store, updateRunCalls } = makeDeps();

    const result = await run(deps);

    expect(result.success).toBe(false);
    expect(deps.ensureShell).toHaveBeenCalledOnce();
    expect(deps.persistCurriculum).not.toHaveBeenCalled();
    expect(store.get("goals")?.status).toBe("complete");
    expect(store.get("curriculum")?.status).toBe("failed");
    expect(store.get("curriculum")?.failureKind).toBe("schema");
    expect(updateRunCalls.at(-1)?.status).toBe("error");
  });

  it("short-circuits to complete for a fully-built active plan", async () => {
    const { deps } = makeDeps({ planStatus: "active" });

    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(deps.ensureShell).not.toHaveBeenCalled();
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it("regenerates only the overview when an active plan still has a gap", async () => {
    mockOverview.mockResolvedValue(overview);
    const { deps, store } = makeDeps({
      planStatus: "active",
      artifacts: [
        {
          step: "goals",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: packet,
        },
        {
          step: "curriculum",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: curriculum,
        },
        {
          step: "overview",
          status: "failed",
          attempts: 1,
          failureKind: "provider",
          payload: null,
        },
      ],
    });

    const result = await run(deps);

    expect(result.success).toBe(true);
    // Curriculum is complete → skipped (no model, no re-persist); only overview runs.
    expect(mockPacket).not.toHaveBeenCalled();
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(mockOverview).toHaveBeenCalledOnce();
    expect(deps.persistOverview).toHaveBeenCalledOnce();
    expect(store.get("overview")?.status).toBe("complete");
  });

  it("does not report success when finalize fails on a still-generating plan", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps, updateRunCalls } = makeDeps();
    deps.finalize = vi.fn(() =>
      Promise.reject(new Error("finalize failed")),
    ) as BuildProjectDeps["finalize"];
    // Mirror the real getActivePlan, which returns a profile-linked plan even
    // while its status is still "generating"…
    deps.getActivePlan = vi.fn(() =>
      Promise.resolve(plan),
    ) as BuildProjectDeps["getActivePlan"];
    // …while the live plan row shows finalize never flipped it active.
    deps.getPlanRow = vi.fn(() =>
      Promise.resolve({
        id: "plan-id",
        status: "generating",
        profileVersionId: "pv-1",
      }),
    ) as BuildProjectDeps["getPlanRow"];

    const result = await run(deps);

    expect(result.success).toBe(false);
    expect(updateRunCalls.at(-1)?.status).toBe("error");
  });

  it("completes when finalize throws but the plan is already active", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps, updateRunCalls } = makeDeps();
    deps.finalize = vi.fn(() =>
      Promise.reject(new Error("finalize read failed")),
    ) as BuildProjectDeps["finalize"];
    deps.getActivePlan = vi.fn(() =>
      Promise.resolve(plan),
    ) as BuildProjectDeps["getActivePlan"];
    // Generating during the early idempotency check (so the build runs), then
    // active by the time the catch re-reads it (a prior attempt flipped it).
    deps.getPlanRow = vi
      .fn()
      .mockResolvedValueOnce({
        id: "plan-id",
        status: "generating",
        profileVersionId: null,
      })
      .mockResolvedValue({
        id: "plan-id",
        status: "active",
        profileVersionId: "pv-1",
      }) as BuildProjectDeps["getPlanRow"];

    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(updateRunCalls.at(-1)?.status).toBe("complete");
  });

  it("flushes an in-flight partial before stamping the terminal status", async () => {
    mockPacket.mockResolvedValue(packet);
    mockOverview.mockResolvedValue(overview);
    // The curriculum agent emits one mid-stream partial, then resolves.
    mockCurriculum.mockImplementation(({ options }) => {
      options?.onPartial?.({});
      return Promise.resolve(curriculum);
    });

    const { deps, store } = makeDeps();
    const baseSave = deps.saveArtifact;
    // Gate the "generating" partial write so it is still in flight when the
    // terminal "complete" write wants to run — modelling an out-of-order commit.
    let releaseGenerating!: () => void;
    const gate = new Promise<void>((resolve) => (releaseGenerating = resolve));
    deps.saveArtifact = vi.fn<BuildProjectDeps["saveArtifact"]>((payload) =>
      payload.step === "curriculum" && payload.status === "generating"
        ? gate.then(() => baseSave(payload))
        : baseSave(payload),
    );

    const runPromise = run(deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The terminal write is blocked behind the unresolved partial.
    expect(store.get("curriculum")?.status).not.toBe("complete");

    releaseGenerating();
    const result = await runPromise;

    expect(result.success).toBe(true);
    expect(store.get("curriculum")?.status).toBe("complete");
  });

  it("does not reuse artifacts from a different source key", async () => {
    mockPacket.mockResolvedValue(packet);
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps({
      artifactsSourceKey: "stale-source-key",
      artifacts: [
        {
          step: "goals",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: packet,
        },
        {
          step: "curriculum",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: curriculum,
        },
        {
          step: "overview",
          status: "complete",
          attempts: 1,
          failureKind: null,
          payload: overview,
        },
      ],
    });

    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(mockPacket).toHaveBeenCalledOnce();
    expect(mockCurriculum).toHaveBeenCalledOnce();
    expect(mockOverview).toHaveBeenCalledOnce();
  });
});
