import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurriculumDesignerOutput,
  LearnerBrief,
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

// The build artifacts' agents are imported directly (not injected), so we mock
// the two entry points and drive each test's behaviour through them.
vi.mock("../agents/curriculum-designer", () => ({ designCurriculum: vi.fn() }));
vi.mock("../agents/project-overview", () => ({
  designProjectOverview: vi.fn(),
}));

const mockCurriculum = vi.mocked(designCurriculum);
const mockOverview = vi.mocked(designProjectOverview);

const UNEXPECTED = (name: string) => () =>
  Promise.reject(new Error(`unexpected agent call: ${name}`));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: any agent call is a test failure unless explicitly allowed.
  mockCurriculum.mockImplementation(UNEXPECTED("curriculum"));
  mockOverview.mockImplementation(UNEXPECTED("overview"));
});

// The consultant now emits the brief inside its createProject call, so the
// build's whole steering signal arrives as plain input — no agent in between.
const brief: LearnerBrief = {
  whatToLearn: "distributed systems: real operational judgment under failure",
  whatToMake: "a replicated service they can break and repair on purpose",
  interests: [
    "Vercel: making difficult deployment work feel immediate and simple.",
  ],
};

const input = {
  ...brief,
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

const buildComponentSkill = (index: number) => ({
  title: `Trace acknowledgement boundaries ${index + 1}`,
  summary: "Follow one write through its replicas.",
  whyItMatters: "Acknowledgement gaps hide the real failure.",
  workflow: {
    name: "Trace a write's acknowledgements",
    steps: ["Find the write", "List the replicas", "Mark the ack boundary"],
  },
  masteryContract: {
    exitCriteria: ["Marks the acknowledgement boundary correctly."],
  },
});

const buildAbility = (index: number) => ({
  title: `Diagnose replicated-service failure ${index + 1}`,
  summary: "Trace reads, writes, lag, and acknowledgement boundaries.",
  whyItMatters: "Reliability claims fail here first.",
  workflow: {
    name: "Diagnose a replicated-service failure",
    steps: ["Collect evidence", "Trace message flow", "Choose the next probe"],
  },
  bandRamp: { startRating: 1000, peakRating: 1600 },
  masteryContract: {
    exitCriteria: ["Diagnoses the causal mechanism from incomplete evidence."],
  },
  skills: Array.from({ length: 3 }, (_, skillIndex) =>
    buildComponentSkill(skillIndex),
  ),
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
    abilities: Array.from({ length: 3 }, (_, index) => buildAbility(index)),
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
    startingPoint?: Awaited<
      ReturnType<BuildProjectDeps["getStartingPoint"]>
    > | null;
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
    getStartingPoint: vi.fn<BuildProjectDeps["getStartingPoint"]>(() =>
      Promise.resolve(opts.startingPoint ?? null),
    ),
    persistScenarioInspiration: vi.fn<
      BuildProjectDeps["persistScenarioInspiration"]
    >(() => Promise.resolve()),
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
    prepareUnit: vi.fn<BuildProjectDeps["prepareUnit"]>(() =>
      Promise.resolve(),
    ),
    ensureSkillSyllabus: vi.fn<BuildProjectDeps["ensureSkillSyllabus"]>(() =>
      Promise.resolve(),
    ),
    ensureAbilityKnowledgeModel: vi.fn<
      BuildProjectDeps["ensureAbilityKnowledgeModel"]
    >(() => Promise.resolve([])),
    createSkillUnit: vi.fn<BuildProjectDeps["createSkillUnit"]>(() =>
      Promise.resolve(),
    ),
  };

  return { deps, store, updateRunCalls };
};

const run = (
  deps: BuildProjectDeps,
  onProgress = vi.fn(),
  scheduleBackgroundTask?: (task: () => Promise<void>) => void,
  inputOverride?: typeof input,
) =>
  buildProjectFromOnboarding({
    sessionId: "session-id",
    userId: "user-id",
    transcript,
    input: inputOverride ?? input,
    deps,
    onProgress,
    scheduleBackgroundTask,
  });

describe("buildProjectFromOnboarding", () => {
  it("prewarms every skill's syllabus but only the unlocked skill's unit", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();
    const firstAbility = curriculum.planDraft.abilities[0];
    if (!firstAbility) throw new Error("Expected an ability fixture.");
    const skills = firstAbility.skills.map((skill, index) => ({
      id: `skill-${index + 1}`,
      parentNodeId: "ability-1",
      kind: "skill" as const,
      title: skill.title,
      summary: skill.summary,
      whyItMatters: skill.whyItMatters,
      learningGoal: skill.masteryContract.exitCriteria.join(" "),
      orderIndex: index + 1,
      depth: 2,
      positionColumn: 0,
      positionRow: 2 + index,
      // v2 gate: only the first skill is unlocked at build time.
      status: index === 0 ? ("ready" as const) : ("planned" as const),
      difficultyBands: null,
    }));
    deps.finalize = vi.fn(() =>
      Promise.resolve({ ...plan, nodes: skills, nextUnitId: null }),
    );
    const tasks: Promise<void>[] = [];

    const result = await run(deps, vi.fn(), (task) => {
      tasks.push(task());
    });
    await Promise.all(tasks);

    expect(result.success).toBe(true);
    expect(deps.persistScenarioInspiration).toHaveBeenCalledWith({
      userId: "user-id",
      content:
        "Interest: Vercel: making difficult deployment work feel immediate and simple.",
    });
    expect(deps.ensureSkillSyllabus).toHaveBeenCalledTimes(skills.length);
    expect(deps.createSkillUnit).toHaveBeenCalledTimes(1);
    expect(deps.createSkillUnit).toHaveBeenCalledWith({
      clusterNodeId: "skill-1",
      sessionId: "session-id",
      userId: "user-id",
    });
  });

  it("continues building when scenario inspiration persistence fails", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();
    const twoInterests = {
      ...input,
      interests: [...brief.interests, "Designing systems that fail safely."],
    };
    const error = new ArtifactBuildError("memory unavailable", "save");
    deps.persistScenarioInspiration = vi
      .fn<BuildProjectDeps["persistScenarioInspiration"]>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await run(deps, vi.fn(), undefined, twoInterests);

    expect(result.success).toBe(true);
    expect(deps.persistScenarioInspiration).toHaveBeenCalledTimes(2);
    expect(deps.persistScenarioInspiration).toHaveBeenLastCalledWith({
      userId: "user-id",
      content: "Interest: Designing systems that fail safely.",
    });
    expect(deps.finalize).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Scenario inspiration persistence failed; continuing project build",
      { sessionId: "session-id", error },
    );
  });

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
    expect(mockCurriculum).not.toHaveBeenCalled();
  });

  it("creates the plan shell and emits planId before any AI runs", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const onProgress = vi.fn<(state: ProjectBuildState) => void>();
    const { deps } = makeDeps();

    const result = await run(deps, onProgress);

    expect(result.success).toBe(true);
    expect(deps.ensureShell).toHaveBeenCalledOnce();
    // A snapshot carries the planId while the curriculum is still pending,
    // i.e. the shell exists before the agents finish.
    const earlyShellEmit = onProgress.mock.calls.find(
      ([state]) =>
        state.planId === "plan-id" &&
        state.steps.find((s) => s.id === "curriculum")?.status !== "done",
    );
    expect(earlyShellEmit).toBeDefined();
  });

  it("completes a fresh build end to end with no gaps", async () => {
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
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(persistCurriculum).toHaveBeenCalledOnce();
    expect(store.get("curriculum")?.status).toBe("complete");
  });

  it("completes with an overview gap when the overview agent fails", async () => {
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

  it("fails resumably on curriculum error, keeping the shell + checkpoint", async () => {
    mockCurriculum.mockRejectedValue(
      new ArtifactBuildError("curriculum schema invalid", "schema"),
    );
    const { deps, store, updateRunCalls } = makeDeps();

    const result = await run(deps);

    expect(result.success).toBe(false);
    expect(deps.ensureShell).toHaveBeenCalledOnce();
    expect(deps.persistCurriculum).not.toHaveBeenCalled();
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
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(mockOverview).toHaveBeenCalledOnce();
    expect(deps.persistOverview).toHaveBeenCalledOnce();
    expect(store.get("overview")?.status).toBe("complete");
  });

  it("does not report success when finalize fails on a still-generating plan", async () => {
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
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps({
      artifactsSourceKey: "stale-source-key",
      artifacts: [
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
    expect(mockCurriculum).toHaveBeenCalledOnce();
    expect(mockOverview).toHaveBeenCalledOnce();
  });

  it("stamps the seed rating from the tool-proposed starting point", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();

    const result = await buildProjectFromOnboarding({
      sessionId: "session-id",
      userId: "user-id",
      transcript,
      input: {
        ...input,
        skills: ["Architect Distributed Backend Systems"],
        startingPoint: { tier: "skip_basics", reason: "you've shipped services" },
      },
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(true);
    // skip_basics → band-2 midpoint 1150, wide deviation.
    const shellSeed = vi.mocked(deps.ensureShell).mock.calls[0]?.[0].seedRating;
    expect(shellSeed?.rating).toBe(1150);
    expect(shellSeed?.ratingDeviation).toBe(250);
    // The placement note reaches the curriculum designer.
    const curriculumArgs = mockCurriculum.mock.calls[0]?.[0];
    expect(curriculumArgs?.skills).toEqual([
      "Architect Distributed Backend Systems",
    ]);
    expect(curriculumArgs?.placementNote).toContain("1150");
  });

  it("lets the persisted starting point win over the tool input", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps({
      startingPoint: { tier: "advanced", label: "I ship these for a living" },
    });

    const result = await buildProjectFromOnboarding({
      sessionId: "session-id",
      userId: "user-id",
      transcript,
      input: {
        ...input,
        startingPoint: { tier: "fundamentals", reason: "brand new" },
      },
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(true);
    // Session override (advanced → 1350) beats the tool's fundamentals (950).
    const shellSeed = vi.mocked(deps.ensureShell).mock.calls[0]?.[0].seedRating;
    expect(shellSeed?.rating).toBe(1350);
  });

  it("stamps no seed and adds no placement note when there is no starting point", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();

    // The shared `input` has no startingPoint, and getStartingPoint returns null.
    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(vi.mocked(deps.ensureShell).mock.calls[0]?.[0].seedRating).toBeNull();
    expect(mockCurriculum.mock.calls[0]?.[0].placementNote).toBeNull();
  });
});
