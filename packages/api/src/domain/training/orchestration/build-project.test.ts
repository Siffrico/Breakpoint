import { describe, expect, it, vi } from "vitest";

import type { CurriculumPlan } from "../types/training.types";
import type {
  BuildProjectDeps,
  CreateProjectInput,
  ProjectBuildArtifactRecord,
} from "./build-project";
import { buildProjectFromOnboarding } from "./build-project";

const input: CreateProjectInput = {
  projectName: "sat math",
  targetIdentity: "SAT Math test-taker",
  summary: "Solve SAT Math questions accurately and efficiently.",
  outcomes: [
    {
      title: "Algebra",
      result: "Solve SAT Algebra questions accurately across official forms.",
    },
    {
      title: "Advanced Math",
      result:
        "Solve SAT Advanced Math questions accurately across official forms.",
    },
  ],
  startingPoint: {
    tier: "skip_basics",
    reason: "Already solves routine linear equations.",
  },
  understanding: {
    build: "Reach the target SAT Math score.",
    goodMeans: ["accurate", "efficient", "consistent"],
    currentGap:
      "Loses points when familiar algebra appears in unfamiliar forms.",
  },
};

const makeNode = (
  id: string,
  title: string,
  status: "planned" | "ready" | "completed",
  orderIndex: number,
) => ({
  id,
  parentNodeId: "root",
  kind: "outcome" as const,
  title,
  summary: `${title} result`,
  whyItMatters: `${title} result`,
  learningGoal: `${title} result`,
  orderIndex,
  depth: 1,
  positionColumn: orderIndex - 1,
  positionRow: 1,
  status,
  difficultyBands: null,
});

const makeDeps = () => {
  let plan: CurriculumPlan | null = null;
  let active = false;
  let firstUnitId: string | null = null;
  const artifacts = new Map<string, ProjectBuildArtifactRecord>();

  const deps: BuildProjectDeps = {
    getPlanRow: vi.fn(() =>
      Promise.resolve(
        plan
          ? {
              id: plan.id,
              status: active ? "active" : "generating",
              profileVersionId: "profile-1",
            }
          : null,
      ),
    ),
    getActivePlan: vi.fn(() => Promise.resolve(plan)),
    hasUnitContent: vi.fn((nodeId) => Promise.resolve(nodeId === firstUnitId)),
    claimRun: vi.fn(() =>
      Promise.resolve({
        status: "claimed" as const,
        ownershipToken: "owner-1",
      }),
    ),
    heartbeatRun: vi.fn(() => Promise.resolve(true)),
    updateRun: vi.fn(() => Promise.resolve(null)),
    getArtifacts: vi.fn(() => Promise.resolve([...artifacts.values()])),
    saveArtifact: vi.fn(
      (record: Parameters<BuildProjectDeps["saveArtifact"]>[0]) => {
        artifacts.set(record.step, {
          step: record.step,
          status: record.status,
          attempts: record.attempts ?? 0,
          failureKind: record.failureKind ?? null,
          payload: record.payload,
        });
        return Promise.resolve(null);
      },
    ),
    getStartingPoint: vi.fn(() => Promise.resolve(null)),
    ensureShell: vi.fn(() => Promise.resolve({ id: "plan-1" })),
    persistCurriculum: vi.fn(
      ({ blueprint }: Parameters<BuildProjectDeps["persistCurriculum"]>[0]) => {
        const outcomes = blueprint.nodes.filter(
          (node) => node.kind === "outcome",
        );
        plan = {
          id: "plan-1",
          title: blueprint.title,
          summary: blueprint.summary,
          targetIdentity: blueprint.targetIdentity,
          overview: null,
          nodes: [
            {
              id: "root",
              parentNodeId: null,
              kind: "root",
              title: blueprint.targetIdentity,
              summary: blueprint.summary,
              whyItMatters: blueprint.summary,
              learningGoal: blueprint.summary,
              orderIndex: 0,
              depth: 0,
              positionColumn: 0,
              positionRow: 0,
              status: "completed",
              difficultyBands: null,
            },
            ...outcomes.map((outcome, index) =>
              makeNode(
                `outcome-${index + 1}`,
                outcome.title,
                index === 0 ? "ready" : "planned",
                index + 1,
              ),
            ),
          ],
          nextUnitId: null,
        };
        return Promise.resolve();
      },
    ),
    persistOverview: vi.fn(() => Promise.resolve()),
    finalize: vi.fn(() => {
      active = true;
      if (plan) plan = { ...plan, nextUnitId: firstUnitId };
      return Promise.resolve(plan);
    }),
    ensureOutcomeCurriculum: vi.fn(() => Promise.resolve([{}])),
    createOutcomeUnit: vi.fn(() => {
      firstUnitId = "unit-1";
      return Promise.resolve({ id: firstUnitId });
    }),
  };

  return { deps, getPlan: () => plan };
};

const run = (
  deps: BuildProjectDeps,
  projectInput: CreateProjectInput = input,
) =>
  buildProjectFromOnboarding({
    sessionId: "session-1",
    userId: "user-1",
    transcript: [],
    input: projectInput,
    deps,
    onProgress: vi.fn(),
    scheduleBackgroundTask: vi.fn(),
  });

describe("buildProjectFromOnboarding", () => {
  it("reserves behavior signal capacity for the learner's goal and gap", async () => {
    const { deps } = makeDeps();

    await run(deps, {
      ...input,
      understanding: {
        ...input.understanding,
        build: "reach the target SAT Math score",
        goodMeans: [
          "accurate",
          "efficient",
          "consistent",
          "clear",
          "well-supported",
        ],
        currentGap: "loses points on unfamiliar algebra forms",
      },
    });

    const persistedReport = vi.mocked(deps.persistCurriculum).mock.calls[0]?.[0]
      .report;
    expect(persistedReport?.qualityStandards).toEqual([
      "accurate",
      "efficient",
      "consistent",
      "clear",
      "well-supported",
    ]);
    expect(persistedReport?.behaviorSignals).toEqual([
      "Produces work that is accurate.",
      "Produces work that is efficient.",
      "Produces work that is consistent.",
      "Works toward reach the target SAT Math score.",
      "Corrects loses points on unfamiliar algebra forms.",
    ]);
  });

  it("saves the confirmed outcomes without a second curriculum model call", async () => {
    const { deps, getPlan } = makeDeps();

    const result = await run(deps);

    expect(result.success).toBe(true);
    expect(getPlan()?.nodes.filter((node) => node.kind === "outcome")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Algebra", status: "ready" }),
        expect.objectContaining({ title: "Advanced Math", status: "planned" }),
      ]),
    );
  });

  it("compiles only the first outcome before creating the launch unit", async () => {
    const { deps } = makeDeps();

    await run(deps);

    expect(deps.ensureOutcomeCurriculum).toHaveBeenCalledTimes(1);
    expect(deps.ensureOutcomeCurriculum).toHaveBeenCalledWith(
      expect.objectContaining({ outcomeNodeId: "outcome-1" }),
    );
    expect(deps.createOutcomeUnit).toHaveBeenCalledWith(
      expect.objectContaining({ outcomeNodeId: "outcome-1" }),
    );
  });

  it("fails clearly when the first outcome cannot be compiled", async () => {
    const { deps } = makeDeps();
    vi.mocked(deps.ensureOutcomeCurriculum).mockResolvedValue(null);

    const result = await run(deps);

    expect(result).toEqual({
      success: false,
      error: "The first outcome is missing required curriculum data.",
    });
    // Outcome compilation is tracked by TrainingNodeBuild, not the project
    // artifact registry — a failure here must not write a competing status row.
    expect(deps.saveArtifact).not.toHaveBeenCalledWith(
      expect.objectContaining({ step: "outcomeCurriculum" }),
    );
    expect(deps.createOutcomeUnit).not.toHaveBeenCalled();
  });
});
