import { describe, expect, it, vi } from "vitest";

import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  ProjectOverviewOutput,
} from "../agents/contracts";
import type { CurriculumPlan } from "../types/training.types";
import type { BuildProjectDeps, ProjectBuildState } from "./build-project";
import { buildProjectFromOnboarding } from "./build-project";

// The overview agent is invoked directly (not injected), so a failing-overview
// test mocks the module. Tests that cache the overview checkpoint never reach it.
vi.mock("../agents/project-overview", () => ({
  designProjectOverview: vi.fn(() =>
    Promise.reject(new Error("overview model failed")),
  ),
}));

type ClaimRunResult = Awaited<ReturnType<BuildProjectDeps["claimRun"]>>;

const input = {
  projectName: "distributed systems",
  targetIdentity: "backend engineer",
  summary: "Build reliable replicated services.",
};

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

describe("buildProjectFromOnboarding", () => {
  it("does not generate or save while a build is already running", async () => {
    const processingRun: ClaimRunResult = {
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
    const getCheckpoint = vi.fn<BuildProjectDeps["getCheckpoint"]>(() => {
      throw new Error("should not read checkpoints");
    });
    const persistProject = vi.fn<BuildProjectDeps["persistProject"]>(() => {
      throw new Error("should not save");
    });

    const deps: BuildProjectDeps = {
      getActivePlan: vi.fn<BuildProjectDeps["getActivePlan"]>(() =>
        Promise.resolve(null),
      ),
      claimRun: vi.fn<BuildProjectDeps["claimRun"]>(() =>
        Promise.resolve(processingRun),
      ),
      updateRun: vi.fn<BuildProjectDeps["updateRun"]>(() =>
        Promise.resolve(null),
      ),
      getCheckpoint,
      saveCheckpoint: vi.fn<BuildProjectDeps["saveCheckpoint"]>(() =>
        Promise.resolve(null),
      ),
      persistProject,
    };

    const result = await buildProjectFromOnboarding({
      sessionId: "session-id",
      userId: "user-id",
      transcript,
      input,
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(getCheckpoint).not.toHaveBeenCalled();
    expect(persistProject).not.toHaveBeenCalled();
  });

  it("resumes from cached generated artifacts and persists without rerunning AI", async () => {
    const claimedRun: ClaimRunResult = { status: "claimed" };
    const updateRun = vi.fn<BuildProjectDeps["updateRun"]>(() =>
      Promise.resolve(null),
    );
    const saveCheckpoint = vi.fn<BuildProjectDeps["saveCheckpoint"]>(() => {
      throw new Error("should not rewrite cached artifacts");
    });
    const persistProject = vi.fn<BuildProjectDeps["persistProject"]>(() =>
      Promise.resolve(plan),
    );
    const checkpoints: Record<string, unknown> = {
      goals: packet,
      curriculum,
      overview,
    };

    const deps: BuildProjectDeps = {
      getActivePlan: vi.fn<BuildProjectDeps["getActivePlan"]>(() =>
        Promise.resolve(null),
      ),
      claimRun: vi.fn<BuildProjectDeps["claimRun"]>(() =>
        Promise.resolve(claimedRun),
      ),
      updateRun,
      getCheckpoint: vi.fn<BuildProjectDeps["getCheckpoint"]>(({ step }) => {
        return Promise.resolve(checkpoints[step] ?? null);
      }),
      saveCheckpoint,
      persistProject,
    };

    const result = await buildProjectFromOnboarding({
      sessionId: "session-id",
      userId: "user-id",
      transcript,
      input,
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(true);
    expect(persistProject).toHaveBeenCalledOnce();
    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(updateRun.mock.calls.at(-1)?.[0].payload.status).toBe("complete");
  });

  it("saves the curriculum with a null overview when the overview agent fails", async () => {
    const claimedRun: ClaimRunResult = { status: "claimed" };
    const updateRun = vi.fn<BuildProjectDeps["updateRun"]>(() =>
      Promise.resolve(null),
    );
    let persistedOverview: unknown = "unset";
    const persistProject = vi.fn<BuildProjectDeps["persistProject"]>((args) => {
      persistedOverview = args.blueprint.overview;
      return Promise.resolve(plan);
    });
    // Overview is intentionally absent → the (mocked, rejecting) agent runs;
    // goals + curriculum are cached so no other AI is invoked.
    const checkpoints: Record<string, unknown> = { goals: packet, curriculum };

    const deps: BuildProjectDeps = {
      getActivePlan: vi.fn<BuildProjectDeps["getActivePlan"]>(() =>
        Promise.resolve(null),
      ),
      claimRun: vi.fn<BuildProjectDeps["claimRun"]>(() =>
        Promise.resolve(claimedRun),
      ),
      updateRun,
      getCheckpoint: vi.fn<BuildProjectDeps["getCheckpoint"]>(({ step }) =>
        Promise.resolve(checkpoints[step] ?? null),
      ),
      saveCheckpoint: vi.fn<BuildProjectDeps["saveCheckpoint"]>(() =>
        Promise.resolve(null),
      ),
      persistProject,
    };

    const result = await buildProjectFromOnboarding({
      sessionId: "session-id",
      userId: "user-id",
      transcript,
      input,
      deps,
      onProgress: vi.fn(),
    });

    expect(result.success).toBe(true);
    expect(persistProject).toHaveBeenCalledOnce();
    expect(persistedOverview).toBeNull();
    expect(updateRun.mock.calls.at(-1)?.[0].payload.status).toBe("complete");
  });
});
