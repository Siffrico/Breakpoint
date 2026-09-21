import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  UnitDifficultySnapshot,
  UnitReviewChallenge,
} from "@acme/validators";

import type { PersistedUnitRun } from "../education-unit/unit-state";
import type { ResolveScenarioDirectiveDependencies } from "../orchestration/goldilocks";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiMessage } from "./types";
import type { WorkspaceTurnOrchestrationDependencies } from "./workspace-turn-orchestration";
import type { WorkspaceEducationTurnCommit } from "./workspace-turn-persistence";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import {
  runMentorScenarioAgent,
  runMentorTeachingAgent,
} from "../education-unit/mentor-agent";
import { runReviewGradeAgent } from "../education-unit/review-agent";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
import {
  attachPreparedScenario,
  createUnitRun,
  projectUnitRun,
} from "../education-unit/unit-state";
import { createInitialRatingState } from "../engine/rating";
import {
  deriveDefaultBands,
  recordEvaluation,
  resolveScenarioDirective,
} from "../orchestration/goldilocks";
import { unit as preparedUnit } from "../unit-preparation/preparation.fixture";
import { resolveWorkspaceTurn } from "./workspace-turn";
import { runEducationUnitTurn } from "./workspace-turn-orchestration";
import { WorkspaceTurnRepo } from "./workspace-turn-repo";

vi.mock("../education-unit/mentor-agent", () => ({
  runMentorScenarioAgent: vi.fn(),
  runMentorTeachingAgent: vi.fn(),
}));
vi.mock("../education-unit/review-agent", () => ({
  runReviewGradeAgent: vi.fn(),
}));

const unitContext = makeUnitContext();
const format = {
  id: "frq",
  kind: "frq",
  label: "Free response",
  description: "Defend the decision.",
} as const;
const snapshot: UnitDifficultySnapshot = {
  nodeId: "outcome-1",
  directive: {
    intent: "challenge",
    bandOrder: 1,
    supportLevel: "none",
    targetItemRating: 1100,
    targetMisconceptionCode: null,
    reason: "Independent practice.",
    nextProgress: { bandOrder: 1, supportLevel: "none" },
  },
  promptBlock: "Independent practice.",
  ratingSnapshot: "1200 ±80",
  learnerRating: 1200,
  format,
  dialPreset: { steps: [2, 2], withheldGivens: [1, 1], alternatives: [1, 1] },
};
const presentation = {
  assistantMessage:
    "The operating limit changed. Choose the next move and defend it.",
  verifier: {
    kind: "checks" as const,
    checks: [
      {
        criterionId: "derive-under-pressure",
        check: "Derive the move from the new constraint.",
      },
    ],
    scratchpad: "The changed limit must control the decision.",
  },
};
const challenge: UnitReviewChallenge = {
  prompt: presentation.assistantMessage,
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 2,
    withheldGivens: 1,
    embeddedAlternatives: 1,
  },
  contract: {
    version: 1,
    runKind: "education",
    scenarioPromptSummary: presentation.assistantMessage,
    testedCriterionIds: ["derive-under-pressure"],
    verifier: presentation.verifier,
  },
};
const unitNode: CurriculumNode = {
  id: "unit-node",
  parentNodeId: "outcome-1",
  kind: "unit",
  title: "Practice",
  summary: "Practice",
  whyItMatters: "Judgment",
  learningGoal: "Adapt",
  orderIndex: 0,
  depth: 1,
  positionColumn: 0,
  positionRow: 0,
  status: "ready",
  difficultyBands: null,
};
const plan: CurriculumPlan = {
  id: "plan-1",
  title: "Plan",
  summary: "Practice",
  targetIdentity: "Expert",
  overview: null,
  nextUnitId: unitNode.id,
  nodes: [
    {
      ...unitNode,
      id: "outcome-1",
      parentNodeId: null,
      kind: "outcome",
      difficultyBands: [...deriveDefaultBands()],
    },
    unitNode,
  ],
};
const unit = {
  ...preparedUnit,
  id: "unit-1",
  nodeId: unitNode.id,
  title: "Practice",
  unitContext,
  difficultyBands: null,
} as UnitContent;

const harness = (initialRun?: PersistedUnitRun) => {
  let run =
    initialRun ??
    projectUnitRun({
      ...createUnitRun({
        unitId: unit.id,
        sessionId: "session-1",
        userId: "user-1",
        kind: "education",
        unitContext,
        experience: DEFAULT_EDUCATION_EXPERIENCE,
      }),
      difficultySnapshot: snapshot,
      cursor: {
        interactionId: "initial",
        scenarioPrompts: [challenge.prompt],
        errorCodeHistory: [],
        step: { kind: "scenario", attempt: 2, challenge },
      },
    });
  let rating: Awaited<
    ReturnType<ResolveScenarioDirectiveDependencies["loadJobProgress"]>
  > = {
    ratingState: {
      ...createInitialRatingState(),
      rating: 1200,
      ratingDeviation: 80,
    },
    progress: snapshot.directive.nextProgress,
    misconceptions: [],
    recentAttempts: [],
    masteredAt: null,
  };
  const attempts = new Map([["attempt-0", snapshot]]);
  const responses: PhaseResponseRecord[] = [
    {
      id: "response-0",
      sessionId: "session-1",
      unitContentId: unit.id,
      userId: "user-1",
      phase: "ai_education",
      sequence: 0,
      userResponse: "",
      aiResponse: challenge.prompt,
      passed: false,
      score: null,
      metadata: { scenarioAttemptId: "attempt-0" },
      createdAt: new Date(),
    },
  ];
  const commits: WorkspaceEducationTurnCommit[] = [];
  const messages: WorkspaceAiMessage[] = [];
  const background: (() => Promise<void>)[] = [];
  const resolveDifficultyDirective = vi.fn<
    WorkspaceTurnOrchestrationDependencies["resolveDifficultyDirective"]
  >((input) =>
    resolveScenarioDirective({
      ...input,
      scenarioFormat: format,
      deps: {
        loadJobProgress: () => Promise.resolve(rating),
        listRecentPredictions: () => Promise.resolve([]),
      },
    }),
  );
  const savePendingChallenge = vi.fn<
    NonNullable<WorkspaceTurnOrchestrationDependencies["savePendingChallenge"]>
  >(async (input) => {
    run = await Effect.runPromise(
      attachPreparedScenario({
        run: { ...run, difficultySnapshot: input.difficultySnapshot },
        challenge: input.challenge,
      }),
    );
  });
  const deps: WorkspaceTurnOrchestrationDependencies = {
    getActivePlan: () => Promise.resolve(plan),
    getUnitByNodeId: () => Promise.resolve(unit),
    getUnitRun: () => Promise.resolve(run),
    getPhaseResponses: () => Promise.resolve(responses),
    listMemories: () => Promise.resolve([]),
    listUnitMessages: () => Promise.resolve(messages),
    appendMessage: () => Promise.resolve(null),
    claimWorkspaceTurn: () =>
      Promise.resolve({ status: "claimed", claimedAt: new Date() }),
    claimWorkspaceUnitLease: () => Promise.resolve(run),
    markWorkspaceTurnFailed: vi.fn(() => Promise.resolve()),
    releaseWorkspaceUnitLease: vi.fn(() => Promise.resolve()),
    resolveDifficultyDirective,
    savePendingChallenge,
    scheduleBackgroundTask: (task) => {
      background.push(task);
    },
    getScenarioAttempt: ({ scenarioAttemptId }) =>
      Promise.resolve({ id: scenarioAttemptId, solvePresentedAt: new Date() }),
  };
  const layer = Layer.succeed(WorkspaceTurnRepo, {
    commitEducationTurn: (input) =>
      Effect.promise(async () => {
        if (input.ratingEvaluation) {
          await recordEvaluation({
            ...input.ratingEvaluation,
            deps: {
              getScenarioAttempt: ({ scenarioAttemptId }) => {
                const difficulty = attempts.get(scenarioAttemptId);
                return Promise.resolve(
                  difficulty
                    ? {
                        id: scenarioAttemptId,
                        directiveJson: difficulty.directive,
                        itemRating: difficulty.directive.targetItemRating,
                      }
                    : null,
                );
              },
              loadJobProgress: () => Promise.resolve(rating),
              saveEvaluationResult: ({ result, nextProgress, masteredAt }) => {
                rating = {
                  ratingState: result.ratingState,
                  progress: nextProgress,
                  misconceptions: result.misconceptions,
                  recentAttempts: [...rating.recentAttempts, result.attempt],
                  masteredAt,
                };
                return Promise.resolve();
              },
            },
          });
        }
        commits.push(input);
        run = input.nextRun;
        const attemptId = `attempt-${commits.length}`;
        if (input.scenarioPresentation)
          attempts.set(attemptId, input.scenarioPresentation.snapshot);
        if (input.phaseResponse)
          responses.push({
            sessionId: "session-1",
            unitContentId: unit.id,
            userId: "user-1",
            phase: "ai_education",
            userResponse: input.phaseResponse.userResponse,
            aiResponse: input.phaseResponse.aiResponse ?? null,
            passed: input.phaseResponse.passed ?? null,
            score: input.phaseResponse.score ?? null,
            createdAt: new Date(),
            id: `response-${commits.length}`,
            sequence: commits.length,
            metadata: {
              ...input.phaseResponse.metadata,
              ...(input.scenarioPresentation
                ? { scenarioAttemptId: attemptId }
                : {}),
            },
          });
        const assistantMessage: WorkspaceAiMessage = {
          ...input.assistantMessage,
          sequence: messages.length,
          metadata: input.assistantMessage.metadata ?? null,
        };
        messages.push(assistantMessage);
        return { assistantMessage };
      }),
  });
  const turn = async (
    action: "submit_answer" | "advance_pass" | "start_unit",
  ) => {
    const resolved = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps,
    });
    return Effect.runPromise(
      runEducationUnitTurn({
        sessionId: "session-1",
        userId: "user-1",
        turnId: `turn-${commits.length}`,
        turnLeaseId: "lease",
        interactionId: run.cursor.interactionId,
        action,
        message: action === "submit_answer" ? "Reuse the old move." : "",
        turn: resolved,
        deps,
      }).pipe(Effect.provide(layer)),
    );
  };
  return {
    turn,
    layer,
    deps,
    commits,
    background,
    resolveDifficultyDirective,
    savePendingChallenge,
    getRun: () => run,
    getRating: () => rating,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runMentorScenarioAgent).mockImplementation(() =>
    Effect.succeed({ object: presentation }),
  );
  vi.mocked(runMentorTeachingAgent).mockImplementation(() =>
    Effect.succeed({
      object: {
        assistantMessage: "Read the new limit before reusing the old move.",
        scratchpad: "Repair the gap.",
        preparedScenario: presentation,
      },
    }),
  );
  vi.mocked(runReviewGradeAgent).mockImplementation(() =>
    Effect.succeed({
      object: {
        closingMessage: null,
        diagnosis: {
          quote: "Reuse the old move",
          hypothesis: "You ignored the new limit.",
          explanation: "The old move exceeds it.",
        },
        causeType: "missed-limit",
        errorCodes: ["constraint-blindness"],
        scratchpad: "The answer ignores the limit.",
        dimensionResults: [
          {
            dimensionId: "derive-under-pressure",
            met: false,
            evidence: "old move",
            missing: "Account for the new limit.",
          },
        ],
      },
    }),
  );
});

describe("Goldilocks retry contract", () => {
  it("commits prepared opening teaching without another model call or practice evidence", async () => {
    const initial = createUnitRun({
      unitId: unit.id,
      sessionId: "session-1",
      userId: "user-1",
      kind: "education",
      unitContext,
      experience: DEFAULT_EDUCATION_EXPERIENCE,
    });
    const h = harness(initial);
    h.deps.prepareOpening = vi.fn(() =>
      Effect.succeed("Prepared teaching about the changed limit."),
    );
    const result = await h.turn("start_unit");
    expect(result.assistantMessage.content).toBe(
      "Prepared teaching about the changed limit.",
    );
    expect(runMentorTeachingAgent).not.toHaveBeenCalled();
    expect(runReviewGradeAgent).not.toHaveBeenCalled();
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0]?.ratingEvaluation).toBeNull();
    expect(h.commits[0]?.scenarioPresentation).toBeNull();
    expect(h.commits[0]?.knowledgeCheckOff).toBeNull();
    expect(h.getRun().mode).toBe("learning");
    expect(h.getRun().cursor.interactionId).not.toBe(
      initial.cursor.interactionId,
    );
  });
  it("rejects a delayed distinct request after another answer advances the cursor", async () => {
    const h = harness();
    const staleTurn = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: h.deps,
    });
    await h.turn("submit_answer");
    const committedRun = h.getRun();
    const committedRating = h.getRating();
    vi.mocked(runReviewGradeAgent).mockClear();

    await expect(
      Effect.runPromise(
        runEducationUnitTurn({
          sessionId: "session-1",
          userId: "user-1",
          turnId: "delayed-answer",
          turnLeaseId: "delayed-lease",
          interactionId: staleTurn.unitRun.cursor.interactionId,
          action: "submit_answer",
          message: "An answer to the old question.",
          turn: staleTurn,
          deps: h.deps,
        }).pipe(Effect.provide(h.layer)),
      ),
    ).rejects.toMatchObject({
      _tag: "WorkspaceInputError",
    });

    expect(runReviewGradeAgent).not.toHaveBeenCalled();
    expect(h.commits).toHaveLength(1);
    expect(h.getRun()).toEqual(committedRun);
    expect(h.getRating()).toEqual(committedRating);
    expect(h.deps.releaseWorkspaceUnitLease).toHaveBeenCalledWith({
      sessionId: "session-1",
      unitContentId: unit.id,
      leaseId: "delayed-lease",
    });
  });

  it("uses a scenario prepared after resolution but before the unit lease", async () => {
    const h = harness();
    await h.turn("submit_answer");
    const resolved = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: h.deps,
    });
    await h.background[0]?.();
    vi.mocked(runMentorScenarioAgent).mockClear();

    const result = await Effect.runPromise(
      runEducationUnitTurn({
        sessionId: "session-1",
        userId: "user-1",
        turnId: "prepared-advance",
        turnLeaseId: "prepared-lease",
        interactionId: resolved.unitRun.cursor.interactionId,
        action: "advance_pass",
        message: "",
        turn: resolved,
        deps: h.deps,
      }).pipe(Effect.provide(h.layer)),
    );

    expect(runMentorScenarioAgent).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toBe(presentation.assistantMessage);
    expect(h.getRun().cursor.step.kind).toBe("scenario");
  });

  it("refreshes after each rated failure and grades against the presented directive", async () => {
    const h = harness();
    await h.turn("submit_answer");
    expect(h.resolveDifficultyDirective).not.toHaveBeenCalled();
    expect(h.getRating().recentAttempts[0]?.offeredSupport).toBe("none");
    expect(h.getRun().difficultySnapshot).toBeNull();
    await h.turn("advance_pass");
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive,
    ).toMatchObject({
      intent: "repair",
      supportLevel: "guided",
      targetMisconceptionCode: "constraint-blindness",
    });
    expect(
      vi.mocked(runMentorScenarioAgent).mock.calls.at(-1)?.[0].context,
    ).toContain("constraint-blindness");
    await h.turn("submit_answer");
    expect(h.resolveDifficultyDirective).toHaveBeenCalledTimes(1);
    expect(h.getRating().recentAttempts.at(-1)?.offeredSupport).toBe("guided");
    await h.turn("advance_pass");
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive.supportLevel,
    ).toBe("worked_example");
  });

  it("prepares retries from committed evidence and reuses their matching snapshot", async () => {
    const h = harness();
    await h.turn("submit_answer");
    await h.background[0]?.();
    expect(h.savePendingChallenge).toHaveBeenCalledOnce();
    const prepared = h.savePendingChallenge.mock.calls[0]?.[0];
    expect(prepared?.difficultySnapshot.directive).toMatchObject({
      intent: "repair",
      supportLevel: "guided",
    });
    expect(h.getRun().difficultySnapshot).toEqual(prepared?.difficultySnapshot);
    expect(h.getRun().cursor.step).toMatchObject({
      preparedScenario: prepared?.challenge,
    });
    await h.turn("advance_pass");
    expect(h.resolveDifficultyDirective).toHaveBeenCalledOnce();
    expect(runMentorScenarioAgent).toHaveBeenCalledOnce();
    expect(h.commits.at(-1)?.scenarioPresentation?.snapshot).toEqual(
      prepared?.difficultySnapshot,
    );
  });

  it("refreshes the mentor's difficulty when the retry requires re-teaching", async () => {
    const h = harness();
    const grade = vi.mocked(runReviewGradeAgent).getMockImplementation();
    if (!grade) throw new Error("Missing grade fixture.");
    vi.mocked(runReviewGradeAgent).mockImplementation((input) =>
      grade(input).pipe(
        Effect.map(({ object }) => ({
          object: { ...object, causeType: "never-learned-it" as const },
        })),
      ),
    );
    await h.turn("submit_answer");
    expect(h.background).toHaveLength(0);
    await h.turn("advance_pass");
    expect(runMentorTeachingAgent).toHaveBeenCalledOnce();
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive,
    ).toMatchObject({
      intent: "repair",
      supportLevel: "guided",
      targetMisconceptionCode: "constraint-blindness",
    });
  });

  it("falls back to fresh foreground generation when background resolution fails", async () => {
    const h = harness();
    await h.turn("submit_answer");
    h.resolveDifficultyDirective.mockRejectedValueOnce(
      new Error("Rating read unavailable"),
    );
    await h.background[0]?.();
    expect(h.savePendingChallenge).not.toHaveBeenCalled();
    expect(h.getRun().difficultySnapshot).toBeNull();
    await h.turn("advance_pass");
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive.intent,
    ).toBe("repair");
  });

  it("keeps a failed difficulty read retryable without presenting a stale scenario", async () => {
    const h = harness();
    await h.turn("submit_answer");
    h.resolveDifficultyDirective.mockRejectedValueOnce(
      new Error("Rating read unavailable"),
    );
    await expect(h.turn("advance_pass")).rejects.toMatchObject({
      _tag: "RatingEvidenceError",
    });
    expect(h.commits).toHaveLength(1);
    expect(runMentorScenarioAgent).not.toHaveBeenCalled();
    expect(h.getRun().difficultySnapshot).toBeNull();
    expect(h.deps.releaseWorkspaceUnitLease).toHaveBeenCalled();
    await h.turn("advance_pass");
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive.intent,
    ).toBe("repair");
  });
});
