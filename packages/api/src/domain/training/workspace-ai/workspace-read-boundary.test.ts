import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedUnitRun } from "../education-unit/unit-state";
import type { RecallCandidate } from "../policies/recall-decay";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceTurnOrchestrationDependencies } from "./workspace-turn-orchestration";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { createUnitRun } from "../education-unit/unit-state";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { getAiWorkspaceWorkflow } from "../workflows/get-ai-workspace-workflow";
import { resolveWorkspaceTurn } from "./workspace-turn";
import { runEducationUnitTurn } from "./workspace-turn-orchestration";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

const readyNode = {
  id: "node-1",
  parentNodeId: "cluster-1",
  kind: "unit",
  title: "Unit",
  summary: "Summary",
  whyItMatters: "Why",
  learningGoal: "Goal",
  orderIndex: 1,
  depth: 1,
  positionColumn: 0,
  positionRow: 1,
  status: "ready",
  difficultyBands: null,
} satisfies CurriculumNode;

const plan = { nodes: [readyNode] } as CurriculumPlan;

const completedNode = {
  ...readyNode,
  id: "node-recall",
  title: "Completed unit",
  orderIndex: 0,
  status: "completed",
} satisfies CurriculumNode;
const abilityNode = {
  ...completedNode,
  id: "ability-1",
  parentNodeId: null,
  kind: "ability",
  title: "Ability",
} satisfies CurriculumNode;
const skillNode = {
  ...completedNode,
  id: "cluster-1",
  parentNodeId: abilityNode.id,
  kind: "skill",
  title: "Skill",
} satisfies CurriculumNode;
const recallPlan = {
  id: "plan-1",
  nodes: [abilityNode, skillNode, completedNode, readyNode],
} as CurriculumPlan;
const masteryContract = {
  version: 1 as const,
  dimensions: [
    {
      id: "stable-boundaries",
      name: "Use stable boundaries",
      description: "Keep responsibility at the canonical boundary.",
      passSignals: ["Chooses the canonical boundary"],
      failSignals: ["Duplicates responsibility"],
      surrogateTraps: ["Names the boundary without using it"],
    },
  ],
};
const recallUnit = {
  id: "unit-content-recall",
  nodeId: completedNode.id,
  unitMasteryContract: masteryContract,
} as UnitContent;
const activeUnit = {
  id: "unit-content-active",
  nodeId: readyNode.id,
  unitMasteryContract: masteryContract,
} as UnitContent;
const recallRun = createUnitRun({
  unitId: recallUnit.id,
  sessionId: "session-1",
  userId: "user-1",
  kind: "recall",
  masteryContract,
  experience: DEFAULT_EDUCATION_EXPERIENCE,
});
const recallCandidate = {
  id: "entry-1",
  questionId: "question-1",
  skillNodeId: "cluster-1",
  questionOrderIndex: 0,
  label: "Stable boundaries",
  content: "Keep responsibility at the canonical boundary.",
  checkedAt: new Date("2026-01-01T00:00:00Z"),
  strength: 0,
  // A failed verdict just reset the decay clock, so this is deliberately not due.
  lastReinforcedAt: new Date("2026-07-05T00:00:00Z"),
  evidenceNodeId: completedNode.id,
  orderIndex: 0,
} satisfies RecallCandidate;
const recallPresentation = {
  id: "response-1",
  unitContentId: recallUnit.id,
  sessionId: "session-1",
  userId: "user-1",
  phase: "ai_recall" as const,
  sequence: 0,
  userResponse: "Start checkpoint",
  aiResponse: "Scenario",
  passed: false,
  score: null,
  metadata: {
    aiEducationStage: "review" as const,
    recallEntryIds: [recallCandidate.id],
  },
  createdAt: new Date("2026-07-05T00:00:00Z"),
};

const noRecallProjectionDeps = {
  getRecallCandidatesByIds: () => Promise.resolve([]),
  getMostOverdueRecallCandidate: () => Promise.resolve(null),
  getRecallCompanionCandidate: () => Promise.resolve(null),
};

const recallDeps = (knowledgeIds: string[] = [recallCandidate.id]) => ({
  getActivePlan: () => Promise.resolve(recallPlan),
  getPhaseResponses: (unitContentId: string) =>
    Promise.resolve(
      unitContentId === recallUnit.id
        ? [
            {
              ...recallPresentation,
              metadata: {
                ...recallPresentation.metadata,
                recallEntryIds: knowledgeIds,
              },
            },
          ]
        : [],
    ),
  getUnitRun: () => Promise.resolve(null),
  getInFlightRecallRun: () => Promise.resolve(recallRun),
  retireInFlightRecallRun: vi.fn().mockResolvedValue(undefined),
  getUnitByNodeId: (nodeId: string) =>
    Promise.resolve(nodeId === completedNode.id ? recallUnit : activeUnit),
  getRecallCandidatesByIds: () => Promise.resolve([recallCandidate]),
  getMostOverdueRecallCandidate: () => Promise.resolve(null),
  getRecallCompanionCandidate: () => Promise.resolve(null),
});

describe("workspace read preparation boundary", () => {
  it("getAiWorkspaceWorkflow reports a missing unit without preparing it", async () => {
    const prepareUnit = vi.fn().mockResolvedValue(undefined);
    const scheduleBackgroundTask = vi.fn();
    const upsertUnitRun = vi.fn();
    const stalePreparationDeps = {
      prepareUnit,
      scheduleBackgroundTask,
      upsertUnitRun,
    };
    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(null),
        ...noRecallProjectionDeps,
        // Deliberately pass the former capabilities to guard against a
        // regression even if callers retain stale dependency objects.
        ...stalePreparationDeps,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kind: "preparing",
        nodeId: expect.any(String) as string,
      });
    }
    expect(prepareUnit).not.toHaveBeenCalled();
    expect(scheduleBackgroundTask).not.toHaveBeenCalled();
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("resolveWorkspaceTurn reports a missing unit without prewarming it", async () => {
    const prewarmWorkspaceUnit = vi.fn().mockResolvedValue(undefined);
    const upsertUnitRun = vi.fn();
    const stalePreparationDeps = { prewarmWorkspaceUnit, upsertUnitRun };

    await expect(
      resolveWorkspaceTurn({
        sessionId: "session-1",
        deps: {
          getActivePlan: () => Promise.resolve(plan),
          getPhaseResponses: () => Promise.resolve([]),
          getUnitRun: () => Promise.resolve(null),
          getInFlightRecallRun: () => Promise.resolve(null),
          retireInFlightRecallRun: () => Promise.resolve(),
          getUnitByNodeId: () => Promise.resolve(null),
          ...noRecallProjectionDeps,
          ...stalePreparationDeps,
        },
      }),
    ).rejects.toBeInstanceOf(UnitNotReadyError);

    expect(prewarmWorkspaceUnit).not.toHaveBeenCalled();
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("derives an initial run in memory when the run row is missing", async () => {
    const unit = {
      id: "unit-content-1",
      nodeId: readyNode.id,
      unitMasteryContract: masteryContract,
    } as UnitContent;
    const upsertUnitRun = vi.fn();

    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(plan),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(unit),
        ...noRecallProjectionDeps,
        ...{ upsertUnitRun },
      },
    });

    expect(turn.unitRun).toEqual(
      createUnitRun({
        unitId: unit.id,
        sessionId: "session-1",
        kind: "education",
        masteryContract,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
    );
    expect(turn.state).toMatchObject({
      mode: "education_unit",
      educationStage: "learning",
      workflowId: "breakpoint-mentor@1",
    });
    expect(upsertUnitRun).not.toHaveBeenCalled();
  });

  it("snapshots the account customization onto a new unit run", async () => {
    const unit = {
      id: "unit-content-1",
      nodeId: readyNode.id,
      unitMasteryContract: masteryContract,
    } as UnitContent;
    const customizedExperience = {
      ...DEFAULT_EDUCATION_EXPERIENCE,
      snapshot: { id: "customized-breakpoint-mentor", version: 4 },
      main: { instructions: "Use the customized mentor behavior." },
    };

    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: {
        getEducationExperience: () => Promise.resolve(customizedExperience),
        getActivePlan: () => Promise.resolve(plan),
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(unit),
        ...noRecallProjectionDeps,
      },
    });

    expect(turn.unitRun.experience).toMatchObject({
      id: "customized-breakpoint-mentor",
      version: 4,
      main: { instructions: "Use the customized mentor behavior." },
    });
    expect(turn.state.workflowId).toBe("customized-breakpoint-mentor@4");
  });

  it("reuses an authorized plan without reading it again", async () => {
    const getActivePlan = vi.fn();
    const unit = {
      id: "unit-content-1",
      nodeId: readyNode.id,
      unitMasteryContract: masteryContract,
    } as UnitContent;

    await resolveWorkspaceTurn({
      sessionId: "session-1",
      authorizedPlan: plan,
      deps: {
        getActivePlan,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(unit),
        ...noRecallProjectionDeps,
      },
    });

    expect(getActivePlan).not.toHaveBeenCalled();
  });
});

describe("durable recall projection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes a failed recall even after its decay clock was reset", async () => {
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: recallDeps(),
    });

    expect(turn.state).toMatchObject({
      promptKind: "recall",
      recallUnitId: completedNode.id,
      activeUnitId: null,
      workflowId: "breakpoint-mentor@1",
      educationStage: "review",
    });
    expect(turn.unitRun).toBe(recallRun);
    expect(turn.recallFocus?.primary.id).toBe(recallCandidate.id);
  });

  it("persists and resumes the fresh recall target after presenting its review", async () => {
    const phaseResponses: PhaseResponseRecord[] = [];
    let inFlightRecallRun: PersistedUnitRun | null = null;
    const activeRun = {
      ...createUnitRun({
        unitId: activeUnit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "education",
        masteryContract,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      mode: "complete" as const,
    };
    const deps: WorkspaceTurnOrchestrationDependencies = {
      getActivePlan: () => Promise.resolve(recallPlan),
      getPhaseResponses: (unitContentId: string) =>
        Promise.resolve(unitContentId === recallUnit.id ? phaseResponses : []),
      getUnitRun: (_sessionId: string, unitContentId: string) =>
        Promise.resolve(unitContentId === activeUnit.id ? activeRun : null),
      getInFlightRecallRun: () => Promise.resolve(inFlightRecallRun),
      retireInFlightRecallRun: () => Promise.resolve(),
      getUnitByNodeId: (nodeId: string) =>
        Promise.resolve(nodeId === completedNode.id ? recallUnit : activeUnit),
      getRecallCandidatesByIds: () => Promise.resolve([recallCandidate]),
      getMostOverdueRecallCandidate: () =>
        Promise.resolve(inFlightRecallRun ? null : recallCandidate),
      getRecallCompanionCandidate: () => Promise.resolve(null),
      claimWorkspaceTurn: () =>
        Promise.resolve({ status: "claimed" as const, claimedAt: new Date() }),
      appendMessage: () => Promise.resolve(null),
      listUnitMessages: () => Promise.resolve([]),
      markWorkspaceTurnFailed: () => Promise.resolve(),
      claimWorkspaceUnitLease: () => Promise.resolve(true),
      releaseWorkspaceUnitLease: () => Promise.resolve(),
      listMemories: () => Promise.resolve([]),
      resolveDifficultyDirective: () =>
        Promise.resolve({
          directive: {
            intent: "probe",
            bandOrder: 0,
            supportLevel: "none",
            targetItemRating: 1200,
            targetMisconceptionCode: null,
            reason: "Probe durable recall.",
            nextProgress: { bandOrder: 0, supportLevel: "none" },
          },
          promptBlock: "Probe durable recall.",
          ratingSnapshot: "rating snapshot",
          learnerRating: 1200,
          format: {
            id: "frq",
            label: "Free response",
            kind: "frq",
            description: "Explain the decision.",
          },
          dialPreset: {
            steps: [3, 3],
            withheldGivens: [1, 1],
            alternatives: [2, 2],
          },
        }),
      runUnitTurn: ({ run }) =>
        Effect.succeed({
          assistantMessage: "Defend the canonical boundary under pressure.",
          nextRun: {
            ...run,
            activeReviewChallenge: {
              prompt: "Defend the canonical boundary under pressure.",
              difficultyVector: {
                formatId: "frq",
                reasoningPathSteps: 3,
                withheldGivens: 1,
                embeddedAlternatives: 2,
              },
              contract: {
                version: 1 as const,
                runKind: "recall",
                scenarioPromptSummary: "Choose and defend the next move.",
                testedDimensions: [
                  {
                    dimensionId: "stable-boundaries",
                    promptRole: "Test transfer.",
                    expectedStrongMoves: ["Defends the canonical boundary"],
                    acceptableVariants: [],
                    commonWrongMoves: ["Duplicates responsibility"],
                    scoreBands: {
                      strong: "Defends the boundary causally.",
                      partial: "Names the boundary without a causal defense.",
                      weak: "Duplicates responsibility.",
                    },
                  },
                ],
                learnerVisibleCriteria: ["Choose and defend one move."],
                evaluatorNotes: [],
              },
            },
          },
          actor: "reviewer" as const,
          completedCapabilityId: null,
          reviewGrade: null,
          ratingWrite: null,
          presentedReviewChallenge: true,
          settledPass: null,
        }),
    };

    const freshTurn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });
    expect(freshTurn.recallFocus?.primary.id).toBe(recallCandidate.id);

    await Effect.runPromise(
      runEducationUnitTurn({
        sessionId: "session-1",
        userId: "user-1",
        turnId: "turn-1",
        turnLeaseId: "lease-1",
        message: "Start recall",
        turn: freshTurn,
        deps,
      }).pipe(
        Effect.provide(
          Layer.succeed(WorkspaceTurnRepo, {
            commitEducationTurn: (input) =>
              Effect.sync(() => {
                inFlightRecallRun = input.nextRun;
                phaseResponses.push({
                  id: "response-1",
                  unitContentId: input.phaseResponse.unitContentId,
                  sessionId: input.phaseResponse.sessionId,
                  userId: input.phaseResponse.userId,
                  phase: input.phaseResponse.phase,
                  sequence: input.phaseResponse.sequence ?? 0,
                  userResponse: input.phaseResponse.userResponse,
                  aiResponse: input.phaseResponse.aiResponse ?? null,
                  passed: input.phaseResponse.passed ?? null,
                  score: input.phaseResponse.score ?? null,
                  metadata: input.phaseResponse.metadata ?? null,
                  createdAt: new Date(),
                });
                return {
                  assistantMessage: {
                    role: "assistant",
                    content: input.assistantMessage.content,
                    sequence: 1,
                    slot: "education_unit",
                    unitId: completedNode.id,
                    turnId: "turn-1",
                    metadata: null,
                  },
                };
              }),
          }),
        ),
      ),
    );

    const resumedTurn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });
    expect(phaseResponses[0]?.metadata?.recallEntryIds).toEqual([
      recallCandidate.id,
    ]);
    expect(resumedTurn.recallFocus?.primary.id).toBe(recallCandidate.id);
    expect(resumedTurn.unitRun.activeReviewChallenge?.prompt).toBe(
      "Defend the canonical boundary under pressure.",
    );
  });

  it("resolves the unfinished recall after a committed turn", async () => {
    const { getActivePlan: _getActivePlan, ...deps } = recallDeps();
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      authorizedPlan: recallPlan,
      deps: {
        ...deps,
        getActivePlan: () => Promise.resolve(recallPlan),
      },
    });

    expect(turn.state).toMatchObject({
      recallUnitId: completedNode.id,
      activeUnitId: null,
    });
  });

  it("falls through when a stale recall target cannot be reconstructed", async () => {
    const deps = recallDeps(["deleted-entry"]);
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });

    expect(turn.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      workflowId: "breakpoint-mentor@1",
    });
    expect(deps.retireInFlightRecallRun).toHaveBeenCalledWith(
      "session-1",
      recallRun.unitId,
    );
  });

  it("still falls through when retiring the stale recall fails", async () => {
    const deps = {
      ...recallDeps(["deleted-entry"]),
      retireInFlightRecallRun: vi
        .fn()
        .mockRejectedValue(new Error("db unavailable")),
    };
    const turn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });

    expect(turn.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      workflowId: "breakpoint-mentor@1",
    });
  });
});

describe("workspace view reads", () => {
  const readyView = (
    result: Awaited<ReturnType<typeof getAiWorkspaceWorkflow>>,
  ) => {
    if (!result.success) {
      throw new Error(`expected success, got ${String(result.error)}`);
    }
    if (result.data.kind !== "ready") {
      throw new Error(`expected ready workspace, got ${result.data.kind}`);
    }
    return result.data.workspace;
  };

  const unitMessage = (unitId: string, content: string) => ({
    role: "assistant" as const,
    content,
    sequence: 0,
    slot: "education_unit",
    unitId,
    turnId: null,
    metadata: null,
  });

  it("reads only the active unit's transcript, never the whole session", async () => {
    const listUnitMessages = vi
      .fn()
      .mockResolvedValue([unitMessage(readyNode.id, "Scenario prompt")]);

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(recallPlan),
        listUnitMessages,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(activeUnit),
        // Nothing decayed: the active unit is the live chat.
        ...noRecallProjectionDeps,
      },
    });

    const view = readyView(result);
    expect(view.projectComplete).toBe(false);
    expect(view.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
      educationStage: "learning",
    });
    expect(view.messages).toEqual([
      unitMessage(readyNode.id, "Scenario prompt"),
    ]);
    expect(view.introMessage).toBeNull();
    expect(listUnitMessages).toHaveBeenCalledWith("session-1", readyNode.id);
  });

  it("surfaces an in-flight recall with its transcript and intro", async () => {
    const listUnitMessages = vi
      .fn()
      .mockImplementation((_sessionId: string, unitId: string) =>
        Promise.resolve([unitMessage(unitId, `Chat for ${unitId}`)]),
      );
    const getRecallCandidatesByIds = vi
      .fn()
      .mockResolvedValue([recallCandidate]);
    const getMostOverdueRecallCandidate = vi.fn().mockResolvedValue(null);

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        ...recallDeps(),
        getRecallCandidatesByIds,
        getMostOverdueRecallCandidate,
        listUnitMessages,
      },
    });

    const view = readyView(result);
    expect(view.state).toMatchObject({
      promptKind: "recall",
      recallUnitId: completedNode.id,
      activeUnitId: null,
      workflowId: "breakpoint-mentor@1",
      educationStage: "review",
    });
    expect(view.messages).toEqual([
      unitMessage(completedNode.id, `Chat for ${completedNode.id}`),
    ]);
    expect(view.introMessage).toMatchObject({ helper: "Recall" });
    // A recall interlude has no scenario plan of its own.
    expect(listUnitMessages).toHaveBeenCalledWith(
      "session-1",
      completedNode.id,
    );
    expect(getRecallCandidatesByIds).toHaveBeenCalledWith("plan-1", [
      recallCandidate.id,
    ]);
    expect(getMostOverdueRecallCandidate).not.toHaveBeenCalled();
  });

  it("locks unit advancement while a due recall is live", async () => {
    const activeMasteredRun = {
      ...createUnitRun({
        unitId: activeUnit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "education",
        masteryContract,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      mode: "complete" as const,
    } satisfies PersistedUnitRun;
    const getMostOverdueRecallCandidate = vi
      .fn()
      .mockResolvedValue(recallCandidate);
    const getRecallCompanionCandidate = vi.fn().mockResolvedValue(null);

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(recallPlan),
        listUnitMessages: () => Promise.resolve([]),
        getPhaseResponses: () => Promise.resolve([recallPresentation]),
        getUnitRun: () => Promise.resolve(activeMasteredRun),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: (nodeId: string) =>
          Promise.resolve(
            nodeId === completedNode.id ? recallUnit : activeUnit,
          ),
        getRecallCandidatesByIds: () => Promise.resolve([]),
        getMostOverdueRecallCandidate,
        getRecallCompanionCandidate,
      },
    });

    const view = readyView(result);
    expect(view.state).toMatchObject({
      recallUnitId: completedNode.id,
      activeUnitId: null,
    });
    expect(view.unitAdvanceGate).toEqual({ status: "locked" });
    expect(getMostOverdueRecallCandidate).toHaveBeenCalledOnce();
    expect(getRecallCompanionCandidate).toHaveBeenCalledWith(
      recallCandidate.skillNodeId,
      recallCandidate,
      expect.any(Date),
    );
  });

  it("does not repair stale recall state from the read workflow", async () => {
    const deps = {
      ...recallDeps(["deleted-entry"]),
      getRecallCandidatesByIds: () => Promise.resolve([]),
      listUnitMessages: () => Promise.resolve([]),
    };

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps,
    });

    const view = readyView(result);
    expect(view.state).toMatchObject({
      activeUnitId: readyNode.id,
      recallUnitId: null,
    });
    expect(deps.retireInFlightRecallRun).not.toHaveBeenCalled();
  });

  it("does not hydrate a transcript when no turn is runnable", async () => {
    const completedOnlyPlan = {
      id: "plan-1",
      nodes: [completedNode],
    } as CurriculumPlan;
    const listUnitMessages = vi.fn().mockResolvedValue([]);

    const result = await getAiWorkspaceWorkflow({
      sessionId: "session-1",
      deps: {
        getActivePlan: () => Promise.resolve(completedOnlyPlan),
        listUnitMessages,
        getPhaseResponses: () => Promise.resolve([]),
        getUnitRun: () => Promise.resolve(null),
        getInFlightRecallRun: () => Promise.resolve(null),
        retireInFlightRecallRun: () => Promise.resolve(),
        getUnitByNodeId: () => Promise.resolve(null),
        ...noRecallProjectionDeps,
      },
    });

    const view = readyView(result);
    expect(view.state).toBeNull();
    expect(view.projectComplete).toBe(true);
    expect(view.messages).toEqual([]);
    expect(listUnitMessages).not.toHaveBeenCalled();
  });
});
