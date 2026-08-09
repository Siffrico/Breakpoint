import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurriculumDesignerOutput,
  LearnerBrief,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type {
  CurriculumPlan,
  OnboardingTranscriptMessage,
} from "../types/training.types";
import type {
  BuildProjectDeps,
  ProjectBuildArtifactRecord,
  ProjectBuildState,
} from "./build-project";
import { designCurriculum } from "../agents/curriculum-designer";
import { designProjectOverview } from "../agents/project-overview";
import { ArtifactBuildError } from "./agent-runtime";
import {
  buildProjectFromOnboarding,
  getProjectBuildReadiness,
} from "./build-project";

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

const consultationTranscript = (
  answers: string[],
): OnboardingTranscriptMessage[] => [
  {
    role: "assistant",
    content: "What do you want to master?",
    sequence: 0,
    slot: null,
  },
  ...answers.flatMap<OnboardingTranscriptMessage>((content, index) => [
    {
      role: "user",
      content,
      sequence: index * 2 + 1,
      slot: null,
    },
    {
      role: "assistant",
      content: `Follow-up ${index + 1}?`,
      sequence: index * 2 + 2,
      slot: null,
    },
  ]),
];

describe("getProjectBuildReadiness", () => {
  it("rejects a shallow four-answer consultation", () => {
    const result = getProjectBuildReadiness(
      consultationTranscript(["SAT", "A high score", "School", "Not sure"]),
    );

    expect(result.ready).toBe(false);
  });

  it("accepts an opening answer plus four concrete follow-ups", () => {
    const result = getProjectBuildReadiness(
      consultationTranscript(Array.from({ length: 5 }, () => "x".repeat(48))),
    );

    expect(result).toEqual({ ready: true });
  });

  it("accepts four unusually detailed answers", () => {
    const result = getProjectBuildReadiness(
      consultationTranscript(Array.from({ length: 4 }, () => "x".repeat(225))),
    );

    expect(result).toEqual({ ready: true });
  });
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
  abilities: [
    "Diagnose Distributed Systems Failures",
    "Architect Reliable Replicated Services",
  ],
};
const sourceKey = JSON.stringify({
  projectName: "distributed-systems",
  targetIdentity: input.targetIdentity,
  summary: input.summary,
  whatToLearn: input.whatToLearn,
  whatToMake: input.whatToMake,
  interests: input.interests,
  abilities: input.abilities,
  startingPoint: null,
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
  masteryContract: {
    exitCriteria: ["Diagnoses the causal mechanism from incomplete evidence."],
  },
  scenarioArchetype: "judge" as const,
  scenarioArchetypeWhy:
    "Diagnosis is evaluated judgment over symptoms and evidence.",
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
  planDraft: {
    title: "Distributed systems",
    summary: "Practice operational judgment for replicated services.",
    abilities: Array.from({ length: 3 }, (_, index) => buildAbility(index)),
  },
};

const overview: ProjectOverviewOutput = {
  title: "Distributed systems map",
  summary: "A field map for reliable replicated services.",
  body: "Distributed systems are about preserving useful guarantees while machines, messages, and time fail independently. ".repeat(
    7,
  ),
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
    curriculumMode?: Awaited<ReturnType<BuildProjectDeps["getCurriculumMode"]>>;
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
      Promise.resolve(planState.exists ? plan : null),
    ),
    hasUnitContent: vi.fn<BuildProjectDeps["hasUnitContent"]>(() =>
      Promise.resolve(true),
    ),
    getStartingPoint: vi.fn<BuildProjectDeps["getStartingPoint"]>(() =>
      Promise.resolve(opts.startingPoint ?? null),
    ),
    getCurriculumMode: vi.fn<BuildProjectDeps["getCurriculumMode"]>(() =>
      Promise.resolve(opts.curriculumMode ?? "ability"),
    ),
    persistScenarioInspiration: vi.fn<
      BuildProjectDeps["persistScenarioInspiration"]
    >(() => Promise.resolve()),
    claimRun: vi.fn<BuildProjectDeps["claimRun"]>(() =>
      Promise.resolve(
        opts.claim ?? { status: "claimed", ownershipToken: "test-lease" },
      ),
    ),
    heartbeatRun: vi.fn<BuildProjectDeps["heartbeatRun"]>(() =>
      Promise.resolve(true),
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
    ensureSkillKnowledge: vi.fn<BuildProjectDeps["ensureSkillKnowledge"]>(() =>
      Promise.resolve(),
    ),
    createSkillUnit: vi.fn<BuildProjectDeps["createSkillUnit"]>(() =>
      Promise.resolve({ id: "unit-1" }),
    ),
  };

  return { deps, store, updateRunCalls };
};

const run = (
  deps: BuildProjectDeps,
  onProgress = vi.fn(),
  scheduleBackgroundTask?: (task: () => Promise<void>) => void,
  inputOverride?: typeof input,
  resumeRound?: number,
) =>
  buildProjectFromOnboarding({
    sessionId: "session-id",
    userId: "user-id",
    transcript,
    input: inputOverride ?? input,
    deps,
    onProgress,
    scheduleBackgroundTask,
    resumeRound,
  });

/**
 * Move the clock forward without waiting. The budget is measured with
 * `Date.now()`, so a test spends it by having an agent "take" time rather than
 * by sleeping.
 */
const spendBudget = (ms: number) => {
  const now = Date.now();
  vi.setSystemTime(new Date(now + ms));
};

describe("buildProjectFromOnboarding", () => {
  it("does not complete until the first unit content is prepared", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();
    const unitFixture = plan.nodes[0];
    if (!unitFixture) throw new Error("Expected a unit fixture.");
    const frontierPlan: CurriculumPlan = {
      ...plan,
      nextUnitId: null,
      nodes: [
        {
          ...unitFixture,
          id: "skill-1",
          kind: "skill",
          status: "ready",
        },
      ],
    };
    vi.mocked(deps.getActivePlan).mockResolvedValue(frontierPlan);
    vi.mocked(deps.hasUnitContent).mockResolvedValue(false);
    vi.mocked(deps.finalize).mockResolvedValue({
      ...frontierPlan,
      nextUnitId: "unit-1",
      nodes: [
        ...frontierPlan.nodes,
        { ...unitFixture, id: "unit-1", parentNodeId: "skill-1" },
      ],
    });

    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(deps.ensureSkillKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNodeId: "skill-1",
        targetIdentity: frontierPlan.targetIdentity,
      }),
    );
    expect(deps.createSkillUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNodeId: "skill-1",
        sessionId: "session-id",
        userId: "user-id",
      }),
    );
    const createOrder = vi.mocked(deps.createSkillUnit).mock
      .invocationCallOrder[0];
    const finalizeOrder = vi.mocked(deps.finalize).mock.invocationCallOrder[0];
    expect(createOrder).toBeDefined();
    expect(finalizeOrder).toBeDefined();
    if (createOrder !== undefined && finalizeOrder !== undefined) {
      expect(createOrder).toBeLessThan(finalizeOrder);
    }
    if (result.success) expect(result.data.firstUnitId).toBe("unit-1");
  });

  it("prepares only the first frontier and never fans out to other nodes", async () => {
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
    const skillsPlan = { ...plan, nodes: skills, nextUnitId: null };
    vi.mocked(deps.getActivePlan).mockResolvedValue(skillsPlan);
    vi.mocked(deps.hasUnitContent).mockResolvedValue(false);
    deps.finalize = vi.fn(() => Promise.resolve(skillsPlan));
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
    // Exactly one node is prepared: the first frontier. Every other node —
    // locked or merely later — is built lazily when the learner reaches it,
    // so the build never fans model calls out of a request that is already
    // spending its budget on the critical path.
    expect(deps.ensureSkillKnowledge).toHaveBeenCalledTimes(1);
    expect(deps.ensureSkillKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ skillNodeId: "skill-1" }),
    );
    expect(deps.createSkillUnit).toHaveBeenCalledTimes(1);
    expect(deps.createSkillUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNodeId: "skill-1",
        sessionId: "session-id",
        userId: "user-id",
      }),
    );
  });

  describe("request budget", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    // Restored here rather than globally: a leaked fake clock stalls the
    // partial-flush test, which waits on real timers.
    afterEach(() => {
      vi.useRealTimers();
    });

    it("yields before the unit step instead of dying mid-generation", async () => {
      // The curriculum lands, but eats almost the whole budget doing it.
      mockCurriculum.mockImplementation(() => {
        spendBudget(200_000);
        return Promise.resolve(curriculum);
      });
      const { deps, updateRunCalls } = makeDeps();
      const unitFixture = plan.nodes[0];
      if (!unitFixture) throw new Error("Expected a unit fixture.");
      vi.mocked(deps.hasUnitContent).mockResolvedValue(false);
      vi.mocked(deps.getActivePlan).mockResolvedValue({
        ...plan,
        nextUnitId: null,
        nodes: [
          { ...unitFixture, id: "skill-1", kind: "skill", status: "ready" },
        ],
      });
      const onProgress = vi.fn();

      const result = await run(deps, onProgress);

      // The curriculum is persisted and checkpointed; the unit step never starts.
      expect(deps.persistCurriculum).toHaveBeenCalledTimes(1);
      expect(deps.ensureSkillKnowledge).not.toHaveBeenCalled();
      expect(deps.createSkillUnit).not.toHaveBeenCalled();
      expect(deps.finalize).not.toHaveBeenCalled();

      // A yield is not an error: the run stays "building" so the resume picks
      // it up, and the round counter advances so the cap can eventually stop it.
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe("building");
      expect(updateRunCalls.at(-1)?.status).toBe("building");
      const lastState = onProgress.mock.calls.at(-1)?.[0] as ProjectBuildState;
      expect(lastState.phase).toBe("needs_resume");
      expect(lastState.resumeRounds).toBe(1);
    });

    it("fails rather than yielding forever once the round cap is reached", async () => {
      const { deps } = makeDeps();
      const onProgress = vi.fn();

      const result = await run(deps, onProgress, undefined, undefined, 4);

      expect(result.success).toBe(false);
      expect(mockCurriculum).not.toHaveBeenCalled();
      const lastState = onProgress.mock.calls.at(-1)?.[0] as ProjectBuildState;
      expect(lastState.phase).toBe("error");
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

  it("keeps a failed background overview regeneratable after the curriculum is ready", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockRejectedValue(
      new ArtifactBuildError("overview model failed", "provider"),
    );
    const { deps, store } = makeDeps();
    const backgroundTasks: (() => Promise<void>)[] = [];

    const result = await run(deps, vi.fn(), (task) =>
      backgroundTasks.push(task),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gaps).toBeUndefined();
    }
    expect(deps.persistCurriculum).toHaveBeenCalledOnce();
    expect(deps.persistOverview).not.toHaveBeenCalled();
    expect(store.get("overview")?.status).toBe("generating");
    await Promise.all(backgroundTasks.map((task) => task()));
    expect(store.get("overview")?.status).toBe("failed");
    expect(store.get("overview")?.failureKind).toBe("provider");
  });

  it("rejects a short overview at the persistence boundary and keeps it regeneratable", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue({
      ...overview,
      body: "x".repeat(51),
    });
    const { deps, store } = makeDeps();
    const backgroundTasks: (() => Promise<void>)[] = [];

    const result = await run(deps, vi.fn(), (task) =>
      backgroundTasks.push(task),
    );

    expect(result.success).toBe(true);
    await Promise.all(backgroundTasks.map((task) => task()));
    expect(deps.persistOverview).not.toHaveBeenCalled();
    expect(store.get("overview")?.status).toBe("failed");
    expect(store.get("overview")?.failureKind).toBe("schema");
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

    const backgroundTasks: (() => Promise<void>)[] = [];
    const result = await run(deps, vi.fn(), (task) =>
      backgroundTasks.push(task),
    );

    expect(result.success).toBe(true);
    // Curriculum is complete → skipped (no model, no re-persist); overview is deferred.
    expect(mockCurriculum).not.toHaveBeenCalled();
    expect(mockOverview).not.toHaveBeenCalled();
    expect(store.get("overview")?.status).toBe("generating");
    await Promise.all(backgroundTasks.map((task) => task()));
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
        abilities: ["Architect Distributed Backend Systems"],
        startingPoint: {
          tier: "skip_basics",
          reason: "you've shipped services",
        },
      },
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(true);
    // skip_basics → band-2 midpoint 1150, wide deviation.
    const shellSeed = vi.mocked(deps.ensureShell).mock.calls[0]?.[0].seedRating;
    expect(shellSeed?.rating).toBe(1150);
    expect(shellSeed?.ratingDeviation).toBe(250);
    expect(mockCurriculum.mock.calls[0]?.[0].abilities).toEqual([
      "Architect Distributed Backend Systems",
    ]);
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

  it("stamps no seed when there is no starting point", async () => {
    mockCurriculum.mockResolvedValue(curriculum);
    mockOverview.mockResolvedValue(overview);
    const { deps } = makeDeps();

    // The shared `input` has no startingPoint, and getStartingPoint returns null.
    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(
      vi.mocked(deps.ensureShell).mock.calls[0]?.[0].seedRating,
    ).toBeNull();
  });
});
