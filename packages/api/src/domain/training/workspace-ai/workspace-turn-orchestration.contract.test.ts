import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  UnitDifficultySnapshot,
  UnitPart,
  UnitStep,
  WorkspaceTurnAction,
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
  runMentorLessonAgent,
  runMentorPartsAgent,
} from "../education-unit/mentor-agent";
import { runReviewGradeAgent } from "../education-unit/review-agent";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
import { createUnitRun, projectUnitRun } from "../education-unit/unit-state";
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
  runMentorLessonAgent: vi.fn(),
  runMentorPartsAgent: vi.fn(),
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
const CRITERION = "derive-under-pressure";
const vector = {
  formatId: "frq",
  reasoningPathSteps: 2,
  withheldGivens: 1,
  embeddedAlternatives: 1,
};
const verifier = {
  kind: "checks" as const,
  checks: [
    { criterionId: CRITERION, check: "Derive the move from the new constraint." },
  ],
  scratchpad: "The changed limit must control the decision.",
};
const part = (graded: boolean): UnitPart => ({
  question: "The operating limit changed. Choose the next move and defend it.",
  criterionIds: [CRITERION],
  verifier,
  presentedAt: new Date().toISOString(),
  result: graded
    ? {
        met: true,
        criterionResults: [
          { dimensionId: CRITERION, met: true, evidence: "limit", missing: null },
        ],
        feedback: "Right.",
        hypothesis: null,
        causeType: null,
        errorCodes: [],
      }
    : null,
});
/** A lesson, a finished learn round, and a rated exam waiting for its answer. */
const examOnBoard: UnitStep[] = [
  { kind: "teach", lesson: "Read the limit.", explanation: "The limit decides." },
  {
    kind: "round",
    spec: {
      label: "learn",
      pacing: "part_by_part",
      partCount: 3,
      rated: false,
      mustPass: false,
      criterionIds: [CRITERION],
    },
    narrative: "An earlier line.",
    difficultyVector: vector,
    parts: [part(true), part(true), part(true)],
  },
  {
    kind: "round",
    spec: {
      label: "exam",
      pacing: "all_at_once",
      partCount: 3,
      rated: true,
      mustPass: true,
      criterionIds: [CRITERION],
    },
    narrative: "The operating limit changed.",
    difficultyVector: vector,
    parts: [part(false), part(false), part(false)],
  },
];
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
        steps: examOnBoard,
        outcome: null,
        errorCodeHistory: [],
        prepared: null,
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
      aiResponse: "The exam.",
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
  const savePreparedStep = vi.fn<
    NonNullable<WorkspaceTurnOrchestrationDependencies["savePreparedStep"]>
  >((input) => {
    if (run.cursor.interactionId === input.prepared.interactionId) {
      run = projectUnitRun({
        ...run,
        difficultySnapshot: input.difficultySnapshot,
        cursor: { ...run.cursor, prepared: input.prepared },
      });
    }
    return Promise.resolve();
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
    savePreparedStep,
    scheduleBackgroundTask: (task) => {
      background.push(task);
    },
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
  const turn = async (action: WorkspaceTurnAction) => {
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
    savePreparedStep,
    getRun: () => run,
    getRating: () => rating,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runMentorLessonAgent).mockImplementation(() =>
    Effect.succeed({
      object: { assistantMessage: "Read the new limit before reusing the old move." },
    }),
  );
  vi.mocked(runMentorPartsAgent).mockImplementation(({ shape, letters }) =>
    Effect.succeed({
      object: {
        acknowledgment: shape.acknowledgesExplanation ? "Good." : null,
        narrative: shape.opensRound ? "A new line runs colder." : null,
        parts: letters.map(() => ({
          question: "What does the limit force?",
          criterionIds: [...shape.roundCriterionIds],
          verifier: {
            ...verifier,
            checks: shape.roundCriterionIds.map((criterionId) => ({
              criterionId,
              check: "Derive the move from the new constraint.",
            })),
          },
        })),
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
            dimensionId: CRITERION,
            met: false,
            evidence: "old move",
            missing: "Account for the new limit.",
          },
        ],
      },
    }),
  );
});

const lastRound = (run: PersistedUnitRun) => {
  const step = run.cursor.steps.at(-1);
  if (step?.kind !== "round") throw new Error("Expected a round on the board.");
  return step;
};

describe("Goldilocks rating contract", () => {
  it("commits a prepared opening lesson without another model call or practice evidence", async () => {
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
    expect(runMentorLessonAgent).not.toHaveBeenCalled();
    expect(runReviewGradeAgent).not.toHaveBeenCalled();
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0]?.ratingEvaluation).toBeNull();
    expect(h.commits[0]?.scenarioPresentation).toBeNull();
    expect(h.commits[0]?.knowledgeCheckOff).toBeNull();
    expect(h.getRun().mode).toBe("teach");
    expect(h.getRun().cursor.interactionId).not.toBe(
      initial.cursor.interactionId,
    );
  });

  it("grades each exam part once and writes one rating for the round", async () => {
    const h = harness();
    await h.turn("submit_answer");
    expect(runReviewGradeAgent).toHaveBeenCalledTimes(3);
    expect(h.commits[0]?.ratingEvaluation).toMatchObject({
      scenarioAttemptId: "attempt-0",
      checksMet: 0,
      checksTotal: 3,
      wasOverTime: false,
    });
    expect(h.getRating().recentAttempts).toHaveLength(1);
    expect(h.getRun().mode).toBe("feedback");
    expect(h.getRun().difficultySnapshot).toBeNull();
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

  it("prepares the relearn part at the refreshed difficulty and serves it on Continue", async () => {
    const h = harness();
    await h.turn("submit_answer");
    const resolved = await resolveWorkspaceTurn({
      sessionId: "session-1",
      deps: h.deps,
    });
    await h.background[0]?.();
    expect(h.savePreparedStep).toHaveBeenCalledOnce();
    const prepared = h.savePreparedStep.mock.calls[0]?.[0];
    expect(prepared?.difficultySnapshot.directive).toMatchObject({
      intent: "repair",
      supportLevel: "guided",
    });
    expect(
      vi.mocked(runMentorPartsAgent).mock.calls.at(-1)?.[0].context,
    ).toContain("constraint-blindness");
    vi.mocked(runMentorPartsAgent).mockClear();

    await Effect.runPromise(
      runEducationUnitTurn({
        sessionId: "session-1",
        userId: "user-1",
        turnId: "prepared-continue",
        turnLeaseId: "prepared-lease",
        interactionId: resolved.unitRun.cursor.interactionId,
        action: "continue",
        message: "",
        turn: resolved,
        deps: h.deps,
      }).pipe(Effect.provide(h.layer)),
    );

    expect(runMentorPartsAgent).not.toHaveBeenCalled();
    expect(h.resolveDifficultyDirective).toHaveBeenCalledOnce();
    expect(lastRound(h.getRun()).spec.label).toBe("learn");
    expect(h.getRun().difficultySnapshot).toEqual(prepared?.difficultySnapshot);
    expect(h.commits.at(-1)?.scenarioPresentation).toBeNull();
  });

  it("opens the next exam at the difficulty the rated failure called for", async () => {
    const h = harness();
    vi.mocked(runReviewGradeAgent).mockImplementation(({ part: graded }) =>
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
          dimensionResults: graded.criterionIds.map((dimensionId) => ({
            dimensionId,
            met: false,
            evidence: "old move",
            missing: "Account for the new limit.",
          })),
        },
      }),
    );
    await h.turn("submit_answer");
    for (let index = 0; index < 3; index += 1) {
      await h.turn("continue");
      await h.turn("submit_answer");
    }
    await h.turn("continue");
    expect(lastRound(h.getRun()).spec.label).toBe("exam");
    expect(
      h.commits.at(-1)?.scenarioPresentation?.snapshot.directive,
    ).toMatchObject({
      intent: "repair",
      supportLevel: "guided",
      targetMisconceptionCode: "constraint-blindness",
    });
  });

  it("prepares a re-teach when the exam shows the idea was never taught", async () => {
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
    await h.background[0]?.();
    expect(h.savePreparedStep.mock.calls[0]?.[0].prepared.draft.kind).toBe(
      "lesson",
    );
    await h.turn("continue");
    expect(runMentorLessonAgent).toHaveBeenCalledOnce();
    expect(h.getRun().mode).toBe("teach");
  });

  it("falls back to foreground generation when background resolution fails", async () => {
    const h = harness();
    await h.turn("submit_answer");
    h.resolveDifficultyDirective.mockRejectedValueOnce(
      new Error("Rating read unavailable"),
    );
    await h.background[0]?.();
    expect(h.savePreparedStep).not.toHaveBeenCalled();
    expect(h.getRun().difficultySnapshot).toBeNull();
    await h.turn("continue");
    expect(runMentorPartsAgent).toHaveBeenCalledOnce();
    expect(h.getRun().difficultySnapshot?.directive.intent).toBe("repair");
  });

  it("keeps a failed difficulty read retryable without writing a stale step", async () => {
    const h = harness();
    await h.turn("submit_answer");
    h.resolveDifficultyDirective.mockRejectedValueOnce(
      new Error("Rating read unavailable"),
    );
    await expect(h.turn("continue")).rejects.toMatchObject({
      _tag: "RatingEvidenceError",
    });
    expect(h.commits).toHaveLength(1);
    expect(runMentorPartsAgent).not.toHaveBeenCalled();
    expect(h.getRun().difficultySnapshot).toBeNull();
    expect(h.deps.releaseWorkspaceUnitLease).toHaveBeenCalled();
    await h.turn("continue");
    expect(h.getRun().difficultySnapshot?.directive.intent).toBe("repair");
  });
});
